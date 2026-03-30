import { chromium, type BrowserContext, type Page } from 'rebrowser-playwright';
import type { Logger } from 'pino';
import type { TweetMetrics } from '@common/types/index.js';
import type {
  ITwitterClient,
  PostResult,
  MentionData,
} from './twitter-client.interface.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STEALTH_INIT_PATH = resolve(__dirname, '../../scripts/stealth-init.js');

/** Timeout for page navigation (ms). */
const NAVIGATION_TIMEOUT = 30_000;
/** Timeout for element selectors (ms). */
const SELECTOR_TIMEOUT = 10_000;
/** How often to check session health (ms). */
const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000;
/** Timeout for CreateTweet response interception (ms). */
const CREATE_TWEET_RESPONSE_TIMEOUT = 15_000;

export interface PlaywrightClientConfig {
  profilePath: string;
  proxyUrl: string;
  dryRun: boolean;
  logger: Logger;
  telegramToken?: string;
  adminChatId?: number | string;
}

/** Circuit breaker: disable posting after consecutive failures, auto-reset after cooldown. */
interface CircuitBreakerState {
  consecutiveFailures: number;
  firstFailureAt: number | null;
  disabledUntil: number | null;
  resetTimer: ReturnType<typeof setTimeout> | null;
}

const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const CIRCUIT_BREAKER_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Twitter client using rebrowser-playwright for browser automation.
 * Handles reply-guy posting (replies to tweets where the bot wasn't mentioned)
 * which is impossible via Twitter API v2 (returns 403).
 *
 * Uses persistent Chrome profile, ISP residential proxy, and stealth patches.
 */
export class PlaywrightTwitterClient implements ITwitterClient {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly config: PlaywrightClientConfig;
  private readonly logger: Logger;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private dailyPostCount = 0;
  private dailyPostDate = '';
  private busy = false;
  private _isLoggedIn = false;
  private _shuttingDown = false;
  private circuitBreaker: CircuitBreakerState = {
    consecutiveFailures: 0,
    firstFailureAt: null,
    disabledUntil: null,
    resetTimer: null,
  };

  constructor(config: PlaywrightClientConfig) {
    this.config = config;
    this.logger = config.logger;
  }

  get isConfigured(): boolean {
    return this.context !== null && this.page !== null && this._isLoggedIn;
  }

  /**
   * Launch persistent browser context with stealth patches.
   * Call once at startup — browser stays alive for the session.
   */
  async initialize(): Promise<void> {
    if (this.context) {
      this.logger.warn('initialize() called on already-initialized client — ignoring');
      return;
    }

    this.logger.info({ profilePath: this.config.profilePath }, 'Launching Playwright browser');

    let context: BrowserContext | null = null;
    try {
      context = await chromium.launchPersistentContext(
        this.config.profilePath,
        {
          headless: false,
          viewport: { width: 1440, height: 900 },
          proxy: this.parseProxy(this.config.proxyUrl),
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--restore-last-session',
          ],
          locale: 'en-US',
          timezoneId: 'Asia/Singapore',
        },
      );

      this.context = context;
      this.context.on('close', () => this.handleContextClose());
      await this.context.addInitScript({ path: STEALTH_INIT_PATH });
      this.page = context.pages()[0] ?? await context.newPage();
      this.page.setDefaultTimeout(SELECTOR_TIMEOUT);
      this.page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);

      // Verify session is alive
      this._isLoggedIn = await this.checkLoggedIn();
      if (!this._isLoggedIn) {
        this.logger.error('Playwright browser launched but NOT logged into Twitter — manual login required');
      } else {
        this.logger.info('Playwright Twitter client initialized — session active');
      }

      // Periodic health check
      this.healthCheckTimer = setInterval(() => {
        void this.healthCheck();
      }, HEALTH_CHECK_INTERVAL);
    } catch (error) {
      // Clean up on init failure
      if (context) {
        await context.close().catch(() => {});
      }
      this.context = null;
      this.page = null;
      throw error;
    }
  }

  async postTweet(text: string): Promise<PostResult | null> {
    if (text.length > 280) {
      this.logger.error({ charCount: text.length }, 'Tweet exceeds 280 chars — rejected');
      return null;
    }

    if (this.config.dryRun) {
      this.logger.info({ text, charCount: text.length }, '[DRY RUN] Would post tweet via Playwright');
      return { tweetId: `dry_pw_${Date.now()}` };
    }

    if (this.isDisabled) {
      this.logger.warn('postTweet blocked — circuit breaker is active');
      return null;
    }

    if (!this.page) {
      this.logger.error('Cannot post — Playwright browser not initialized');
      return null;
    }

    if (this.busy) {
      this.logger.debug('postTweet waiting — another operation in progress');
      if (!(await this.waitForIdle())) {
        this.logger.warn('postTweet skipped — busy timeout exceeded');
        return null;
      }
    }
    this.busy = true;
    try {
      await this.page.goto('https://x.com/compose/post', {
        waitUntil: 'domcontentloaded',
      });
      await this.humanDelay(2000, 4000);

      if (this.isLoginRedirect()) {
        this.logger.error('Session expired — redirected to login during postTweet');
        this._isLoggedIn = false;
        this.recordFailure();
        return null;
      }

      // Type the tweet
      const textarea = this.page.locator('[data-testid="tweetTextarea_0"]');
      await textarea.waitFor({ state: 'visible' });
      await this.hoverAndClick(textarea);
      await this.humanDelay(300, 800);
      await this.humanType(text);
      await this.humanDelay(1000, 2500);

      // Intercept CreateTweet response before clicking
      const responsePromise = this.waitForCreateTweetResponse();

      // Click post button (with fallback)
      await this.clickPostButton();
      await this.humanDelay(2000, 4000);

      const tweetId = await this.extractTweetIdFromResponse(responsePromise);
      if (!tweetId) {
        this.logger.error('Tweet posting failed — no confirmed tweet ID');
        this.recordFailure();
        return null;
      }
      if (!tweetId.startsWith('pw_unconfirmed_')) {
        this.trackPost();
        this.recordSuccess();
      }
      this.logger.info(
        { tweetId, charCount: text.length, dailyPosts: this.dailyPostCount, confirmed: !tweetId.startsWith('pw_unconfirmed_') },
        'Tweet posted via Playwright',
      );
      return { tweetId };
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to post tweet via Playwright');
      this.recordFailure();
      return null;
    } finally {
      this.busy = false;
    }
  }

  async replyToTweet(text: string, replyToId: string): Promise<PostResult | null> {
    if (text.length > 280) {
      this.logger.error({ charCount: text.length }, 'Reply exceeds 280 chars — rejected');
      return null;
    }

    if (this.config.dryRun) {
      this.logger.info(
        { text, replyToId, charCount: text.length },
        '[DRY RUN] Would reply via Playwright',
      );
      return { tweetId: `dry_pw_reply_${Date.now()}` };
    }

    if (this.isDisabled) {
      this.logger.warn({ replyToId }, 'replyToTweet blocked — circuit breaker is active');
      return null;
    }

    if (!this.page) {
      this.logger.error('Cannot reply — Playwright browser not initialized');
      return null;
    }

    if (this.busy) {
      this.logger.debug('replyToTweet waiting — another operation in progress');
      if (!(await this.waitForIdle())) {
        this.logger.warn('replyToTweet skipped — busy timeout exceeded');
        return null;
      }
    }
    this.busy = true;
    try {
      // Navigate to the target tweet
      await this.page.goto(`https://x.com/i/status/${replyToId}`, {
        waitUntil: 'domcontentloaded',
      });
      await this.humanDelay(2000, 5000);

      if (this.isLoginRedirect()) {
        this.logger.error({ replyToId }, 'Session expired — redirected to login during replyToTweet');
        this._isLoggedIn = false;
        this.recordFailure();
        return null;
      }

      // Click reply button on the tweet
      const replyButton = this.page.locator('[data-testid="reply"]').first();
      await replyButton.waitFor({ state: 'visible' });
      await this.hoverAndClick(replyButton);
      await this.humanDelay(500, 1500);

      // Type the reply (character by character for realism)
      const textarea = this.page.locator('[data-testid="tweetTextarea_0"]');
      await textarea.waitFor({ state: 'visible' });
      await this.hoverAndClick(textarea);
      await this.humanDelay(300, 800);
      await this.humanType(text);
      await this.humanDelay(1000, 3000);

      // Intercept CreateTweet response before clicking
      const responsePromise = this.waitForCreateTweetResponse();

      // Post the reply (with fallback)
      await this.clickReplyButton();
      await this.humanDelay(2000, 4000);

      const tweetId = await this.extractTweetIdFromResponse(responsePromise);
      if (!tweetId) {
        this.logger.error({ replyToId }, 'Reply posting failed — no confirmed tweet ID');
        this.recordFailure();
        return null;
      }
      if (!tweetId.startsWith('pw_unconfirmed_')) {
        this.trackPost();
        this.recordSuccess();
      }
      this.logger.info(
        { tweetId, replyToId, charCount: text.length, dailyPosts: this.dailyPostCount, confirmed: !tweetId.startsWith('pw_unconfirmed_') },
        'Reply posted via Playwright',
      );
      return { tweetId };
    } catch (error) {
      this.logger.error({ err: error, replyToId }, 'Failed to reply via Playwright');
      this.recordFailure();
      return null;
    } finally {
      this.busy = false;
    }
  }

  // Not supported — use API v2 client for reads.
  getMentions(_sinceId?: string): Promise<MentionData[]> {
    this.logger.debug('getMentions not supported by Playwright client — use API v2');
    return Promise.resolve([]);
  }

  // Not supported — use API v2 client for metrics.
  getTweetMetrics(_tweetIds: string[]): Promise<Map<string, TweetMetrics>> {
    this.logger.debug('getTweetMetrics not supported by Playwright client — use API v2');
    return Promise.resolve(new Map<string, TweetMetrics>());
  }

  async shutdown(): Promise<void> {
    this._shuttingDown = true;
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    if (this.circuitBreaker.resetTimer) {
      clearTimeout(this.circuitBreaker.resetTimer);
      this.circuitBreaker.resetTimer = null;
    }

    // Wait for active posting operation to finish (max 30s)
    const deadline = Date.now() + 30_000;
    while (this.busy && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 200));
    }
    if (this.busy) {
      this.logger.warn('Shutdown deadline reached — closing browser with active operation');
    }

    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
      this._isLoggedIn = false;
      this.logger.info('Playwright browser closed');
    }
  }

  // ─── Private ────────────────────────────────────────────

  /** Wait for busy flag to clear (max 15s). Returns true if idle, false on timeout. */
  private async waitForIdle(): Promise<boolean> {
    const deadline = Date.now() + 15_000;
    while (this.busy && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 300));
    }
    return !this.busy;
  }

  /** Parse proxy URL into Playwright's proxy config format (separate server/username/password). */
  private parseProxy(proxyUrl: string): { server: string; username?: string; password?: string } {
    try {
      const url = new URL(proxyUrl);
      const server = `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`;
      if (url.username) {
        return { server, username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) };
      }
      return { server };
    } catch {
      // Fallback: pass as-is if URL parsing fails
      return { server: proxyUrl };
    }
  }

  private isLoginRedirect(): boolean {
    if (!this.page) return false;
    const url = this.page.url();
    return url.includes('/login') || url.includes('/i/flow/login') || url.includes('/account/access');
  }

  private handleContextClose(): void {
    if (this._shuttingDown) return;
    this.logger.error('Browser context closed unexpectedly — resetting state');
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    this.context = null;
    this.page = null;
    this._isLoggedIn = false;
    this.busy = false;
  }

  private async checkLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    try {
      await this.page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(3000);
      const url = this.page.url();
      return !url.includes('/login') && !url.includes('/i/flow/login');
    } catch (error) {
      this.logger.error({ err: error }, 'Session check failed');
      return false;
    }
  }

  private async healthCheck(): Promise<void> {
    // Skip if a posting operation is in progress
    if (this.busy) {
      this.logger.debug('Health check skipped — posting operation in progress');
      return;
    }

    this.busy = true;
    try {
      this._isLoggedIn = await this.checkLoggedIn();
      if (!this._isLoggedIn) {
        this.logger.error('Twitter session expired — manual re-login required');
        void this.sendSessionExpiryAlert();
      }
    } finally {
      this.busy = false;
    }
  }

  private async sendSessionExpiryAlert(): Promise<void> {
    const { telegramToken, adminChatId } = this.config;
    if (!telegramToken || !adminChatId) return;
    try {
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: adminChatId,
          text: '🔑 <b>Session expired</b>\n\nPlaywright lost Twitter login. Posting will fail until manual re-login via VNC.',
          parse_mode: 'HTML',
        }),
      });
    } catch {
      this.logger.warn('Failed to send session expiry Telegram alert');
    }
  }

  /**
   * Set up response interception for Twitter's CreateTweet GraphQL mutation.
   * Intercepts ALL statuses (not just 200) so we can distinguish real failures
   * from timeouts. Must be called BEFORE clicking the post/reply button.
   */
  private waitForCreateTweetResponse(): Promise<{ status: number; json: unknown } | null> {
    if (!this.page) return Promise.resolve(null);
    return this.page.waitForResponse(
      (resp) => resp.url().includes('CreateTweet'),
      { timeout: CREATE_TWEET_RESPONSE_TIMEOUT },
    ).then(async (resp) => {
      try {
        const json = await resp.json() as unknown;
        return { status: resp.status(), json };
      } catch {
        return { status: resp.status(), json: null };
      }
    }).catch((error) => {
      this.logger.warn({ err: error }, 'CreateTweet response interception timed out');
      return null;
    });
  }

  /**
   * Extract tweet ID from intercepted CreateTweet GraphQL response.
   * Returns null if the tweet was not posted (non-200, error in body, timeout).
   * Only returns a real tweet ID on confirmed success.
   */
  private async extractTweetIdFromResponse(
    responsePromise: Promise<{ status: number; json: unknown } | null>,
  ): Promise<string | null> {
    const result = await responsePromise;

    // Network timeout — tweet may or may not have been posted.
    // Return synthetic ID so QueueManager doesn't permanently fail the item,
    // but callers should NOT call trackPost() for unconfirmed posts.
    if (!result) {
      this.logger.warn('CreateTweet interception timed out — tweet status unknown');
      return `pw_unconfirmed_${Date.now()}`;
    }

    // Non-200 status — tweet was NOT posted
    if (result.status !== 200) {
      this.logger.error(
        { status: result.status },
        'CreateTweet returned non-200 — tweet not posted',
      );
      return null;
    }

    // 200 but check for errors in JSON body (Twitter sometimes does this)
    if (result.json && typeof result.json === 'object') {
      const data = result.json as Record<string, unknown>;

      if ('errors' in data && Array.isArray(data['errors']) && data['errors'].length > 0) {
        this.logger.error(
          { errors: data['errors'] },
          'CreateTweet returned 200 with errors in body — tweet not posted',
        );
        return null;
      }

      // Navigate nested GraphQL response: data.create_tweet.tweet_results.result.rest_id
      const createTweet = (data['data'] as Record<string, unknown> | undefined);
      const tweetResults = (createTweet?.['create_tweet'] as Record<string, unknown> | undefined);
      const restResult = (tweetResults?.['tweet_results'] as Record<string, unknown> | undefined);
      const restId = (restResult?.['result'] as Record<string, unknown> | undefined)?.['rest_id'];

      if (typeof restId === 'string' && restId.length > 0) {
        return restId;
      }

      this.logger.warn({ responseKeys: Object.keys(data) }, 'CreateTweet response missing rest_id');
    }

    return null;
  }

  /**
   * Click the post button with fallback selectors.
   * Primary: tweetButton (compose page). Fallback: tweetButtonInline.
   */
  private async clickPostButton(): Promise<void> {
    if (!this.page) return;

    const primary = this.page.locator('[data-testid="tweetButton"]');
    const fallback = this.page.locator('[data-testid="tweetButtonInline"]');

    if (await primary.isVisible({ timeout: 2000 }).catch(() => false)) {
      await this.hoverAndClick(primary);
    } else if (await fallback.isVisible({ timeout: 2000 }).catch(() => false)) {
      this.logger.debug('tweetButton not found, using tweetButtonInline fallback');
      await this.hoverAndClick(fallback);
    } else {
      throw new Error('No post button found — Twitter UI may have changed');
    }
  }

  /**
   * Click the reply button with fallback selectors.
   * Primary: tweetButtonInline (reply dialog). Fallback: tweetButton.
   */
  private async clickReplyButton(): Promise<void> {
    if (!this.page) return;

    const primary = this.page.locator('[data-testid="tweetButtonInline"]');
    const fallback = this.page.locator('[data-testid="tweetButton"]');

    if (await primary.isVisible({ timeout: 2000 }).catch(() => false)) {
      await this.hoverAndClick(primary);
    } else if (await fallback.isVisible({ timeout: 2000 }).catch(() => false)) {
      this.logger.debug('tweetButtonInline not found, using tweetButton fallback');
      await this.hoverAndClick(fallback);
    } else {
      throw new Error('No reply button found — Twitter UI may have changed');
    }
  }

  /**
   * Hover over an element before clicking to simulate human mouse movement.
   * Twitter tracks mouse events — instant teleport clicks are a detection signal.
   */
  private async hoverAndClick(locator: ReturnType<Page['locator']>): Promise<void> {
    await locator.hover();
    await this.humanDelay(100, 400);
    await locator.click();
  }

  // ─── Keystroke Dynamics ──────────────────────────────────
  // Log-normal IKI distribution matching real human typing data.
  // Based on Aalto University dataset (136M keystrokes, CHI 2018):
  //   Mean IKI: 238.7ms, σ: 111.6ms, distribution: log-normal/log-logistic.
  //   Fastest typists: IKI ~120ms, σ ~11ms. Physical minimum: ~60ms.
  // FCaptcha v1.3 checks: KS-test for log-normality, lag-1 autocorrelation,
  // Shannon entropy, burst regularity — uniform random fails all of these.

  /** Common bigram pairs typed faster due to motor memory. */
  private static readonly FAST_BIGRAMS = new Set([
    'th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd',
    'ti', 'es', 'or', 'te', 'of', 'ed', 'is', 'it', 'al', 'ar',
    'st', 'to', 'nt', 'ng', 'se', 'ha', 'ou', 'io', 'le', 've',
  ]);

  /**
   * Generate a log-normal random value using Box-Muller transform.
   * Returns delay in milliseconds, clamped to [55, 650].
   */
  private logNormalIKI(mu: number, sigma: number): number {
    // Box-Muller: two uniform randoms → one normal variate
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
    const value = Math.exp(mu + sigma * z);
    // Clamp to physiologically plausible range
    return Math.max(55, Math.min(650, value));
  }

  /**
   * Type text character-by-character with human-like inter-key intervals.
   *
   * - Base WPM 50-65 (log-normal distribution, not uniform)
   * - Word boundary pauses: space adds 80-200ms (motor planning)
   * - Bigram acceleration: common pairs typed 30-40% faster
   * - IKI clamped to [55ms, 650ms] — outside is physiologically implausible
   */
  private async humanType(text: string): Promise<void> {
    if (!this.page) return;

    // Log-normal parameters for ~55-65 WPM casual typing
    // ln(180) ≈ 5.19, σ ≈ 0.35 gives mean ~190ms with natural spread
    const mu = 5.19;
    const sigma = 0.35;

    let prevChar = '';
    for (const char of text) {
      let delay = this.logNormalIKI(mu, sigma);

      // Word boundary: space/punctuation adds motor planning pause
      if (char === ' ') {
        delay += 80 + Math.random() * 120; // +80-200ms
      } else if ('.!?,;:'.includes(char)) {
        delay += 50 + Math.random() * 100; // +50-150ms (punctuation pause)
      }

      // Bigram acceleration: common pairs are typed faster
      if (prevChar && PlaywrightTwitterClient.FAST_BIGRAMS.has((prevChar + char).toLowerCase())) {
        delay *= 0.65 + Math.random() * 0.1; // 30-35% faster
      }

      // Final clamp after all adjustments
      delay = Math.max(55, Math.min(650, delay));

      await new Promise<void>((r) => setTimeout(r, delay));
      await this.page.keyboard.type(char);
      prevChar = char;
    }
  }

  private async humanDelay(min: number, max: number): Promise<void> {
    const delay = min + Math.random() * (max - min);
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }

  /** Whether the circuit breaker has tripped (too many consecutive failures). */
  get isDisabled(): boolean {
    const cb = this.circuitBreaker;
    return cb.disabledUntil !== null && Date.now() < cb.disabledUntil;
  }

  /** Record a posting failure. Trips circuit breaker after CIRCUIT_BREAKER_THRESHOLD failures within the window. */
  private recordFailure(): void {
    const cb = this.circuitBreaker;
    const now = Date.now();

    // Reset counter if first failure was outside the window
    if (cb.firstFailureAt && now - cb.firstFailureAt > CIRCUIT_BREAKER_WINDOW_MS) {
      cb.consecutiveFailures = 0;
      cb.firstFailureAt = null;
    }

    if (!cb.firstFailureAt) cb.firstFailureAt = now;
    cb.consecutiveFailures++;

    if (cb.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      cb.disabledUntil = now + CIRCUIT_BREAKER_COOLDOWN_MS;
      this.logger.error(
        { failures: cb.consecutiveFailures, cooldownHours: CIRCUIT_BREAKER_COOLDOWN_MS / 3_600_000 },
        'Circuit breaker tripped — Playwright posting disabled',
      );
      void this.sendCircuitBreakerAlert(cb.consecutiveFailures);

      // Auto-reset after cooldown
      if (cb.resetTimer) clearTimeout(cb.resetTimer);
      cb.resetTimer = setTimeout(() => {
        this.resetCircuitBreaker();
        this.logger.info('Circuit breaker auto-reset after cooldown');
      }, CIRCUIT_BREAKER_COOLDOWN_MS);
    }
  }

  /** Record a successful post — resets the consecutive failure counter. */
  private recordSuccess(): void {
    const cb = this.circuitBreaker;
    cb.consecutiveFailures = 0;
    cb.firstFailureAt = null;
  }

  /** Manually reset the circuit breaker (e.g. from admin command). */
  resetCircuitBreaker(): void {
    const cb = this.circuitBreaker;
    cb.consecutiveFailures = 0;
    cb.firstFailureAt = null;
    cb.disabledUntil = null;
    if (cb.resetTimer) {
      clearTimeout(cb.resetTimer);
      cb.resetTimer = null;
    }
  }

  private async sendCircuitBreakerAlert(failures: number): Promise<void> {
    const { telegramToken, adminChatId } = this.config;
    if (!telegramToken || !adminChatId) return;
    try {
      const cooldownHours = CIRCUIT_BREAKER_COOLDOWN_MS / 3_600_000;
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: adminChatId,
          text: `🔴 <b>Circuit breaker tripped</b>\n\n${String(failures)} consecutive Playwright failures.\nPosting disabled for ${String(cooldownHours)}h.\n\nUse /replyguy reset to override.`,
          parse_mode: 'HTML',
        }),
      });
    } catch {
      this.logger.warn('Failed to send circuit breaker Telegram alert');
    }
  }

  private trackPost(): void {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    if (this.dailyPostDate !== today) {
      this.dailyPostCount = 0;
      this.dailyPostDate = today;
    }
    this.dailyPostCount++;
  }
}

import { chromium, type BrowserContext, type Page } from 'patchright';
import type { Logger } from 'pino';
import type { TweetMetrics } from '@common/types/index.js';
import type {
  ITwitterClient,
  PostResult,
  MentionData,
} from './twitter-client.interface.js';
import { twitterWeightedLength } from '@common/utils/tweet-text.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

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

export interface TwitterBrowserCookies {
  authToken: string;
  ct0: string;
  twid: string;
  kdt?: string;
}

export interface PlaywrightClientConfig {
  profilePath: string;
  proxyUrl: string;
  dryRun: boolean;
  logger: Logger;
  telegramToken?: string;
  adminChatId?: number | string;
  cookies?: TwitterBrowserCookies;
  chromeExecutablePath?: string;
  timezoneId?: string;
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
/** Max auto-restarts within one hour before giving up. */
const MAX_AUTO_RESTARTS = 3;
const AUTO_RESTART_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Twitter client using patchright for browser automation.
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
  private _restartCount = 0;
  private _restartWindowStart = 0;
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
      const launchOptions: Parameters<typeof chromium.launchPersistentContext>[1] = {
        headless: false,
        viewport: { width: 1440, height: 900 },
        proxy: this.parseProxy(this.config.proxyUrl),
        ignoreDefaultArgs: [
          '--enable-automation',
          '--disable-component-update',
        ],
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-infobars',
          '--no-first-run',
          '--no-default-browser-check',
          '--restore-last-session',
          // WebRTC: prevent real IP leak through STUN/TURN (belt-and-suspenders with stealth-init.js)
          '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
          '--disable-features=WebRtcHideLocalIpsWithMdns',
        ],
        locale: 'en-US',
        timezoneId: this.config.timezoneId ?? 'Asia/Singapore',
      };

      // Prefer Chrome Stable over Playwright Chromium (real Google API keys, proper TLS fingerprint)
      if (this.config.chromeExecutablePath) {
        launchOptions.executablePath = this.config.chromeExecutablePath;
      } else {
        launchOptions.channel = 'chrome';
      }

      context = await chromium.launchPersistentContext(
        this.config.profilePath,
        launchOptions,
      );

      this.context = context;
      this.context.on('close', () => this.handleContextClose());
      await this.context.addInitScript({ path: STEALTH_INIT_PATH });
      this.page = context.pages()[0] ?? await context.newPage();
      this.page.setDefaultTimeout(SELECTOR_TIMEOUT);
      this.page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);

      // Verify session — persistent profile → saved storage state → injected cookies
      this._isLoggedIn = (await this.checkLoggedIn()) === 'logged_in';
      if (!this._isLoggedIn) {
        // Try loading saved storage state (created on clean shutdown)
        const storageStatePath = resolve(this.config.profilePath, 'storage-state.json');
        if (existsSync(storageStatePath)) {
          try {
            this.logger.info('Session not found in profile — loading saved storage state');
            await this.loadStorageState(storageStatePath);
            this._isLoggedIn = (await this.checkLoggedIn()) === 'logged_in';
          } catch (err) {
            this.logger.warn({ err }, 'Failed to load storage state');
          }
        }
      }
      if (!this._isLoggedIn && this.config.cookies) {
        this.logger.info('Session not found — injecting cookies from env');
        await this.injectCookies(this.config.cookies);
        this._isLoggedIn = (await this.checkLoggedIn()) === 'logged_in';
      }

      if (!this._isLoggedIn) {
        this.logger.error('Playwright browser launched but NOT logged into Twitter — provide valid cookies or login manually');
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
    const weighted = twitterWeightedLength(text);
    if (weighted > 280) {
      this.logger.error({ charCount: text.length, weightedCount: weighted }, 'Tweet exceeds 280 weighted chars — rejected');
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
        this.recordFailure(true);
        return null;
      }

      // Type the tweet
      const textarea = this.page.locator(
        '[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea_0_label"] [role="textbox"], [role="dialog"] [role="textbox"]',
      ).first();
      await textarea.waitFor({ state: 'visible', timeout: 15_000 });
      await this.hoverAndClick(textarea);
      await this.humanDelay(300, 800);
      await this.humanType(text);
      await this.humanDelay(1000, 2500);

      // Intercept CreateTweet response before clicking
      const responsePromise = this.waitForCreateTweetResponse();

      // Click post button (with fallback)
      await this.clickPostButton();
      await this.humanDelay(2000, 4000);

      const { tweetId, permanent } = await this.extractTweetIdFromResponse(responsePromise);
      if (!tweetId) {
        this.logger.error('Tweet posting failed — no confirmed tweet ID');
        this.recordFailure(permanent);
        return null;
      }
      if (!tweetId.startsWith('pw_unconfirmed_')) {
        this.trackPost();
        this.recordSuccess();
      }
      this.logger.info(
        { tweetId, charCount: text.length, weightedCount: weighted, dailyPosts: this.dailyPostCount, confirmed: !tweetId.startsWith('pw_unconfirmed_') },
        'Tweet posted via Playwright',
      );
      return { tweetId };
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to post tweet via Playwright');
      await this.captureAndSendScreenshot('postTweet');
      this.recordFailure();
      return null;
    } finally {
      this.busy = false;
    }
  }

  async replyToTweet(text: string, replyToId: string): Promise<PostResult | null> {
    const weighted = twitterWeightedLength(text);
    if (weighted > 280) {
      this.logger.error({ charCount: text.length, weightedCount: weighted, replyToId }, 'Reply exceeds 280 weighted chars — rejected');
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
      // Navigate to the target tweet and wait for React render
      const replyButton = await this.navigateAndFindReply(replyToId);
      if (!replyButton) return null;

      await this.hoverAndClick(replyButton);
      await this.humanDelay(500, 1500);

      // Type the reply (character by character for realism)
      // Try testid first, then fall back to role="textbox" (Twitter changes testids periodically)
      const textarea = this.page.locator(
        '[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea_0_label"] [role="textbox"], [role="dialog"] [role="textbox"]',
      ).first();
      await textarea.waitFor({ state: 'visible', timeout: 15_000 });
      await this.hoverAndClick(textarea);
      await this.humanDelay(300, 800);
      await this.humanType(text);
      await this.humanDelay(1000, 3000);

      // Intercept CreateTweet response before clicking
      const responsePromise = this.waitForCreateTweetResponse();

      // Post the reply (with fallback)
      await this.clickReplyButton();
      await this.humanDelay(2000, 4000);

      const { tweetId, permanent } = await this.extractTweetIdFromResponse(responsePromise);
      if (!tweetId) {
        this.logger.error({ replyToId }, 'Reply posting failed — no confirmed tweet ID');
        this.recordFailure(permanent);
        return null;
      }
      if (!tweetId.startsWith('pw_unconfirmed_')) {
        this.trackPost();
        this.recordSuccess();
      }
      this.logger.info(
        { tweetId, replyToId, charCount: text.length, weightedCount: weighted, dailyPosts: this.dailyPostCount, confirmed: !tweetId.startsWith('pw_unconfirmed_') },
        'Reply posted via Playwright',
      );
      return { tweetId };
    } catch (error) {
      this.logger.error({ err: error, replyToId }, 'Failed to reply via Playwright');
      await this.captureAndSendScreenshot('replyToTweet', replyToId);
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
      // Save session state before closing (prevents cookie loss on pm2 restart)
      try {
        await this.context.storageState({
          path: resolve(this.config.profilePath, 'storage-state.json'),
        });
        this.logger.info('Session state saved');
      } catch (err) {
        this.logger.warn({ err }, 'Failed to save session state');
      }
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

  /**
   * Navigate to a tweet and locate the reply button with retry logic.
   *
   * Handles: slow page loads via proxy, deleted/suspended tweets, sensitive
   * content interstitials, and transient render failures (one page refresh).
   * Returns the reply button locator, or null if tweet is unavailable / unreachable.
   */
  private async navigateAndFindReply(
    replyToId: string,
  ): Promise<ReturnType<Page['locator']> | null> {
    if (!this.page) return null;

    await this.page.goto(`https://x.com/i/status/${replyToId}`, {
      waitUntil: 'domcontentloaded',
    });
    await this.humanDelay(2000, 5000);

    if (this.isLoginRedirect()) {
      this.logger.error({ replyToId }, 'Session expired — redirected to login during replyToTweet');
      this._isLoggedIn = false;
      this.recordFailure(true);
      return null;
    }

    // Wait for React to render tweet content (confirms page actually loaded, not just DOM)
    const contentSelector = '[data-testid="tweetText"], [data-testid="tweet"], [data-testid="tombstone"]';
    const contentVisible = await this.page.locator(contentSelector).first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true).catch(() => false);

    if (!contentVisible) {
      // Page didn't render — try one refresh before giving up
      this.logger.warn({ replyToId }, 'Tweet content not visible — refreshing page');
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.humanDelay(3000, 5000);

      const retryVisible = await this.page.locator(contentSelector).first()
        .waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => true).catch(() => false);

      if (!retryVisible) {
        this.logger.error({ replyToId, url: this.page.url() }, 'Tweet still not visible after refresh');
        await this.captureAndSendScreenshot('replyToTweet-no-content', replyToId);
        this.recordFailure();
        return null;
      }
    }

    // Check for deleted / suspended / unavailable tweet (tombstone shown instead of tweet)
    if (await this.isTweetUnavailable()) {
      this.logger.warn({ replyToId }, 'Tweet unavailable (deleted/suspended) — skipping reply');
      return null; // Not a Playwright failure — don't record or trip circuit breaker
    }

    // Dismiss sensitive content warning if present
    await this.dismissSensitiveWarning();

    // Find reply button with generous timeout (action bar renders after tweet text)
    const replyButton = this.page.locator('[data-testid="reply"]').first();
    const found = await replyButton.waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true).catch(() => false);

    if (found) return replyButton;

    // Reply button missing despite tweet visible — one more refresh attempt
    this.logger.warn({ replyToId }, 'Reply button not found — refreshing page for retry');
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.humanDelay(3000, 5000);
    await this.dismissSensitiveWarning();

    const retryButton = this.page.locator('[data-testid="reply"]').first();
    const retryFound = await retryButton.waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true).catch(() => false);

    if (retryFound) return retryButton;

    this.logger.error({ replyToId, url: this.page.url() }, 'Reply button not found after retry');
    await this.captureAndSendScreenshot('replyToTweet-no-reply-btn', replyToId);
    this.recordFailure();
    return null;
  }

  /** Check if the current page shows a tombstone or "unavailable" message instead of a tweet. */
  private async isTweetUnavailable(): Promise<boolean> {
    if (!this.page) return false;
    const tombstone = await this.page.locator('[data-testid="tombstone"]').count().catch(() => 0);
    if (tombstone > 0) return true;

    const mainText = await this.page.locator('main').textContent({ timeout: 2_000 }).catch(() => '');
    return /doesn.t exist|has been deleted|suspended|unavailable|this account doesn/i.test(mainText ?? '');
  }

  /** Dismiss Twitter's sensitive content interstitial if present. */
  private async dismissSensitiveWarning(): Promise<void> {
    if (!this.page) return;
    // Twitter shows a "View" button over sensitive content
    const viewBtn = this.page.locator('[data-testid="tweet"] button, [role="button"]')
      .filter({ hasText: /^View$/ }).first();
    const visible = await viewBtn.isVisible().catch(() => false);
    if (visible) {
      this.logger.info('Dismissing sensitive content warning');
      await viewBtn.click().catch(() => {});
      await this.humanDelay(1000, 2000);
    }
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

  /** Detect login, suspension, and challenge redirects that prevent normal operation. */
  private isLoginRedirect(): boolean {
    if (!this.page) return false;
    const url = this.page.url();
    return (
      url.includes('/login') ||
      url.includes('/i/flow/login') ||
      url.includes('/account/access') ||
      url.includes('/i/flow/suspended') ||
      url.includes('/account/suspended') ||
      url.includes('/i/flow/consent') ||
      url.includes('/i/flow/verify_password')
    );
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

    // Auto-restart with limit (max 3/hour to prevent infinite loop)
    const now = Date.now();
    if (now - this._restartWindowStart > AUTO_RESTART_WINDOW_MS) {
      this._restartCount = 0;
      this._restartWindowStart = now;
    }
    this._restartCount++;

    if (this._restartCount <= MAX_AUTO_RESTARTS) {
      void this.sendBrowserCrashAlert();
      this.logger.warn(
        { attempt: this._restartCount, max: MAX_AUTO_RESTARTS },
        'Browser auto-restart scheduled',
      );
      setTimeout(() => {
        void this.initialize().catch((err) => {
          this.logger.error({ err }, 'Browser auto-restart failed');
        });
      }, 5000);
    } else {
      this.logger.error('Browser restart limit reached — manual intervention required');
      void this.sendBrowserCrashAlert(true);
    }
  }

  /**
   * Returns 'logged_in', 'session_expired', or 'error' (timeout/network/crash).
   * Only 'session_expired' means an actual login redirect was detected.
   */
  private async checkLoggedIn(): Promise<'logged_in' | 'session_expired' | 'error'> {
    if (!this.page) return 'error';
    try {
      await this.page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
      await this.page.waitForSelector(
        '[data-testid="primaryColumn"], [data-testid="loginButton"], [href="/login"]',
        { timeout: 5_000 },
      ).catch(() => {});
      const url = this.page.url();
      const isLoginPage = url.includes('/login') || url.includes('/i/flow/login');
      return isLoginPage ? 'session_expired' : 'logged_in';
    } catch (error) {
      this.logger.warn({ err: error }, 'Health check navigation failed (timeout or network issue)');
      return 'error';
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
      const status = await this.checkLoggedIn();
      if (status === 'session_expired') {
        this._isLoggedIn = false;
        this.logger.error('Twitter session expired — redirected to login page');
        void this.sendSessionExpiryAlert();
      } else if (status === 'error') {
        // Don't change _isLoggedIn on transient errors — assume still logged in
        this.logger.warn('Health check inconclusive (timeout/crash) — skipping session alert');
      }
      // status === 'logged_in' → no action needed, _isLoggedIn stays true
    } finally {
      this.busy = false;
    }
  }

  /** Load cookies from a previously saved storage state file (created on clean shutdown). */
  private async loadStorageState(path: string): Promise<void> {
    if (!this.context) return;
    const raw = readFileSync(path, 'utf-8');
    const state = JSON.parse(raw) as { cookies?: Array<{ name: string; value: string; domain: string; path: string; secure: boolean; httpOnly: boolean; sameSite: string }> };
    if (state.cookies && state.cookies.length > 0) {
      await this.context.addCookies(
        state.cookies.map((c) => ({
          ...c,
          sameSite: (c.sameSite as 'None' | 'Lax' | 'Strict') || 'None',
        })),
      );
      this.logger.info({ cookieCount: state.cookies.length }, 'Storage state cookies restored');
    }
  }

  /** Inject browser cookies to establish Twitter session without login flow. */
  private async injectCookies(cookies: TwitterBrowserCookies): Promise<void> {
    if (!this.context) return;

    const cookieEntries: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      secure: boolean;
      httpOnly: boolean;
      sameSite: 'None' | 'Lax' | 'Strict';
    }> = [
      { name: 'auth_token', value: cookies.authToken, domain: '.x.com', path: '/', secure: true, httpOnly: true, sameSite: 'None' },
      { name: 'ct0', value: cookies.ct0, domain: '.x.com', path: '/', secure: true, httpOnly: false, sameSite: 'Lax' },
      { name: 'twid', value: cookies.twid, domain: '.x.com', path: '/', secure: true, httpOnly: false, sameSite: 'None' },
    ];
    if (cookies.kdt) {
      cookieEntries.push({ name: 'kdt', value: cookies.kdt, domain: '.x.com', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' });
    }

    // Also set on .twitter.com for backward compatibility
    const twitterDomainCookies = cookieEntries.map((c) => ({ ...c, domain: '.twitter.com' }));

    await this.context.addCookies([...cookieEntries, ...twitterDomainCookies]);
    this.logger.info({ cookieCount: cookieEntries.length }, 'Twitter cookies injected');
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

  private async sendBrowserCrashAlert(restartLimitReached = false): Promise<void> {
    const { telegramToken, adminChatId } = this.config;
    if (!telegramToken || !adminChatId) return;
    try {
      const text = restartLimitReached
        ? `🔴 <b>Browser crashed — restart limit reached</b>\n\n${String(MAX_AUTO_RESTARTS)} restarts in 1h. Posting is down.\nManual intervention required (pm2 restart or VNC).`
        : `💥 <b>Browser crashed</b>\n\nPlaywright context closed unexpectedly.\nAuto-restarting (${String(this._restartCount)}/${String(MAX_AUTO_RESTARTS)})...`;
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: adminChatId, text, parse_mode: 'HTML' }),
      });
    } catch {
      this.logger.warn('Failed to send browser crash Telegram alert');
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
   * Returns tweetId (string or null) and whether the failure is permanent
   * (non-200 status, Error 226, account issues) vs transient (timeout, malformed).
   */
  private async extractTweetIdFromResponse(
    responsePromise: Promise<{ status: number; json: unknown } | null>,
  ): Promise<{ tweetId: string | null; permanent: boolean }> {
    const result = await responsePromise;

    // Network timeout — tweet may or may not have been posted.
    // Return synthetic ID so QueueManager doesn't permanently fail the item,
    // but callers should NOT call trackPost() for unconfirmed posts.
    if (!result) {
      this.logger.warn('CreateTweet interception timed out — tweet status unknown');
      return { tweetId: `pw_unconfirmed_${Date.now()}`, permanent: false };
    }

    // Non-200 status — tweet was NOT posted (likely blocked, 226, or rate-limited)
    if (result.status !== 200) {
      this.logger.error(
        { status: result.status },
        'CreateTweet returned non-200 — tweet not posted',
      );
      return { tweetId: null, permanent: true };
    }

    // 200 but check for errors in JSON body (Twitter sometimes does this)
    if (result.json && typeof result.json === 'object') {
      const data = result.json as Record<string, unknown>;

      if ('errors' in data && Array.isArray(data['errors']) && data['errors'].length > 0) {
        this.logger.error(
          { errors: data['errors'] },
          'CreateTweet returned 200 with errors in body — tweet not posted',
        );
        return { tweetId: null, permanent: true };
      }

      // Navigate nested GraphQL response: data.create_tweet.tweet_results.result.rest_id
      const createTweet = (data['data'] as Record<string, unknown> | undefined);
      const tweetResults = (createTweet?.['create_tweet'] as Record<string, unknown> | undefined);
      const restResult = (tweetResults?.['tweet_results'] as Record<string, unknown> | undefined);
      const restId = (restResult?.['result'] as Record<string, unknown> | undefined)?.['rest_id'];

      if (typeof restId === 'string' && restId.length > 0) {
        return { tweetId: restId, permanent: false };
      }

      this.logger.warn({ responseKeys: Object.keys(data) }, 'CreateTweet response missing rest_id');
    }

    return { tweetId: null, permanent: false };
  }

  /**
   * Click the post button — finds first enabled submit button on page.
   */
  private async clickPostButton(): Promise<void> {
    await this.clickSubmitButton('post');
  }

  /**
   * Click the reply button — finds first enabled submit button on page.
   */
  private async clickReplyButton(): Promise<void> {
    await this.clickSubmitButton('reply');
  }

  /**
   * Find and click the first ENABLED submit button on the page.
   *
   * Twitter has two submit button testids:
   * - tweetButton: used on compose/post page and compose dialog overlay
   * - tweetButtonInline: used for inline reply on status pages
   *
   * When clicking reply on a tweet, Twitter may open a compose dialog overlay.
   * In that case BOTH buttons exist: tweetButton (enabled, in dialog) and
   * tweetButtonInline (disabled, on status page behind dialog).
   * We must find the ENABLED one, not just the first visible one.
   */
  private async clickSubmitButton(context: 'post' | 'reply'): Promise<void> {
    if (!this.page) return;

    const url = this.page.url();

    // Diagnostic: enumerate ALL submit buttons and their states
    const allButtons = this.page.locator(
      '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]',
    );
    const buttonCount = await allButtons.count().catch(() => 0);
    const diagnostics: Array<{ index: number; testid: string | null; disabled: string | null; visible: boolean }> = [];

    for (let i = 0; i < buttonCount; i++) {
      const btn = allButtons.nth(i);
      diagnostics.push({
        index: i,
        testid: await btn.getAttribute('data-testid').catch(() => null),
        disabled: await btn.getAttribute('aria-disabled').catch(() => null),
        visible: await btn.isVisible().catch(() => false),
      });
    }

    this.logger.info(
      { context, url, buttonCount, buttons: diagnostics },
      'Submit button diagnostics',
    );

    // Strategy: find first ENABLED + VISIBLE button, with 5s retry
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      for (let i = 0; i < buttonCount; i++) {
        const btn = allButtons.nth(i);
        const visible = await btn.isVisible().catch(() => false);
        if (!visible) continue;
        const disabled = await btn.getAttribute('aria-disabled').catch(() => null);
        if (disabled !== 'true') {
          const testid = await btn.getAttribute('data-testid').catch(() => 'unknown');
          this.logger.info({ testid, index: i }, 'Clicking enabled submit button');
          await this.hoverAndClick(btn);
          return;
        }
      }
      await new Promise<void>((r) => setTimeout(r, 300));
    }

    // All buttons disabled — collect debug info and fail
    const charInfo = await this.getTextareaCharInfo();
    throw new Error(
      `No enabled ${context} button found after 5s — url: ${url}, buttons: ${JSON.stringify(diagnostics)}, ${charInfo}`,
    );
  }

  /** Read textarea content and URL for debugging submit button issues. */
  private async getTextareaCharInfo(): Promise<string> {
    if (!this.page) return 'no page';
    try {
      const textContent = await this.page
        .locator('[data-testid="tweetTextarea_0"] [data-text="true"]')
        .allTextContents()
        .catch(() => []);
      const typed = textContent.join('');
      return `${String(typed.length)} chars in textarea`;
    } catch {
      return 'could not read textarea';
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

  /**
   * Record a posting failure. Trips circuit breaker after CIRCUIT_BREAKER_THRESHOLD
   * transient failures within the window, or immediately on permanent errors.
   *
   * @param permanent - true for errors that won't resolve on retry (226, suspended, 403)
   */
  private recordFailure(permanent = false): void {
    const cb = this.circuitBreaker;
    const now = Date.now();

    if (permanent) {
      // Permanent error → trip immediately (ban, suspension, Error 226)
      cb.consecutiveFailures = CIRCUIT_BREAKER_THRESHOLD;
      cb.firstFailureAt = now;
    } else {
      // Transient error → normal counting
      if (cb.firstFailureAt && now - cb.firstFailureAt > CIRCUIT_BREAKER_WINDOW_MS) {
        cb.consecutiveFailures = 0;
        cb.firstFailureAt = null;
      }
      if (!cb.firstFailureAt) cb.firstFailureAt = now;
      cb.consecutiveFailures++;
    }

    if (cb.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      cb.disabledUntil = now + CIRCUIT_BREAKER_COOLDOWN_MS;
      this.logger.error(
        { failures: cb.consecutiveFailures, permanent, cooldownHours: CIRCUIT_BREAKER_COOLDOWN_MS / 3_600_000 },
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

  /** Capture a screenshot and send it to Telegram admin for debugging. */
  private async captureAndSendScreenshot(context: string, tweetId?: string): Promise<void> {
    try {
      if (!this.page) return;
      const buffer = await this.page.screenshot({ fullPage: false });
      const { telegramToken, adminChatId } = this.config;
      if (!telegramToken || !adminChatId) {
        this.logger.warn('No Telegram config — screenshot not sent');
        return;
      }
      const caption = `🖥 Playwright failure: ${context}${tweetId ? ` (tweet ${tweetId})` : ''}\nURL: ${this.page.url()}`;
      const formData = new FormData();
      formData.append('chat_id', String(adminChatId));
      formData.append('caption', caption);
      formData.append('photo', new Blob([new Uint8Array(buffer)], { type: 'image/png' }), 'screenshot.png');
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendPhoto`, {
        method: 'POST',
        body: formData,
      });
    } catch {
      this.logger.warn('Failed to capture/send debug screenshot');
    }
  }
}

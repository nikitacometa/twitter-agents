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

/** Delay per character when typing (ms). */
const TYPING_DELAY_MS = 45;
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
}

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
          proxy: { server: this.config.proxyUrl },
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--restore-last-session',
          ],
          locale: 'en-US',
          timezoneId: 'America/New_York',
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
        return null;
      }

      // Type the tweet
      const textarea = this.page.locator('[data-testid="tweetTextarea_0"]');
      await textarea.waitFor({ state: 'visible' });
      await this.hoverAndClick(textarea);
      await this.humanDelay(300, 800);
      await textarea.pressSequentially(text, { delay: TYPING_DELAY_MS });
      await this.humanDelay(1000, 2500);

      // Intercept CreateTweet response before clicking
      const responsePromise = this.waitForCreateTweetResponse();

      // Click post button (with fallback)
      await this.clickPostButton();
      await this.humanDelay(2000, 4000);

      const tweetId = await this.extractTweetIdFromResponse(responsePromise);
      this.trackPost();
      this.logger.info(
        { tweetId, charCount: text.length, dailyPosts: this.dailyPostCount },
        'Tweet posted via Playwright',
      );
      return { tweetId };
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to post tweet via Playwright');
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
      await textarea.pressSequentially(text, { delay: TYPING_DELAY_MS });
      await this.humanDelay(1000, 3000);

      // Intercept CreateTweet response before clicking
      const responsePromise = this.waitForCreateTweetResponse();

      // Post the reply (with fallback)
      await this.clickReplyButton();
      await this.humanDelay(2000, 4000);

      const tweetId = await this.extractTweetIdFromResponse(responsePromise);
      this.trackPost();
      this.logger.info(
        { tweetId, replyToId, charCount: text.length, dailyPosts: this.dailyPostCount },
        'Reply posted via Playwright',
      );
      return { tweetId };
    } catch (error) {
      this.logger.error({ err: error, replyToId }, 'Failed to reply via Playwright');
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
        // TODO: send Telegram alert via admin bot
      }
    } finally {
      this.busy = false;
    }
  }

  /**
   * Set up response interception for Twitter's CreateTweet GraphQL mutation.
   * Must be called BEFORE clicking the post/reply button.
   */
  private waitForCreateTweetResponse(): Promise<unknown> {
    if (!this.page) return Promise.resolve(null);
    return this.page.waitForResponse(
      (resp) => resp.url().includes('CreateTweet') && resp.status() === 200,
      { timeout: CREATE_TWEET_RESPONSE_TIMEOUT },
    ).then(async (resp) => {
      try {
        return await resp.json() as unknown;
      } catch {
        return null;
      }
    }).catch((error) => {
      this.logger.warn({ err: error }, 'CreateTweet response interception timed out');
      return null;
    });
  }

  /**
   * Extract tweet ID from intercepted CreateTweet GraphQL response.
   * Falls back to timestamp-based ID if interception fails.
   */
  private async extractTweetIdFromResponse(responsePromise: Promise<unknown>): Promise<string> {
    const json = await responsePromise;

    if (json && typeof json === 'object') {
      // Navigate nested GraphQL response: data.create_tweet.tweet_results.result.rest_id
      const data = json as Record<string, unknown>;
      const createTweet = (data['data'] as Record<string, unknown> | undefined);
      const tweetResults = (createTweet?.['create_tweet'] as Record<string, unknown> | undefined);
      const result = (tweetResults?.['tweet_results'] as Record<string, unknown> | undefined);
      const restId = (result?.['result'] as Record<string, unknown> | undefined)?.['rest_id'];

      if (typeof restId === 'string' && restId.length > 0) {
        return restId;
      }

      this.logger.warn({ responseKeys: Object.keys(data) }, 'CreateTweet response missing rest_id');
    }

    return `pw_${Date.now()}`;
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

  private async humanDelay(min: number, max: number): Promise<void> {
    const delay = min + Math.random() * (max - min);
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }

  private trackPost(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.dailyPostDate !== today) {
      this.dailyPostCount = 0;
      this.dailyPostDate = today;
    }
    this.dailyPostCount++;
  }
}

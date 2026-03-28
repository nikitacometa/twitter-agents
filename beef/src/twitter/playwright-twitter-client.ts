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

  constructor(config: PlaywrightClientConfig) {
    this.config = config;
    this.logger = config.logger;
  }

  get isConfigured(): boolean {
    return this.context !== null && this.page !== null;
  }

  /**
   * Launch persistent browser context with stealth patches.
   * Call once at startup — browser stays alive for the session.
   */
  async initialize(): Promise<void> {
    this.logger.info({ profilePath: this.config.profilePath }, 'Launching Playwright browser');

    this.context = await chromium.launchPersistentContext(
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
        ],
        locale: 'en-US',
        timezoneId: 'America/New_York',
      },
    );

    this.page = this.context.pages()[0] ?? await this.context.newPage();
    await this.page.addInitScript({ path: STEALTH_INIT_PATH });
    this.page.setDefaultTimeout(SELECTOR_TIMEOUT);
    this.page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);

    // Verify session is alive
    const loggedIn = await this.checkLoggedIn();
    if (!loggedIn) {
      this.logger.error('Playwright browser launched but NOT logged into Twitter — manual login required');
    } else {
      this.logger.info('Playwright Twitter client initialized — session active');
    }

    // Periodic health check
    this.healthCheckTimer = setInterval(() => {
      void this.healthCheck();
    }, HEALTH_CHECK_INTERVAL);
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

    try {
      await this.page.goto('https://x.com/compose/post', {
        waitUntil: 'domcontentloaded',
      });
      await this.humanDelay(2000, 4000);

      // Type the tweet
      const textarea = this.page.locator('[data-testid="tweetTextarea_0"]');
      await textarea.waitFor({ state: 'visible' });
      await textarea.click();
      await this.humanDelay(300, 800);
      await textarea.pressSequentially(text, { delay: TYPING_DELAY_MS });
      await this.humanDelay(1000, 2500);

      // Click post button
      await this.page.locator('[data-testid="tweetButton"]').click();
      await this.humanDelay(2000, 4000);

      const tweetId = await this.extractPostedTweetId();
      this.trackPost();
      this.logger.info(
        { tweetId, charCount: text.length, dailyPosts: this.dailyPostCount },
        'Tweet posted via Playwright',
      );
      return { tweetId };
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to post tweet via Playwright');
      return null;
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

    try {
      // Navigate to the target tweet
      await this.page.goto(`https://x.com/i/status/${replyToId}`, {
        waitUntil: 'domcontentloaded',
      });
      await this.humanDelay(2000, 5000);

      // Click reply button on the tweet
      const replyButton = this.page.locator('[data-testid="reply"]').first();
      await replyButton.waitFor({ state: 'visible' });
      await replyButton.click();
      await this.humanDelay(500, 1500);

      // Type the reply (character by character for realism)
      const textarea = this.page.locator('[data-testid="tweetTextarea_0"]');
      await textarea.waitFor({ state: 'visible' });
      await textarea.pressSequentially(text, { delay: TYPING_DELAY_MS });
      await this.humanDelay(1000, 3000);

      // Post the reply
      await this.page.locator('[data-testid="tweetButtonInline"]').click();
      await this.humanDelay(2000, 4000);

      const tweetId = await this.extractPostedTweetId();
      this.trackPost();
      this.logger.info(
        { tweetId, replyToId, charCount: text.length, dailyPosts: this.dailyPostCount },
        'Reply posted via Playwright',
      );
      return { tweetId };
    } catch (error) {
      this.logger.error({ err: error, replyToId }, 'Failed to reply via Playwright');
      return null;
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
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
      this.logger.info('Playwright browser closed');
    }
  }

  // ─── Private ────────────────────────────────────────────

  private async checkLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    try {
      await this.page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(3000);
      const url = this.page.url();
      // If redirected to login page, session is expired
      return !url.includes('/login') && !url.includes('/i/flow/login');
    } catch (error) {
      this.logger.error({ err: error }, 'Session check failed');
      return false;
    }
  }

  private async healthCheck(): Promise<void> {
    const loggedIn = await this.checkLoggedIn();
    if (!loggedIn) {
      this.logger.error('Twitter session expired — manual re-login required');
      // TODO: send Telegram alert via admin bot
    }
  }

  /**
   * Extract the tweet ID after posting.
   * Waits for navigation to the posted tweet URL or looks for the snackbar.
   */
  private async extractPostedTweetId(): Promise<string> {
    if (!this.page) return `pw_unknown_${Date.now()}`;

    try {
      // Wait for the tweet to be posted — Twitter usually shows a toast or navigates
      await this.page.waitForTimeout(2000);

      // Try to find the tweet ID from the current URL
      // After posting a reply, Twitter often updates the URL or shows the reply inline
      const url = this.page.url();
      const statusMatch = url.match(/\/status\/(\d+)/);
      if (statusMatch?.[1]) {
        return statusMatch[1];
      }

      // Fallback: look for the most recent tweet by the bot in the visible timeline
      // This isn't perfect but provides a reasonable fallback
      const tweetLinks = await this.page.locator('a[href*="/status/"]').all();
      for (const link of tweetLinks.reverse()) {
        const href = await link.getAttribute('href');
        const match = href?.match(/\/status\/(\d+)/);
        if (match?.[1]) {
          return match[1];
        }
      }
    } catch (error) {
      this.logger.warn({ err: error }, 'Could not extract posted tweet ID');
    }

    return `pw_${Date.now()}`;
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

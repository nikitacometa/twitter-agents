import { Scraper, SearchMode } from '@the-convocation/twitter-scraper';
import { cycleTLSFetch, cycleTLSExit } from '@the-convocation/twitter-scraper/cycletls';
import type { Logger } from 'pino';
import type { TweetMetrics } from '@common/types/index.js';
import type { ITwitterClient, PostResult, MentionData } from './twitter-client.interface.js';
import { CookieStore } from './cookie-store.js';

export interface ScraperCredentials {
  username: string;
  password: string;
  phone?: string;
  twoFactorSecret?: string;
}

export class ScraperTwitterClient implements ITwitterClient {
  private readonly scraper: Scraper;
  private readonly credentials: ScraperCredentials;
  private readonly cookieStore: CookieStore;
  private readonly dryRun: boolean;
  private readonly logger: Logger;
  private readonly botUsername: string;
  private loggedIn = false;

  constructor(opts: {
    credentials: ScraperCredentials;
    dryRun: boolean;
    logger: Logger;
    cookiePath?: string;
  }) {
    // Use CycleTLS fetch to bypass Cloudflare TLS fingerprinting
    this.scraper = new Scraper({
      fetch: cycleTLSFetch as unknown as typeof fetch,
    });
    this.credentials = opts.credentials;
    this.cookieStore = new CookieStore(opts.logger, opts.cookiePath);
    this.dryRun = opts.dryRun;
    this.logger = opts.logger;
    this.botUsername = opts.credentials.username;
  }

  get isConfigured(): boolean {
    return this.loggedIn;
  }

  /**
   * Initialize: try saved cookies first, then credential login.
   * Must be called before any other method.
   */
  async initialize(): Promise<void> {
    // Try saved cookies first
    const savedCookies = this.cookieStore.load();
    if (savedCookies) {
      try {
        await this.scraper.setCookies(savedCookies);
        const loggedIn = await this.scraper.isLoggedIn();
        if (loggedIn) {
          this.loggedIn = true;
          this.logger.info('Logged in via saved cookies');
          return;
        }
        this.logger.warn('Saved cookies expired — falling back to credential login');
      } catch (error) {
        this.logger.warn({ err: error }, 'Failed to restore cookies');
      }
    }

    // Credential login
    await this.loginWithCredentials();
  }

  private async loginWithCredentials(): Promise<void> {
    try {
      this.logger.info({ username: this.credentials.username }, 'Attempting Twitter login...');
      await this.scraper.login(
        this.credentials.username,
        this.credentials.password,
        // Used to resolve "verify your identity" challenges
        this.credentials.phone,
        this.credentials.twoFactorSecret,
      );

      const loggedIn = await this.scraper.isLoggedIn();
      if (!loggedIn) {
        throw new Error('Login returned without error but isLoggedIn() is false');
      }

      this.loggedIn = true;
      this.logger.info({ username: this.credentials.username }, 'Twitter login successful');

      // Persist cookies for next restart
      await this.persistCookies();
    } catch (error) {
      this.loggedIn = false;
      this.logger.error({ err: error, username: this.credentials.username }, 'Twitter login failed');
      throw error;
    }
  }

  private async persistCookies(): Promise<void> {
    try {
      const cookies = await this.scraper.getCookies();
      const serialized = cookies.map((c) => String(c));
      this.cookieStore.save(serialized);
    } catch (error) {
      this.logger.warn({ err: error }, 'Failed to persist cookies');
    }
  }

  private async ensureLoggedIn(): Promise<boolean> {
    if (this.loggedIn) {
      const stillLoggedIn = await this.scraper.isLoggedIn();
      if (stillLoggedIn) return true;

      this.logger.warn('Session expired — attempting re-login');
      this.loggedIn = false;
    }

    try {
      await this.loginWithCredentials();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Post a tweet. Note: @the-convocation/twitter-scraper is read-only.
   * Write operations log as DRY_RUN regardless of config.
   * For actual posting, switch to TWITTER_CLIENT_MODE=api with Official API keys.
   */
  async postTweet(text: string): Promise<PostResult | null> {
    if (text.length > 280) {
      this.logger.error({ charCount: text.length }, 'Tweet exceeds 280 chars — rejected');
      return null;
    }

    // Scraper library is read-only — always dry run for writes
    this.logger.info(
      { text, charCount: text.length, dryRun: this.dryRun },
      '[SCRAPER DRY RUN] Would post tweet (scraper is read-only — use API mode for posting)',
    );
    return { tweetId: `dry_${Date.now()}` };
  }

  async replyToTweet(text: string, replyToId: string): Promise<PostResult | null> {
    if (text.length > 280) {
      this.logger.error({ charCount: text.length }, 'Reply exceeds 280 chars — rejected');
      return null;
    }

    this.logger.info(
      { text, replyToId, charCount: text.length, dryRun: this.dryRun },
      '[SCRAPER DRY RUN] Would reply (scraper is read-only — use API mode for posting)',
    );
    return { tweetId: `dry_reply_${Date.now()}` };
  }

  async getMentions(sinceId?: string): Promise<MentionData[]> {
    if (!(await this.ensureLoggedIn())) {
      this.logger.debug('getMentions skipped — not logged in');
      return [];
    }

    try {
      const query = `@${this.botUsername}`;
      const results: MentionData[] = [];

      for await (const tweet of this.scraper.searchTweets(query, 50, SearchMode.Latest)) {
        if (!tweet.id || !tweet.text) continue;

        // Skip own tweets
        if (tweet.username?.toLowerCase() === this.botUsername.toLowerCase()) continue;

        // Apply sinceId filter (BigInt comparison)
        if (sinceId && BigInt(tweet.id) <= BigInt(sinceId)) continue;

        results.push({
          tweetId: tweet.id,
          authorId: tweet.userId ?? 'unknown',
          authorName: tweet.username ?? 'unknown',
          text: tweet.text,
        });
      }

      this.logger.info({ count: results.length, sinceId, query }, 'Mentions fetched (scraper)');
      return results;
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to fetch mentions (scraper)');
      return [];
    }
  }

  async getTweetMetrics(tweetIds: string[]): Promise<Map<string, TweetMetrics>> {
    const result = new Map<string, TweetMetrics>();
    if (tweetIds.length === 0) return result;

    if (!(await this.ensureLoggedIn())) {
      this.logger.debug('getTweetMetrics skipped — not logged in');
      return result;
    }

    for (const id of tweetIds) {
      try {
        const tweet = await this.scraper.getTweet(id);
        if (tweet) {
          result.set(id, {
            likes: tweet.likes ?? 0,
            retweets: tweet.retweets ?? 0,
            replies: tweet.replies ?? 0,
            impressions: tweet.views ?? 0,
          });
        }
      } catch (error) {
        this.logger.debug({ err: error, tweetId: id }, 'Failed to fetch metrics for tweet');
      }
    }

    return result;
  }

  async shutdown(): Promise<void> {
    if (this.loggedIn) {
      await this.persistCookies();
    }
    cycleTLSExit();
  }
}

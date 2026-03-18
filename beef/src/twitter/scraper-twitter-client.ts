import { Scraper } from '@the-convocation/twitter-scraper';
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
  postTweet(text: string): Promise<PostResult | null> {
    if (text.length > 280) {
      this.logger.error({ charCount: text.length }, 'Tweet exceeds 280 chars — rejected');
      return Promise.resolve(null);
    }

    // Scraper library is read-only — always dry run for writes
    this.logger.info(
      { text, charCount: text.length, dryRun: this.dryRun },
      '[SCRAPER DRY RUN] Would post tweet (scraper is read-only — use API mode for posting)',
    );
    return Promise.resolve({ tweetId: `dry_${Date.now()}` });
  }

  replyToTweet(text: string, replyToId: string): Promise<PostResult | null> {
    if (text.length > 280) {
      this.logger.error({ charCount: text.length }, 'Reply exceeds 280 chars — rejected');
      return Promise.resolve(null);
    }

    this.logger.info(
      { text, replyToId, charCount: text.length, dryRun: this.dryRun },
      '[SCRAPER DRY RUN] Would reply (scraper is read-only — use API mode for posting)',
    );
    return Promise.resolve({ tweetId: `dry_reply_${Date.now()}` });
  }

  async getMentions(sinceId?: string): Promise<MentionData[]> {
    if (!(await this.ensureLoggedIn())) {
      this.logger.debug('getMentions skipped — not logged in');
      return [];
    }

    try {
      const results = await this.fetchMentionsViaNotifications(sinceId);
      this.logger.info({ count: results.length, sinceId }, 'Mentions fetched (notifications endpoint)');
      return results;
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to fetch mentions (scraper)');
      return [];
    }
  }

  /**
   * Fetch mentions using Twitter's notifications/mentions.json endpoint.
   * More reliable than SearchTimeline (which rotates GraphQL query IDs).
   */
  private async fetchMentionsViaNotifications(sinceId?: string): Promise<MentionData[]> {
    const cookies = await this.scraper.getCookies();
    const ct0Cookie = cookies.find((c: { key: string }) => c.key === 'ct0') as
      | { key: string; value: string }
      | undefined;
    const cookieStr = cookies
      .map((c: { key: string; value: string }) => `${c.key}=${c.value}`)
      .join('; ');

    const params = new URLSearchParams({
      include_profile_interstitial_type: '1',
      include_blocking: '1',
      include_blocked_by: '1',
      include_followed_by: '1',
      include_want_retweets: '1',
      include_mute_edge: '1',
      include_can_dm: '1',
      include_can_media_tag: '1',
      include_ext_is_blue_verified: '1',
      include_ext_verified_type: '1',
      skip_status: '1',
      cards_platform: 'Web-12',
      include_cards: '1',
      include_ext_alt_text: 'true',
      include_quote_count: 'true',
      include_reply_count: '1',
      tweet_mode: 'extended',
      include_ext_views: 'true',
      include_entities: 'true',
      include_user_entities: 'true',
      send_error_codes: 'true',
      simple_quoted_tweet: 'true',
      count: '40',
      ext: 'mediaStats,highlightedLabel,voiceInfo,superFollowMetadata,unmentionInfo,editControl',
    });

    const bearerToken =
      'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

    const resp = await fetch(
      `https://x.com/i/api/2/notifications/mentions.json?${params.toString()}`,
      {
        headers: {
          authorization: `Bearer ${bearerToken}`,
          cookie: cookieStr,
          'x-csrf-token': ct0Cookie?.value ?? '',
          'x-twitter-auth-type': 'OAuth2Session',
          'x-twitter-active-user': 'yes',
          'x-twitter-client-language': 'en',
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          accept: '*/*',
          referer: 'https://x.com/notifications/mentions',
        },
      },
    );

    if (!resp.ok) {
      throw new Error(`notifications/mentions returned ${resp.status}`);
    }

    const data = (await resp.json()) as {
      globalObjects?: {
        tweets?: Record<string, {
          id_str: string;
          user_id_str: string;
          full_text?: string;
          in_reply_to_status_id_str?: string;
        }>;
        users?: Record<string, { id_str: string; screen_name: string }>;
      };
    };

    const tweets = data.globalObjects?.tweets ?? {};
    const users = data.globalObjects?.users ?? {};
    const results: MentionData[] = [];

    for (const [tweetId, tweet] of Object.entries(tweets)) {
      // Skip own tweets
      const user = users[tweet.user_id_str];
      if (user?.screen_name?.toLowerCase() === this.botUsername.toLowerCase()) continue;

      // Apply sinceId filter
      if (sinceId && BigInt(tweetId) <= BigInt(sinceId)) continue;

      if (!tweet.full_text) continue;

      const mention: MentionData = {
        tweetId,
        authorId: tweet.user_id_str,
        authorName: user?.screen_name ?? 'unknown',
        text: tweet.full_text,
      };

      // Enrich with parent tweet data if this is a reply
      const parentId = tweet.in_reply_to_status_id_str;
      if (parentId) {
        mention.inReplyToTweetId = parentId;
        const parentTweet = tweets[parentId];
        if (parentTweet?.full_text) {
          mention.parentTweetText = parentTweet.full_text;
          const parentUser = users[parentTweet.user_id_str];
          if (parentUser) {
            mention.parentAuthorName = parentUser.screen_name;
          }
        }
      }

      results.push(mention);
    }

    return results;
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

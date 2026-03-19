import { Scraper } from '@the-convocation/twitter-scraper';
import { cycleTLSFetch, cycleTLSExit } from '@the-convocation/twitter-scraper/cycletls';

// Must match CycleTLS Chrome fingerprint version for consistent TLS/UA pairing
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36';
import type { Logger } from 'pino';
import type { TweetMetrics } from '@common/types/index.js';
import type { ITwitterClient, PostResult, MentionData } from './twitter-client.interface.js';
import { CookieStore } from './cookie-store.js';
import { retryWithBackoff, NonRetryableError } from '@common/utils/error.util.js';

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

  async postTweet(text: string): Promise<PostResult | null> {
    if (text.length > 280) {
      this.logger.error({ charCount: text.length }, 'Tweet exceeds 280 chars — rejected');
      return null;
    }

    if (this.dryRun) {
      this.logger.info({ text, charCount: text.length }, '[DRY RUN] Would post tweet (scraper)');
      return { tweetId: `dry_${Date.now()}` };
    }

    if (!(await this.ensureLoggedIn())) {
      this.logger.error('Cannot post — scraper not logged in');
      return null;
    }

    return retryWithBackoff(
      async () => {
        const tweetId = await this.createTweetGraphQL(text);
        this.logger.info({ tweetId, charCount: text.length }, 'Tweet posted (scraper)');
        return { tweetId };
      },
      { maxRetries: 2, baseDelayMs: 2000, label: 'scraper.postTweet' },
    );
  }

  async replyToTweet(text: string, replyToId: string): Promise<PostResult | null> {
    if (text.length > 280) {
      this.logger.error({ charCount: text.length }, 'Reply exceeds 280 chars — rejected');
      return null;
    }

    if (this.dryRun) {
      this.logger.info({ text, replyToId, charCount: text.length }, '[DRY RUN] Would reply (scraper)');
      return { tweetId: `dry_reply_${Date.now()}` };
    }

    if (!(await this.ensureLoggedIn())) {
      this.logger.error('Cannot reply — scraper not logged in');
      return null;
    }

    return retryWithBackoff(
      async () => {
        const tweetId = await this.createTweetGraphQL(text, replyToId);
        this.logger.info({ tweetId, replyToId }, 'Reply posted (scraper)');
        return { tweetId };
      },
      { maxRetries: 2, baseDelayMs: 2000, label: 'scraper.replyToTweet' },
    );
  }

  /**
   * Post a tweet via Twitter's internal GraphQL CreateTweet mutation.
   * Same authentication pattern as fetchMentionsViaNotifications.
   */
  private async createTweetGraphQL(text: string, replyToId?: string): Promise<string> {
    const cookies = await this.scraper.getCookies();
    const ct0Cookie = cookies.find((c: { key: string }) => c.key === 'ct0') as
      | { key: string; value: string }
      | undefined;
    const cookieStr = cookies
      .map((c: { key: string; value: string }) => `${c.key}=${c.value}`)
      .join('; ');

    const bearerToken =
      'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

    const queryId = '7TKRKCPuAGsmYde0CudbVg';

    const variables: Record<string, unknown> = {
      tweet_text: text,
      dark_request: false,
      media: { media_entities: [], possibly_sensitive: false },
      semantic_annotation_ids: [],
    };

    if (replyToId) {
      variables['reply'] = {
        in_reply_to_tweet_id: replyToId,
        exclude_reply_user_ids: [],
      };
    }

    // Features dict aligned with current Twitter web client (March 2026)
    const features = {
      rweb_video_screen_enabled: false,
      profile_label_improvements_pcf_label_in_post_enabled: true,
      responsive_web_profile_redirect_enabled: false,
      rweb_tipjar_consumption_enabled: false,
      verified_phone_label_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      premium_content_api_read_enabled: false,
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      responsive_web_grok_analyze_button_fetch_trends_enabled: false,
      responsive_web_grok_analyze_post_followups_enabled: true,
      responsive_web_jetfuel_frame: true,
      responsive_web_grok_share_attachment_enabled: true,
      responsive_web_grok_annotations_enabled: true,
      articles_preview_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      responsive_web_grok_show_grok_translated_post: true,
      responsive_web_grok_analysis_button_from_backend: true,
      post_ctas_fetch_enabled: true,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_grok_image_annotation_enabled: true,
      responsive_web_grok_imagine_annotation_enabled: true,
      responsive_web_grok_community_note_auto_translation_is_enabled: false,
      responsive_web_enhance_cards_enabled: false,
    };

    // Use CycleTLS fetch to match Chrome TLS fingerprint — regular fetch triggers 226 anti-automation
    const resp = await cycleTLSFetch(
      `https://x.com/i/api/graphql/${queryId}/CreateTweet`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${bearerToken}`,
          cookie: cookieStr,
          'x-csrf-token': ct0Cookie?.value ?? '',
          'x-twitter-auth-type': 'OAuth2Session',
          'x-twitter-active-user': 'yes',
          'x-twitter-client-language': 'en',
          'content-type': 'application/json',
          'user-agent': CHROME_USER_AGENT,
          referer: 'https://x.com/compose/tweet',
        },
        body: JSON.stringify({ variables, features, queryId }),
      },
    );

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`CreateTweet returned ${String(resp.status)}: ${body.slice(0, 500)}`);
    }

    const data = (await resp.json()) as {
      data?: {
        create_tweet?: {
          tweet_results?: {
            result?: { rest_id?: string };
          };
        };
      };
      errors?: Array<{ code?: number; message: string }>;
    };

    // Check for GraphQL errors (can appear alongside data or with empty data)
    const errors = data.errors;
    if (errors && errors.length > 0) {
      const msg = errors.map((e) => `[${String(e.code ?? '?')}] ${e.message}`).join('; ');
      // Non-retryable: rate limits (344), anti-automation (226), permissions
      const nonRetryableCodes = new Set([226, 344, 326, 187]);
      const hasNonRetryable = errors.some((e) => e.code !== undefined && nonRetryableCodes.has(e.code));
      if (hasNonRetryable) {
        throw new NonRetryableError(`CreateTweet blocked: ${msg}`);
      }
      throw new Error(`CreateTweet GraphQL error: ${msg}`);
    }

    const tweetId = data.data?.create_tweet?.tweet_results?.result?.rest_id;
    if (!tweetId) {
      // Empty tweet_results without errors — may indicate silent rate limit or account restriction
      this.logger.warn(
        { replyToId, hasCreateTweet: !!data.data?.create_tweet },
        'CreateTweet returned empty tweet_results (possible silent rate limit or account restriction)',
      );
      throw new Error('CreateTweet response missing tweet ID (empty tweet_results)');
    }

    return tweetId;
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
   * Fetch mentions using Twitter's notifications/all.json endpoint.
   * Uses all.json instead of mentions.json because the latter misses
   * reply-mentions (tags in replies to other users' tweets).
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
      `https://x.com/i/api/2/notifications/all.json?${params.toString()}`,
      {
        headers: {
          authorization: `Bearer ${bearerToken}`,
          cookie: cookieStr,
          'x-csrf-token': ct0Cookie?.value ?? '',
          'x-twitter-auth-type': 'OAuth2Session',
          'x-twitter-active-user': 'yes',
          'x-twitter-client-language': 'en',
          'user-agent': CHROME_USER_AGENT,
          accept: '*/*',
          referer: 'https://x.com/notifications',
        },
      },
    );

    if (!resp.ok) {
      throw new Error(`notifications/all returned ${resp.status}`);
    }

    interface NotifTweet {
      id_str: string;
      user_id_str: string;
      full_text?: string;
      in_reply_to_status_id_str?: string;
      entities?: { media?: Array<{ media_url_https?: string; type?: string }> };
      extended_entities?: { media?: Array<{ media_url_https?: string; type?: string }> };
    }

    const data = (await resp.json()) as {
      globalObjects?: {
        tweets?: Record<string, NotifTweet>;
        users?: Record<string, { id_str: string; screen_name: string }>;
      };
    };

    const tweets = data.globalObjects?.tweets ?? {};
    const users = data.globalObjects?.users ?? {};
    const results: MentionData[] = [];

    const botMentionPattern = `@${this.botUsername}`.toLowerCase();

    for (const [tweetId, tweet] of Object.entries(tweets)) {
      // Skip own tweets
      const user = users[tweet.user_id_str];
      if (user?.screen_name?.toLowerCase() === this.botUsername.toLowerCase()) continue;

      // Apply sinceId filter
      if (sinceId && BigInt(tweetId) <= BigInt(sinceId)) continue;

      if (!tweet.full_text) continue;

      // all.json returns all notifications — only keep tweets mentioning us
      if (!tweet.full_text.toLowerCase().includes(botMentionPattern)) continue;

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
          // Extract image URLs from parent tweet
          const media = parentTweet.extended_entities?.media ?? parentTweet.entities?.media;
          if (media) {
            const imageUrls = media
              .filter((m) => m.type === 'photo' && m.media_url_https)
              .map((m) => m.media_url_https!);
            if (imageUrls.length > 0) {
              mention.parentMediaUrls = imageUrls;
            }
          }
        }
      }

      results.push(mention);
    }

    // Enrich mentions that are replies but missing parent tweet data
    const needsParent = results.filter((m) => m.inReplyToTweetId && !m.parentTweetText);
    for (const mention of needsParent.slice(0, 5)) {
      try {
        const parentTweet = await this.scraper.getTweet(mention.inReplyToTweetId!);
        if (parentTweet) {
          mention.parentTweetText = parentTweet.text ?? undefined;
          mention.parentAuthorName = parentTweet.username ?? undefined;
          const photos = parentTweet.photos?.map((p) => p.url).filter(Boolean);
          if (photos && photos.length > 0) {
            mention.parentMediaUrls = photos;
          }
        }
      } catch (err) {
        this.logger.debug({ err, parentId: mention.inReplyToTweetId }, 'Failed to fetch parent tweet');
      }
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

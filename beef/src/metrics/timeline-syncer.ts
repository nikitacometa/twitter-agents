import type { TwitterApi } from 'twitter-api-v2';
import type { Logger } from 'pino';
import type { MetricsRepository, InsertBotTweet } from './metrics.repository.js';

export interface TimelineSyncResult {
  newTweets: number;
  totalFetched: number;
  apiCallsUsed: number;
  readsUsed: number;
}

export class TimelineSyncer {
  private readonly api: TwitterApi;
  private readonly repo: MetricsRepository;
  private readonly logger: Logger;

  constructor(opts: { api: TwitterApi; repo: MetricsRepository; logger: Logger }) {
    this.api = opts.api;
    this.repo = opts.repo;
    this.logger = opts.logger;
  }

  /** Resolve and cache the bot's Twitter user ID. */
  async resolveBotUserId(): Promise<string> {
    const cached = this.repo.getConfig('metrics_bot_user_id');
    if (cached) return cached;

    const me = await this.api.v2.me({ 'user.fields': 'public_metrics' });
    const userId = me.data.id;
    this.repo.setConfig('metrics_bot_user_id', userId);
    this.repo.logApiUsage('metrics', 'users_me', 1);
    this.logger.info({ userId, username: me.data.username }, 'Bot user ID resolved and cached');
    return userId;
  }

  /** Fetch bot account stats and store a snapshot. */
  async snapshotAccount(): Promise<void> {
    const me = await this.api.v2.me({ 'user.fields': 'public_metrics' });
    const pm = me.data.public_metrics;
    if (pm) {
      this.repo.insertAccountSnapshot({
        followers: pm.followers_count ?? 0,
        following: pm.following_count ?? 0,
        tweetCount: pm.tweet_count ?? 0,
        listedCount: pm.listed_count ?? 0,
      });
      this.logger.info(
        { followers: pm.followers_count ?? 0, tweets: pm.tweet_count ?? 0 },
        'Account snapshot captured',
      );
    }
    this.repo.logApiUsage('metrics', 'users_me', 1);
  }

  /** Sync bot timeline. Incremental by default, full if force=true. */
  async sync(opts: { userId: string; force?: boolean }): Promise<TimelineSyncResult> {
    const { userId, force } = opts;
    const sinceId = force ? undefined : this.repo.getConfig('metrics_last_tweet_id');

    let newTweets = 0;
    let totalFetched = 0;
    let apiCallsUsed = 0;
    let highestId: string | undefined;

    const params: Record<string, string | number> = {
      max_results: 100,
      'tweet.fields': 'created_at,public_metrics,conversation_id,in_reply_to_user_id,referenced_tweets,entities,attachments',
      'media.fields': 'type',
      expansions: 'attachments.media_keys,referenced_tweets.id',
    };
    if (sinceId) params['since_id'] = sinceId;

    let paginationToken: string | undefined;
    do {
      if (paginationToken) params['pagination_token'] = paginationToken;

      const response = await this.api.v2.userTimeline(userId, params);
      apiCallsUsed++;

      const tweets = response.data?.data ?? [];
      const mediaKeys = new Set<string>();
      if (response.data?.includes?.media) {
        for (const m of response.data.includes.media) {
          mediaKeys.add(m.media_key);
        }
      }

      for (const tweet of tweets) {
        totalFetched++;

        // Track highest ID for cursor
        if (!highestId || BigInt(tweet.id) > BigInt(highestId)) {
          highestId = tweet.id;
        }

        // Determine referenced tweet info
        let referencedTweetId: string | undefined;
        let referencedTweetType: 'replied_to' | 'quoted' | 'retweeted' | undefined;
        if (tweet.referenced_tweets?.length) {
          const ref = tweet.referenced_tweets[0];
          if (ref) {
            referencedTweetId = ref.id;
            referencedTweetType = ref.type as typeof referencedTweetType;
          }
        }

        // Check for media
        const hasMedia = !!(tweet.attachments?.media_keys?.length);

        // Check entities
        const entities = tweet.entities;
        const hasLink = !!(entities?.urls?.some((u) => !u.expanded_url?.includes('twitter.com')));
        const hasMention = !!(entities?.mentions?.length);

        const botTweet: InsertBotTweet = {
          tweetId: tweet.id,
          text: tweet.text,
          createdAt: tweet.created_at ?? new Date().toISOString(),
          conversationId: tweet.conversation_id,
          inReplyToTweetId: referencedTweetType === 'replied_to' ? referencedTweetId : undefined,
          inReplyToUserId: tweet.in_reply_to_user_id ?? undefined,
          referencedTweetId,
          referencedTweetType,
          entities: entities ? JSON.stringify(entities) : undefined,
          isReply: referencedTweetType === 'replied_to',
          isQuote: referencedTweetType === 'quoted',
          hasMedia,
          hasLink,
          hasMention,
        };

        // Use upsert for force mode, insert for incremental
        if (force) {
          this.repo.upsertBotTweet(botTweet);
        } else {
          this.repo.insertBotTweet(botTweet);
        }

        // Try to link roast_id
        this.repo.linkRoastId(tweet.id);

        // Store initial metrics if available
        const pm = tweet.public_metrics;
        if (pm) {
          this.repo.updateTweetMetrics({
            tweetId: tweet.id,
            likes: pm.like_count,
            retweets: pm.retweet_count,
            replies: pm.reply_count,
            impressions: pm.impression_count ?? 0,
            quotes: pm.quote_count ?? 0,
            bookmarks: pm.bookmark_count ?? 0,
          });
        }

        newTweets++;
      }

      this.repo.logApiUsage('metrics', 'user_timeline', 1);

      paginationToken = response.data?.meta?.next_token;

      this.logger.debug(
        { fetched: tweets.length, total: totalFetched, hasMore: !!paginationToken },
        'Timeline page processed',
      );
    } while (paginationToken);

    // Update cursor for next incremental sync
    if (highestId) {
      this.repo.setConfig('metrics_last_tweet_id', highestId);
    }

    this.logger.info(
      { newTweets, totalFetched, apiCallsUsed },
      'Timeline sync complete',
    );

    return { newTweets, totalFetched, apiCallsUsed, readsUsed: apiCallsUsed };
  }
}

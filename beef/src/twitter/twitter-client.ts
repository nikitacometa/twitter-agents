import { TwitterApi, ApiResponseError } from 'twitter-api-v2';
import type { Logger } from 'pino';
import type { TweetMetrics } from '@common/types/index.js';
import type { ITwitterClient, IProfileFetcher, TwitterProfile, PostResult, MentionData, TweetData, FollowUserResult } from './twitter-client.interface.js';
import { retryWithBackoff, NonRetryableError, getErrorMessage } from '@common/utils/error.util.js';

export interface TwitterCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

export { type PostResult } from './twitter-client.interface.js';

export interface ApiUsageStats {
  posts: number;
  reads: number;
  date: string;
  lastRateLimit?: { remaining: number; limit: number; resetAt: string };
}

export class TwitterClient implements ITwitterClient, IProfileFetcher {
  private readonly client: TwitterApi | null;
  private readonly dryRun: boolean;
  private readonly logger: Logger;
  private cachedUserId: string | null = null;
  private readonly _usage: ApiUsageStats = { posts: 0, reads: 0, date: new Date().toISOString().slice(0, 10) };

  constructor(opts: {
    credentials?: TwitterCredentials;
    dryRun: boolean;
    logger: Logger;
  }) {
    this.dryRun = opts.dryRun;
    this.logger = opts.logger;

    if (opts.credentials) {
      this.client = new TwitterApi({
        appKey: opts.credentials.apiKey,
        appSecret: opts.credentials.apiSecret,
        accessToken: opts.credentials.accessToken,
        accessSecret: opts.credentials.accessSecret,
      });
      this.logger.info('Twitter client initialized (Official API)');
    } else {
      this.client = null;
      this.logger.warn('Twitter client: no credentials — dry run only');
    }
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  get usage(): Readonly<ApiUsageStats> {
    this.resetUsageIfNewDay();
    return { ...this._usage };
  }

  private resetUsageIfNewDay(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this._usage.date !== today) {
      this._usage.posts = 0;
      this._usage.reads = 0;
      this._usage.date = today;
      this._usage.lastRateLimit = undefined;
    }
  }

  private trackPost(): void {
    this.resetUsageIfNewDay();
    this._usage.posts++;
  }

  private trackRead(): void {
    this.resetUsageIfNewDay();
    this._usage.reads++;
  }

  private handleRateLimitError(error: unknown): never {
    if (error instanceof ApiResponseError) {
      if (error.code === 429) {
        const rl = error.rateLimit;
        if (rl) {
          const resetAt = new Date(rl.reset * 1000).toISOString();
          this._usage.lastRateLimit = { remaining: rl.remaining, limit: rl.limit, resetAt };
          this.logger.warn({ remaining: rl.remaining, limit: rl.limit, resetAt }, 'Twitter API rate limited (429)');
        }
        throw new NonRetryableError('Twitter API rate limited (429)');
      }
      if (error.code === 403) {
        throw new NonRetryableError(`Twitter API forbidden (403): ${error.data?.detail ?? error.message}`);
      }
    }
    throw error;
  }

  async postTweet(text: string): Promise<PostResult | null> {
    if (text.length > 280) {
      this.logger.error({ charCount: text.length }, 'Tweet exceeds 280 chars — rejected');
      return null;
    }

    if (this.dryRun) {
      this.logger.info({ text, charCount: text.length }, '[DRY RUN] Would post tweet');
      return { tweetId: `dry_${Date.now()}` };
    }

    if (!this.client) {
      this.logger.error('Cannot post — Twitter client not configured');
      return null;
    }

    return retryWithBackoff(
      async () => {
        try {
          const result = await this.client!.v2.tweet(text);
          this.trackPost();
          this.logger.info({ tweetId: result.data.id, charCount: text.length, dailyPosts: this._usage.posts }, 'Tweet posted');
          return { tweetId: result.data.id };
        } catch (error) {
          this.handleRateLimitError(error);
        }
      },
      { maxRetries: 2, baseDelayMs: 2000, label: 'postTweet' },
    );
  }

  async replyToTweet(text: string, replyToId: string): Promise<PostResult | null> {
    if (text.length > 280) {
      this.logger.error({ charCount: text.length }, 'Reply exceeds 280 chars — rejected');
      return null;
    }

    if (this.dryRun) {
      this.logger.info({ text, replyToId, charCount: text.length }, '[DRY RUN] Would reply');
      return { tweetId: `dry_reply_${Date.now()}` };
    }

    if (!this.client) {
      this.logger.error('Cannot reply — Twitter client not configured');
      return null;
    }

    return retryWithBackoff(
      async () => {
        try {
          const result = await this.client!.v2.reply(text, replyToId);
          this.trackPost();
          this.logger.info({ tweetId: result.data.id, replyToId, dailyPosts: this._usage.posts }, 'Reply posted');
          return { tweetId: result.data.id };
        } catch (error) {
          this.handleRateLimitError(error);
        }
      },
      { maxRetries: 2, baseDelayMs: 2000, label: 'replyToTweet' },
    );
  }

  async getMentions(sinceId?: string): Promise<MentionData[]> {
    if (!this.client) {
      this.logger.debug('getMentions skipped — no client');
      return [];
    }

    try {
      if (!this.cachedUserId) {
        const me = await this.client.v2.me();
        this.cachedUserId = me.data.id;
      }
      const params: Record<string, string> = {
        'tweet.fields': 'author_id,created_at,referenced_tweets,attachments,conversation_id',
        'user.fields': 'username',
        'media.fields': 'url,type,preview_image_url',
        expansions: 'author_id,referenced_tweets.id,referenced_tweets.id.author_id,attachments.media_keys',
      };
      if (sinceId) params['since_id'] = sinceId;

      const mentions = await this.client.v2.userMentionTimeline(this.cachedUserId, params);

      const users = new Map<string, string>();
      if (mentions.includes?.users) {
        for (const u of mentions.includes.users) {
          users.set(u.id, u.username);
        }
      }

      // Index media by key for image lookup
      const mediaByKey = new Map<string, string>();
      if (mentions.includes?.media) {
        for (const m of mentions.includes.media) {
          if (m.type === 'photo' && m.url) {
            mediaByKey.set(m.media_key, m.url);
          }
        }
      }

      // Index referenced tweets for parent tweet lookup
      const refTweets = new Map<string, { text: string; author_id?: string; mediaKeys?: string[] }>();
      if (mentions.includes?.tweets) {
        for (const t of mentions.includes.tweets) {
          refTweets.set(t.id, {
            text: t.text,
            author_id: t.author_id,
            mediaKeys: t.attachments?.media_keys,
          });
        }
      }

      const results: MentionData[] = [];

      for (const tweet of mentions.data?.data ?? []) {
        const mention: MentionData = {
          tweetId: tweet.id,
          authorId: tweet.author_id ?? 'unknown',
          authorName: users.get(tweet.author_id ?? '') ?? 'unknown',
          text: tweet.text,
          conversationId: (tweet as unknown as Record<string, unknown>).conversation_id as string | undefined,
        };

        // Check for replied_to reference
        const repliedTo = tweet.referenced_tweets?.find(
          (ref: { type: string; id: string }) => ref.type === 'replied_to',
        );
        if (repliedTo) {
          mention.inReplyToTweetId = repliedTo.id;
          const parent = refTweets.get(repliedTo.id);
          if (parent) {
            mention.parentTweetText = parent.text;
            if (parent.author_id) {
              mention.parentAuthorName = users.get(parent.author_id);
            }
            // Resolve media keys to image URLs
            if (parent.mediaKeys) {
              const imageUrls = parent.mediaKeys
                .map((key) => mediaByKey.get(key))
                .filter((url): url is string => url !== undefined);
              if (imageUrls.length > 0) {
                mention.parentMediaUrls = imageUrls;
              }
            }
          }
        }

        results.push(mention);
      }

      this.trackRead();
      this.logger.info({ count: results.length, sinceId, dailyReads: this._usage.reads }, 'Mentions fetched');
      return results;
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to fetch mentions');
      return [];
    }
  }

  async getTweetMetrics(tweetIds: string[]): Promise<Map<string, TweetMetrics>> {
    const result = new Map<string, TweetMetrics>();
    if (!this.client || tweetIds.length === 0) return result;

    // Twitter API v2 allows max 100 IDs per request
    const chunks: string[][] = [];
    for (let i = 0; i < tweetIds.length; i += 100) {
      chunks.push(tweetIds.slice(i, i + 100));
    }

    for (const chunk of chunks) {
      try {
        const response = await this.client.v2.tweets(chunk, {
          'tweet.fields': 'public_metrics',
        });

        for (const tweet of response.data ?? []) {
          const m = tweet.public_metrics;
          if (m) {
            result.set(tweet.id, {
              likes: m.like_count ?? 0,
              retweets: m.retweet_count ?? 0,
              replies: m.reply_count ?? 0,
              impressions: m.impression_count ?? 0,
            });
          }
        }
      } catch (error) {
        this.logger.error({ err: error, chunkSize: chunk.length }, 'Failed to fetch tweet metrics');
      }
    }

    return result;
  }

  async getTweet(tweetId: string): Promise<TweetData | null> {
    if (!this.client) return null;

    try {
      const response = await this.client.v2.singleTweet(tweetId, {
        expansions: ['author_id', 'attachments.media_keys', 'referenced_tweets.id'],
        'tweet.fields': ['text', 'author_id', 'public_metrics', 'created_at', 'referenced_tweets'],
        'user.fields': ['username'],
        'media.fields': ['url', 'type', 'preview_image_url'],
      });

      const tweet = response.data;
      const author = response.includes?.users?.[0];
      const media = response.includes?.media ?? [];
      const mediaUrls = media
        .map((m) => m.url ?? m.preview_image_url)
        .filter((u): u is string => !!u);

      const metrics = tweet.public_metrics;
      const refs = tweet.referenced_tweets;
      const replyRef = refs?.find((r) => r.type === 'replied_to');
      const quoteRef = refs?.find((r) => r.type === 'quoted');

      this.trackRead();
      this.logger.info({ tweetId, author: author?.username }, 'Tweet fetched via API');

      return {
        tweetId: tweet.id,
        authorId: tweet.author_id ?? 'unknown',
        authorName: author?.username ?? 'unknown',
        text: tweet.text,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
        likes: metrics?.like_count,
        retweets: metrics?.retweet_count,
        replies: metrics?.reply_count,
        createdAt: tweet.created_at,
        inReplyToTweetId: replyRef?.id,
        quotedTweetId: quoteRef?.id,
      };
    } catch (error) {
      this.logger.error({ err: error, tweetId }, 'Failed to fetch tweet');
      return null;
    }
  }

  async getProfile(username: string): Promise<TwitterProfile | null> {
    if (!this.client) {
      this.logger.debug('getProfile skipped — no client');
      return null;
    }

    try {
      const user = await this.client.v2.userByUsername(username, {
        'user.fields': 'description,public_metrics,verified,url',
      });

      if (!user.data) {
        this.logger.debug({ username }, 'User not found');
        return null;
      }

      const recentTweets: string[] = [];
      try {
        const timeline = await this.client.v2.userTimeline(user.data.id, {
          max_results: 5,
          exclude: ['replies', 'retweets'],
        });
        for (const tweet of timeline.data?.data ?? []) {
          recentTweets.push(tweet.text);
        }
      } catch {
        this.logger.debug({ username }, 'Failed to fetch user timeline — continuing without');
      }

      this.trackRead();
      this.logger.info({ username, followers: user.data.public_metrics?.followers_count, dailyReads: this._usage.reads }, 'Profile fetched via API');

      return {
        username: user.data.username,
        biography: user.data.description ?? null,
        followersCount: user.data.public_metrics?.followers_count ?? null,
        isVerified: user.data.verified ?? false,
        website: user.data.url ?? null,
        recentTweets,
      };
    } catch (error) {
      this.logger.error({ err: error, username }, 'Failed to fetch profile');
      return null;
    }
  }

  async followUser(username: string): Promise<FollowUserResult> {
    if (!this.client) {
      return { username, success: false, error: 'Twitter client not configured' };
    }

    try {
      // Resolve own user ID
      if (!this.cachedUserId) {
        const me = await this.client.v2.me();
        this.cachedUserId = me.data.id;
      }

      // Resolve target username → ID
      const target = await this.client.v2.userByUsername(username);
      if (!target.data) {
        return { username, success: false, error: 'User not found' };
      }

      const result = await this.client.v2.follow(this.cachedUserId, target.data.id);
      this.logger.info(
        { username, targetId: target.data.id, following: result.data.following, pending: result.data.pending_follow },
        'Followed user',
      );

      return {
        username,
        success: true,
        following: result.data.following,
        pending: result.data.pending_follow,
      };
    } catch (error) {
      if (error instanceof ApiResponseError) {
        if (error.code === 429) {
          return { username, success: false, error: 'Rate limited (429) — try again later' };
        }
        if (error.code === 403) {
          return { username, success: false, error: 'Forbidden (403) — account may be suspended, deactivated, or has you blocked' };
        }
      }
      this.logger.error({ err: error, username }, 'Failed to follow user');
      return { username, success: false, error: getErrorMessage(error) };
    }
  }
}

import { TwitterApi } from 'twitter-api-v2';
import type { Logger } from 'pino';
import type { TweetMetrics } from '@common/types/index.js';
import { retryWithBackoff } from '@common/utils/error.util.js';

export interface TwitterCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

export interface PostResult {
  tweetId: string;
}

export class TwitterClient {
  private readonly client: TwitterApi | null;
  private readonly dryRun: boolean;
  private readonly logger: Logger;

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
        const result = await this.client!.v2.tweet(text);
        this.logger.info({ tweetId: result.data.id, charCount: text.length }, 'Tweet posted');
        return { tweetId: result.data.id };
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
        const result = await this.client!.v2.reply(text, replyToId);
        this.logger.info({ tweetId: result.data.id, replyToId }, 'Reply posted');
        return { tweetId: result.data.id };
      },
      { maxRetries: 2, baseDelayMs: 2000, label: 'replyToTweet' },
    );
  }

  async getMentions(sinceId?: string): Promise<Array<{
    tweetId: string;
    authorId: string;
    authorName: string;
    text: string;
  }>> {
    if (!this.client) {
      this.logger.debug('getMentions skipped — no client');
      return [];
    }

    try {
      const me = await this.client.v2.me();
      const params: Record<string, string> = {
        'tweet.fields': 'author_id,created_at',
        'user.fields': 'username',
        expansions: 'author_id',
      };
      if (sinceId) params['since_id'] = sinceId;

      const mentions = await this.client.v2.userMentionTimeline(me.data.id, params);

      const users = new Map<string, string>();
      if (mentions.includes?.users) {
        for (const u of mentions.includes.users) {
          users.set(u.id, u.username);
        }
      }

      const results: Array<{
        tweetId: string;
        authorId: string;
        authorName: string;
        text: string;
      }> = [];

      for (const tweet of mentions.data?.data ?? []) {
        results.push({
          tweetId: tweet.id,
          authorId: tweet.author_id ?? 'unknown',
          authorName: users.get(tweet.author_id ?? '') ?? 'unknown',
          text: tweet.text,
        });
      }

      this.logger.info({ count: results.length, sinceId }, 'Mentions fetched');
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
}

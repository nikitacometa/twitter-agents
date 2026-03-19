import { TwitterApi } from 'twitter-api-v2';
import type { Logger } from 'pino';
import type { TweetMetrics } from '@common/types/index.js';
import type { ITwitterClient, PostResult, MentionData } from './twitter-client.interface.js';
import { retryWithBackoff } from '@common/utils/error.util.js';

export interface TwitterCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

export { type PostResult } from './twitter-client.interface.js';

export class TwitterClient implements ITwitterClient {
  private readonly client: TwitterApi | null;
  private readonly dryRun: boolean;
  private readonly logger: Logger;
  private cachedUserId: string | null = null;

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
        'tweet.fields': 'author_id,created_at,referenced_tweets,attachments',
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

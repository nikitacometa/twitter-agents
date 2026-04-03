import type { Logger } from 'pino';
import type { TweetMetrics } from '@common/types/index.js';
import type {
  ITwitterClient,
  PostResult,
  MentionData,
  TweetData,
  FollowUserResult,
  SearchTweetResult,
} from './twitter-client.interface.js';

/**
 * Hybrid Twitter client: API v2 primary, Playwright fallback for writes.
 *
 * API handles all reads and most writes. Playwright activates only when
 * the API fails (e.g., 403 on non-mention replies to other accounts).
 * Self-replies (threads) work fine via API.
 */
export class HybridTwitterClient implements ITwitterClient {
  private readonly apiClient: ITwitterClient;
  private readonly playwrightClient: ITwitterClient;
  private readonly logger: Logger;

  constructor(opts: {
    apiClient: ITwitterClient;
    playwrightClient: ITwitterClient;
    logger: Logger;
  }) {
    this.apiClient = opts.apiClient;
    this.playwrightClient = opts.playwrightClient;
    this.logger = opts.logger;
  }

  get isConfigured(): boolean {
    return this.apiClient.isConfigured;
  }

  // ─── Writes → API first, Playwright fallback ──────────

  async postTweet(text: string): Promise<PostResult | null> {
    if (this.apiClient.isConfigured) {
      const result = await this.apiClient.postTweet(text);
      if (result) return result;
      this.logger.warn('API postTweet failed — trying Playwright fallback');
    }
    if (this.playwrightClient.isConfigured) {
      return this.playwrightClient.postTweet(text);
    }
    this.logger.error('Both API and Playwright unavailable for postTweet');
    return null;
  }

  async replyToTweet(text: string, replyToId: string): Promise<PostResult | null> {
    if (this.apiClient.isConfigured) {
      const result = await this.apiClient.replyToTweet(text, replyToId);
      if (result) return result;
      this.logger.warn('API replyToTweet failed — trying Playwright fallback');
    }
    if (this.playwrightClient.isConfigured) {
      return this.playwrightClient.replyToTweet(text, replyToId);
    }
    this.logger.error('Both API and Playwright unavailable for replyToTweet');
    return null;
  }

  // ─── Reads → API v2 ───────────────────────────────────

  getMentions(sinceId?: string): Promise<MentionData[]> {
    return this.apiClient.getMentions(sinceId);
  }

  getTweetMetrics(tweetIds: string[]): Promise<Map<string, TweetMetrics>> {
    return this.apiClient.getTweetMetrics(tweetIds);
  }

  get getTweet(): ((tweetId: string) => Promise<TweetData | null>) | undefined {
    return this.apiClient.getTweet?.bind(this.apiClient);
  }

  get followUser(): ((username: string) => Promise<FollowUserResult>) | undefined {
    return this.apiClient.followUser?.bind(this.apiClient);
  }

  get searchRecentTweets(): ((query: string, sinceId?: string, maxResults?: number) => Promise<SearchTweetResult[]>) | undefined {
    return this.apiClient.searchRecentTweets?.bind(this.apiClient);
  }

  // ─── Lifecycle ─────────────────────────────────────────

  async shutdown(): Promise<void> {
    await Promise.all([
      this.apiClient.shutdown?.(),
      this.playwrightClient.shutdown?.(),
    ]);
  }
}

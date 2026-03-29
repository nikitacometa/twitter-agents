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
 * Hybrid Twitter client: API v2 for reads, Playwright for writes.
 *
 * Twitter API v2 returns 403 on non-mention replies (since Feb 2026).
 * Playwright with ISP residential proxy bypasses this restriction.
 * API handles mentions, metrics, search — all read operations.
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
    // API must be configured for reads. Playwright may be down (login expired) —
    // we still function in degraded mode (reads work, writes fail gracefully).
    return this.apiClient.isConfigured;
  }

  // ─── Writes → Playwright ───────────────────────────────

  async postTweet(text: string): Promise<PostResult | null> {
    if (!this.playwrightClient.isConfigured) {
      this.logger.warn('Playwright not configured — falling back to API for postTweet');
      return this.apiClient.postTweet(text);
    }
    return this.playwrightClient.postTweet(text);
  }

  async replyToTweet(text: string, replyToId: string): Promise<PostResult | null> {
    if (!this.playwrightClient.isConfigured) {
      // No API fallback for replies — API v2 returns 403 on non-mention replies,
      // which is the primary reason hybrid mode exists.
      this.logger.error('Playwright not configured — cannot reply (API v2 returns 403 on non-mention replies)');
      return null;
    }
    return this.playwrightClient.replyToTweet(text, replyToId);
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

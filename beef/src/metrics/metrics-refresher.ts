import type { TwitterApi } from 'twitter-api-v2';
import type { Logger } from 'pino';
import type { MetricsRepository, TweetMetricsUpdate } from './metrics.repository.js';

export interface RefreshResult {
  updated: number;
  deleted: number;
  skipped: number;
  apiCallsUsed: number;
  readsUsed: number;
}

export class MetricsRefresher {
  private readonly api: TwitterApi;
  private readonly repo: MetricsRepository;
  private readonly logger: Logger;

  constructor(opts: { api: TwitterApi; repo: MetricsRepository; logger: Logger }) {
    this.api = opts.api;
    this.repo = opts.repo;
    this.logger = opts.logger;
  }

  /**
   * Refresh metrics for live bot tweets using tiered staleness:
   * - < 7 days old: always refresh
   * - 7-30 days old: refresh if metrics_updated_at > 24h ago
   * - > 30 days old: refresh if metrics_updated_at > 7 days ago
   */
  async refresh(): Promise<RefreshResult> {
    const allLive = this.repo.getAllLiveTweets();
    const now = Date.now();
    const toRefresh: string[] = [];
    let skipped = 0;

    for (const tweet of allLive) {
      const ageMs = now - new Date(tweet.created_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const lastUpdated = tweet.metrics_updated_at ? new Date(tweet.metrics_updated_at).getTime() : 0;
      const stalenessMs = now - lastUpdated;
      const stalenessHours = stalenessMs / (1000 * 60 * 60);

      if (ageDays < 7) {
        // Always refresh recent tweets
        toRefresh.push(tweet.tweet_id);
      } else if (ageDays < 30) {
        // Refresh if stale > 24h
        if (stalenessHours > 24) {
          toRefresh.push(tweet.tweet_id);
        } else {
          skipped++;
        }
      } else {
        // Refresh if stale > 7 days
        if (stalenessHours > 168) {
          toRefresh.push(tweet.tweet_id);
        } else {
          skipped++;
        }
      }
    }

    if (toRefresh.length === 0) {
      this.logger.info('No tweets need metrics refresh');
      return { updated: 0, deleted: 0, skipped, apiCallsUsed: 0, readsUsed: 0 };
    }

    this.logger.info(
      { toRefresh: toRefresh.length, skipped, totalLive: allLive.length },
      'Starting metrics refresh',
    );

    // Batch fetch: Twitter API v2 allows max 100 IDs per request
    const chunks: string[][] = [];
    for (let i = 0; i < toRefresh.length; i += 100) {
      chunks.push(toRefresh.slice(i, i + 100));
    }

    let updated = 0;
    let deleted = 0;
    let apiCallsUsed = 0;
    const foundIds = new Set<string>();
    const queriedIds = new Set<string>();

    for (const chunk of chunks) {
      try {
        const response = await this.api.v2.tweets(chunk, {
          'tweet.fields': 'public_metrics',
        });
        apiCallsUsed++;

        // Mark entire chunk as successfully queried
        for (const id of chunk) queriedIds.add(id);

        for (const tweet of response.data ?? []) {
          foundIds.add(tweet.id);
          const pm = tweet.public_metrics;
          if (!pm) continue;

          const metrics: TweetMetricsUpdate = {
            tweetId: tweet.id,
            likes: pm.like_count,
            retweets: pm.retweet_count,
            replies: pm.reply_count,
            impressions: pm.impression_count ?? 0,
            quotes: pm.quote_count ?? 0,
            bookmarks: pm.bookmark_count ?? 0,
          };

          this.repo.updateTweetMetrics(metrics);
          this.repo.insertSnapshot(metrics);
          this.repo.backfillRoast(
            tweet.id,
            pm.like_count,
            pm.retweet_count,
            pm.reply_count,
            pm.impression_count ?? 0,
          );

          updated++;
        }

        // Check for errors (tweets that Twitter couldn't find)
        if (response.errors) {
          for (const err of response.errors) {
            if (err.resource_id && !foundIds.has(err.resource_id)) {
              this.logger.warn(
                { tweetId: err.resource_id, error: err.title },
                'Tweet not found on Twitter — marking as deleted',
              );
              this.repo.markDeleted(err.resource_id);
              deleted++;
            }
          }
        }

        this.repo.logApiUsage('metrics', 'tweets_lookup', 1);
      } catch (error) {
        this.logger.error(
          { err: error, chunkSize: chunk.length },
          'Failed to fetch tweet metrics batch — skipping chunk for deletion detection',
        );
      }
    }

    // Mark tweets missing from successfully queried chunks as deleted
    for (const tweetId of queriedIds) {
      if (!foundIds.has(tweetId)) {
        const existing = this.repo.getBotTweet(tweetId);
        if (existing && existing.twitter_status === 'live') {
          this.repo.markDeleted(tweetId);
          deleted++;
          this.logger.warn({ tweetId }, 'Tweet missing from API response — marked as deleted');
        }
      }
    }

    this.logger.info(
      { updated, deleted, skipped, apiCallsUsed },
      'Metrics refresh complete',
    );

    return { updated, deleted, skipped, apiCallsUsed, readsUsed: toRefresh.length };
  }
}

import type { Logger } from 'pino';
import type { TwitterClient } from '@twitter/twitter-client.js';
import type { RoastRepository } from '@storage/repositories/roast.repository.js';
import type Database from 'better-sqlite3';

export class EngagementTracker {
  private readonly twitter: TwitterClient;
  private readonly roastRepo: RoastRepository;
  private readonly insertSnapshotStmt: Database.Statement;
  private readonly logger: Logger;

  constructor(opts: {
    twitter: TwitterClient;
    roastRepo: RoastRepository;
    db: Database.Database;
    logger: Logger;
  }) {
    this.twitter = opts.twitter;
    this.roastRepo = opts.roastRepo;
    this.logger = opts.logger;

    this.insertSnapshotStmt = opts.db.prepare(`
      INSERT INTO engagement_snapshots (roast_id, likes, retweets, replies, impressions)
      VALUES (?, ?, ?, ?, ?)
    `);
  }

  async trackRecent(): Promise<number> {
    if (!this.twitter.isConfigured) {
      this.logger.debug('Engagement tracking skipped — Twitter not configured');
      return 0;
    }

    // Get recent posted roasts with tweet IDs
    const recent = this.roastRepo.getRecent(20, 'posted');
    const withTweets = recent.filter((r) => r.tweetId && !r.tweetId.startsWith('dry_'));

    if (withTweets.length === 0) {
      this.logger.debug('No tweets to track engagement for');
      return 0;
    }

    const tweetIds = withTweets.map((r) => r.tweetId!);
    const metrics = await this.twitter.getTweetMetrics(tweetIds);

    let updated = 0;
    for (const roast of withTweets) {
      const m = metrics.get(roast.tweetId!);
      if (!m) continue;

      // Update cumulative engagement on the roast record
      this.roastRepo.updateEngagement(roast.id, m);

      // Insert a time-series snapshot
      this.insertSnapshotStmt.run(roast.id, m.likes, m.retweets, m.replies, m.impressions);

      // Alert on viral tweets (>50 likes or >10 retweets within tracking window)
      if (m.likes > 50 || m.retweets > 10) {
        this.logger.warn(
          { roastId: roast.id, tweetId: roast.tweetId, target: roast.targetName, ...m },
          'Viral alert — high engagement detected',
        );
      }

      updated++;
    }

    this.logger.info({ tracked: updated, total: withTweets.length }, 'Engagement snapshot captured');
    return updated;
  }
}

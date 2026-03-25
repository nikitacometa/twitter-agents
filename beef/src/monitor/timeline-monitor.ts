import type { Logger } from 'pino';
import type { TwitterClient } from '@twitter/twitter-client.js';
import type { ConfigRepository } from '@storage/repositories/config.repository.js';
import type { MonitorRepository } from './monitor.repository.js';
import { MONITOR_TARGETS, buildSearchBatches, buildSearchQuery, buildTargetMap } from './monitor-targets.js';
import type { ScoredTweet } from './tweet-scorer.js';
import { scoreTweet } from './tweet-scorer.js';
import { sendMonitorDigest } from './notify.js';

export interface MonitorPollResult {
  tweetsFound: number;
  notified: number;
  budgetExceeded: boolean;
}

const DEFAULT_BUDGET_CEILING = 14_000;
const DIGEST_TOP_N = 20;

export class TimelineMonitor {
  private readonly twitter: TwitterClient;
  private readonly configRepo: ConfigRepository;
  private readonly monitorRepo: MonitorRepository;
  private readonly telegramToken: string;
  private readonly adminIds: number[];
  private readonly logger: Logger;
  private readonly budgetCeiling: number;
  private readonly batches: string[][];
  private readonly targetMap: Map<string, (typeof MONITOR_TARGETS)[number]>;
  private isRunning = false;

  constructor(opts: {
    twitter: TwitterClient;
    configRepo: ConfigRepository;
    monitorRepo: MonitorRepository;
    telegramToken: string;
    adminIds: number[];
    logger: Logger;
    budgetCeiling?: number;
  }) {
    this.twitter = opts.twitter;
    this.configRepo = opts.configRepo;
    this.monitorRepo = opts.monitorRepo;
    this.telegramToken = opts.telegramToken;
    this.adminIds = opts.adminIds;
    this.logger = opts.logger;
    this.budgetCeiling = opts.budgetCeiling ?? DEFAULT_BUDGET_CEILING;
    this.batches = buildSearchBatches(MONITOR_TARGETS);
    this.targetMap = buildTargetMap(MONITOR_TARGETS);

    this.logger.info(
      { targets: MONITOR_TARGETS.length, batches: this.batches.length, budgetCeiling: this.budgetCeiling },
      'Timeline monitor initialized',
    );
  }

  async poll(): Promise<MonitorPollResult> {
    if (this.isRunning) {
      this.logger.debug('Timeline monitor poll skipped — already running');
      return { tweetsFound: 0, notified: 0, budgetExceeded: false };
    }

    this.isRunning = true;
    try {
      return await this.doPoll();
    } finally {
      this.isRunning = false;
    }
  }

  private async doPoll(): Promise<MonitorPollResult> {
    // Budget check
    const monthlyReads = this.monitorRepo.getMonthlyReads();
    if (monthlyReads >= this.budgetCeiling) {
      this.logger.warn({ monthlyReads, ceiling: this.budgetCeiling }, 'Timeline monitor: API budget ceiling reached');
      return { tweetsFound: 0, notified: 0, budgetExceeded: true };
    }

    const allScored: ScoredTweet[] = [];

    for (let batchIdx = 0; batchIdx < this.batches.length; batchIdx++) {
      const handles = this.batches[batchIdx]!;
      const query = buildSearchQuery(handles);
      const sinceIdKey = `monitor_since_id_batch_${String(batchIdx)}`;
      const sinceId = this.configRepo.get(sinceIdKey);

      try {
        const tweets = await this.twitter.searchRecentTweets(query, sinceId);

        // Log API reads
        this.monitorRepo.logApiUsage(tweets.length);

        if (tweets.length === 0) {
          this.logger.debug({ batchIdx, sinceId }, 'Timeline monitor batch: no new tweets');
          continue;
        }

        // Update since_id to newest tweet
        const newestId = tweets.reduce(
          (max, t) => (BigInt(t.tweetId) > BigInt(max) ? t.tweetId : max),
          tweets[0]!.tweetId,
        );
        this.configRepo.set(sinceIdKey, newestId);

        // Score tweets
        for (const tweet of tweets) {
          if (this.monitorRepo.hasSeen(tweet.tweetId)) continue;

          const target = this.targetMap.get(tweet.authorUsername.toLowerCase());
          if (!target) {
            this.monitorRepo.markSeen(tweet.tweetId, tweet.authorUsername, 0, false);
            continue;
          }

          const scored = scoreTweet(tweet.tweetId, tweet.text, tweet.authorUsername, tweet.createdAt, target);

          if (!scored) {
            this.monitorRepo.markSeen(tweet.tweetId, tweet.authorUsername, 0, false);
            continue;
          }

          allScored.push(scored);
        }

        this.logger.info({ batchIdx, tweetsFound: tweets.length }, 'Timeline monitor batch processed');
      } catch (error) {
        this.logger.error({ err: error, batchIdx }, 'Timeline monitor batch failed');
      }
    }

    // Sort by score desc, then freshness (lower age = better)
    allScored.sort((a, b) => b.score - a.score || a.ageMinutes - b.ageMinutes);

    // Top N for digest
    const digest = allScored.slice(0, DIGEST_TOP_N);
    const rest = allScored.slice(DIGEST_TOP_N);

    // Mark all as seen
    for (const t of digest) {
      this.monitorRepo.markSeen(t.tweetId, t.authorHandle, t.score, true);
    }
    for (const t of rest) {
      this.monitorRepo.markSeen(t.tweetId, t.authorHandle, t.score, false);
    }

    // Send single digest
    let totalNotified = 0;
    if (digest.length > 0) {
      try {
        await sendMonitorDigest(this.telegramToken, this.adminIds, digest);
        totalNotified = digest.length;
        this.logger.info(
          { digestSize: digest.length, topScore: digest[0]?.score, totalScored: allScored.length },
          'Monitor digest sent',
        );
      } catch (error) {
        this.logger.warn({ err: error }, 'Failed to send monitor digest');
      }
    }

    // Probabilistic prune (~1% chance per poll)
    if (Math.random() < 0.01) {
      const pruned = this.monitorRepo.pruneOld();
      if (pruned > 0) {
        this.logger.info({ pruned }, 'Pruned old monitor records');
      }
    }

    return { tweetsFound: allScored.length, notified: totalNotified, budgetExceeded: false };
  }
}

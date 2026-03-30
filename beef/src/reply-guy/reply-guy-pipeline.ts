import type { Logger } from 'pino';
import type { ScoredTweet } from '../monitor/tweet-scorer.js';
import type { ProviderManager } from '../agent/provider-manager.js';
import type { ITwitterClient, TweetData } from '../twitter/twitter-client.interface.js';
import type { FeedbackRepository } from '../storage/repositories/feedback.repository.js';
import type { ConfigRepository } from '../storage/repositories/config.repository.js';
import type { ExternalExampleRepository } from '../storage/repositories/external-example.repository.js';
import type { RoastPatternRepository } from '../storage/repositories/roast-pattern.repository.js';
import type { StockpileRepository } from '../storage/repositories/stockpile.repository.js';
import type { FarmAttemptRepository } from '../storage/repositories/farm-attempt.repository.js';
import type { ReplyGuyCandidateRepository } from './reply-guy-candidate.repository.js';
import { ReplyGuySelector } from './reply-guy-selector.js';
import type { SelectorConfig } from './reply-guy-selector.js';
import type { EvaluatedCandidate, CycleResult } from './types.js';
import { generateRoastsLightning, generateRoastsMax } from '../admin/roast-generator.js';
import { buildTweetRoastContext } from '../roast/prompt-builder.js';
import type { TweetRoastContextInput } from '../roast/prompt-builder.js';
import { formatDryRunMessage, formatLivePostMessage, sendReplyGuyNotification } from './reply-guy-notify.js';
import type { RunnerUp } from './reply-guy-notify.js';
import { routeCandidates } from './pipeline-router.js';
import { isQuietHour } from '@scheduler/scheduler.js';

const CYCLE_TIMEOUT_MS = 3 * 60 * 1000;

export interface ReplyGuyPipelineConfig {
  provider: ProviderManager;
  twitterClient: ITwitterClient;
  candidateRepo: ReplyGuyCandidateRepository;
  logger: Logger;
  telegramToken: string;
  adminChatId: number | string;
  dryRun: boolean;
  selectorConfig: SelectorConfig;
  maxDaily: number;
  // Repos for roast generation
  feedbackRepo?: FeedbackRepository;
  configRepo?: ConfigRepository;
  exampleRepo?: ExternalExampleRepository;
  patternRepo?: RoastPatternRepository;
  stockpileRepo?: StockpileRepository;
  farmAttemptRepo?: FarmAttemptRepository;
}

export class ReplyGuyPipeline {
  private readonly selector: ReplyGuySelector;
  private readonly config: ReplyGuyPipelineConfig;
  private isRunning = false;

  constructor(config: ReplyGuyPipelineConfig) {
    this.config = config;
    this.selector = new ReplyGuySelector(
      config.provider,
      config.candidateRepo,
      config.logger,
    );
  }

  async processCycle(scoredTweets: ScoredTweet[]): Promise<CycleResult> {
    if (this.isRunning) {
      this.config.logger.debug('Reply guy: cycle skipped — already running');
      return { candidates: 0, evaluated: 0, winners: 0, generated: 0, notified: 0, errors: 0, maxUsed: 0 };
    }

    this.isRunning = true;
    const cycleStart = Date.now();
    const result: CycleResult = { candidates: 0, evaluated: 0, winners: 0, generated: 0, notified: 0, errors: 0, maxUsed: 0 };

    try {
      // 0a. Skip during quiet hours (UTC 5-10 — US sleeping, EU commuting)
      if (isQuietHour()) {
        this.config.logger.debug('Reply guy: skipping cycle — quiet hours');
        return result;
      }

      // 0b. Kill-switch via Telegram /replyguy off
      if (this.config.configRepo?.get('reply_guy_enabled') === 'false') {
        this.config.logger.debug('Reply guy: skipping cycle — disabled via kill-switch');
        return result;
      }

      // 1. Hard filter
      const candidates = this.selector.filterCandidates(scoredTweets, this.config.selectorConfig);
      result.candidates = candidates.length;

      if (candidates.length === 0) {
        return result;
      }

      this.config.logger.info(
        { candidates: candidates.length, total: scoredTweets.length },
        'Reply guy: candidates after hard filter',
      );

      // 2. LLM batch evaluation
      const winners = await this.selector.evaluateBatch(
        candidates,
        this.config.selectorConfig.minRoastability,
        this.config.selectorConfig.maxPerCycle,
      );
      result.evaluated = candidates.length;
      result.winners = winners.length;

      if (winners.length === 0) {
        this.config.logger.info('Reply guy: no winners above roastability threshold');
        return result;
      }

      // 3. Route candidates to Lightning vs Max
      const todayMaxCount = this.config.candidateRepo.getTodayMaxCount();
      const decisions = routeCandidates(winners, {
        maxDailyBudget: this.config.maxDaily,
        todayMaxCount,
      });

      const maxDecision = decisions.find((d) => d.pipeline === 'max');
      const lightningDecisions = decisions.filter((d) => d.pipeline === 'lightning');

      this.config.logger.info(
        { total: winners.length, lightning: lightningDecisions.length, max: maxDecision ? 1 : 0, todayMaxCount },
        'Reply guy: routing complete',
      );

      // 4. Start Max generation immediately (non-blocking)
      let maxPromise: Promise<void> | null = null;
      if (maxDecision) {
        result.maxUsed = 1;
        maxPromise = this.processWinnerMax(maxDecision.candidate, result).catch(async (err: unknown) => {
          this.config.logger.error(
            { err, tweetId: maxDecision.candidate.tweet.tweetId, author: maxDecision.candidate.tweet.authorHandle },
            'Reply guy: Max failed — falling back to Lightning',
          );
          try {
            await this.processWinnerLightning(maxDecision.candidate, result);
          } catch (fallbackErr) {
            result.errors++;
            this.config.logger.error(
              { err: fallbackErr, tweetId: maxDecision.candidate.tweet.tweetId },
              'Reply guy: Lightning fallback also failed',
            );
          }
        });
      }

      // 5. Process Lightning winners within cycle timeout
      for (const decision of lightningDecisions) {
        if (Date.now() - cycleStart > CYCLE_TIMEOUT_MS) {
          this.config.logger.warn('Reply guy: cycle timeout — aborting remaining Lightning winners');
          break;
        }

        try {
          await this.processWinnerLightning(decision.candidate, result);
        } catch (error) {
          result.errors++;
          this.config.logger.error(
            { err: error, tweetId: decision.candidate.tweet.tweetId, author: decision.candidate.tweet.authorHandle },
            'Reply guy: Lightning processing failed',
          );
        }
      }

      // 6. Await Max completion (started above, runs concurrently with Lightning)
      if (maxPromise) {
        await maxPromise;
      }

      // Probabilistic prune (~1% chance per cycle)
      if (Math.random() < 0.01) {
        const pruned = this.config.candidateRepo.pruneOld();
        if (pruned > 0) {
          this.config.logger.info({ pruned }, 'Reply guy: pruned old candidates');
        }
      }

      this.config.logger.info(result, 'Reply guy: cycle complete');
      return result;
    } finally {
      this.isRunning = false;
    }
  }

  private async buildWinnerContext(
    winner: EvaluatedCandidate,
  ): Promise<{ tweetData: TweetData | null; profileContext: string }> {
    const { logger, twitterClient } = this.config;
    const t = winner.tweet;

    let tweetData: TweetData | null = null;
    if (twitterClient.getTweet) {
      try {
        tweetData = await twitterClient.getTweet(t.tweetId);
      } catch (error) {
        logger.warn({ err: error, tweetId: t.tweetId }, 'Reply guy: failed to fetch tweet data');
      }
    }

    const contextInput: TweetRoastContextInput = {
      tweetText: tweetData?.text ?? t.text,
      tweetAuthor: t.authorHandle,
      metrics: tweetData?.likes != null
        ? {
            likes: tweetData.likes ?? 0,
            retweets: tweetData.retweets ?? 0,
            replies: tweetData.replies ?? 0,
            views: tweetData.views,
          }
        : undefined,
    };

    if (tweetData?.inReplyToTweetId && twitterClient.getTweet) {
      try {
        const parent = await twitterClient.getTweet(tweetData.inReplyToTweetId);
        if (parent) {
          contextInput.parentTweet = { text: parent.text, author: parent.authorName };
        }
      } catch {
        // Non-critical — proceed without parent context
      }
    }

    if (tweetData?.quotedTweetId && twitterClient.getTweet) {
      try {
        const quoted = await twitterClient.getTweet(tweetData.quotedTweetId);
        if (quoted) {
          contextInput.quotedTweet = { text: quoted.text, author: quoted.authorName };
        }
      } catch {
        // Non-critical
      }
    }

    return { tweetData, profileContext: buildTweetRoastContext(contextInput) };
  }

  private async processWinnerLightning(winner: EvaluatedCandidate, result: CycleResult): Promise<void> {
    const { logger, candidateRepo } = this.config;
    const t = winner.tweet;

    const { tweetData, profileContext } = await this.buildWinnerContext(winner);

    const lightningResult = await generateRoastsLightning(
      `tweet by @${t.authorHandle}`,
      this.config.provider,
      logger,
      this.config.feedbackRepo,
      this.config.configRepo,
      this.config.exampleRepo,
      this.config.patternRepo,
      this.config.stockpileRepo,
      this.config.farmAttemptRepo,
      undefined,
      profileContext,
      true,
    );

    if (lightningResult.variants.length === 0) {
      logger.warn({ tweetId: t.tweetId }, 'Reply guy: Lightning produced 0 variants');
      candidateRepo.markSkipped(t.tweetId, winner.roastability, 'No variants passed filters');
      return;
    }

    const best = lightningResult.variants[0]!;
    candidateRepo.markGenerated(t.tweetId, best.text, best.score, 'lightning');

    const runnerUps: RunnerUp[] = lightningResult.variants.slice(1, 3).map((v) => ({ text: v.text, score: v.score }));
    await this.postOrNotify(winner, tweetData, best.text, 'lightning', lightningResult.stats.durationMs, result, runnerUps);
  }

  private async processWinnerMax(winner: EvaluatedCandidate, result: CycleResult): Promise<void> {
    const { logger, candidateRepo } = this.config;
    const t = winner.tweet;

    const { tweetData, profileContext } = await this.buildWinnerContext(winner);

    const maxResult = await generateRoastsMax({
      targetName: `tweet by @${t.authorHandle}`,
      provider: this.config.provider,
      logger,
      feedbackRepo: this.config.feedbackRepo,
      configRepo: this.config.configRepo,
      exampleRepo: this.config.exampleRepo,
      patternRepo: this.config.patternRepo,
      stockpileRepo: this.config.stockpileRepo,
      farmAttemptRepo: this.config.farmAttemptRepo,
      profileContext,
      tweetMode: true,
      quick: true,
    });

    const best = maxResult.variants[0]!;
    candidateRepo.markGenerated(t.tweetId, best.text, best.judgeScore, 'max');

    logger.info(
      {
        tweetId: t.tweetId,
        author: t.authorHandle,
        tier: t.tier,
        durationMs: maxResult.stats.durationMs,
        pipelines: maxResult.stats.pipelineResults.map((p) => `${p.pipeline}:${p.status}`).join(','),
      },
      'Reply guy: Max generation complete',
    );

    const runnerUps: RunnerUp[] = maxResult.variants.slice(1, 3).map((v) => ({ text: v.text, score: v.judgeScore }));
    await this.postOrNotify(winner, tweetData, best.text, 'max', maxResult.stats.durationMs, result, runnerUps);
  }

  private async postOrNotify(
    winner: EvaluatedCandidate,
    tweetData: TweetData | null,
    roastText: string,
    pipelineType: 'lightning' | 'max',
    durationMs: number,
    result: CycleResult,
    runnerUps?: RunnerUp[],
  ): Promise<void> {
    const { twitterClient, candidateRepo, dryRun, logger } = this.config;
    const t = winner.tweet;
    const dailyCount = candidateRepo.getTodayCount() + 1;

    if (dryRun) {
      candidateRepo.markPosted(t.tweetId, null);
      result.generated++;

      const html = formatDryRunMessage(
        winner,
        tweetData,
        roastText,
        dailyCount,
        this.config.selectorConfig.dailyCap,
        pipelineType,
        durationMs,
        runnerUps,
      );

      try {
        await sendReplyGuyNotification(this.config.telegramToken, this.config.adminChatId, html);
        result.notified++;
      } catch (error) {
        logger.warn({ err: error }, 'Reply guy: failed to send dry-run notification');
      }
    } else {
      const postResult = await twitterClient.replyToTweet(roastText, t.tweetId);

      if (postResult) {
        const isUnconfirmed = postResult.tweetId.startsWith('pw_unconfirmed_');

        if (isUnconfirmed) {
          // Don't count unconfirmed toward daily cap — mark as generated but not posted
          logger.warn({ tweetId: t.tweetId, pwId: postResult.tweetId }, 'Reply guy: post unconfirmed — tweet may or may not exist');
        } else {
          candidateRepo.markPosted(t.tweetId, postResult.tweetId);
          result.generated++;
        }
        result.notified++;

        const html = formatLivePostMessage(
          winner,
          roastText,
          postResult.tweetId,
          dailyCount,
          this.config.selectorConfig.dailyCap,
          pipelineType,
          durationMs,
          runnerUps,
          isUnconfirmed,
        );
        try {
          await sendReplyGuyNotification(this.config.telegramToken, this.config.adminChatId, html);
        } catch (error) {
          logger.warn({ err: error }, 'Reply guy: failed to send live post notification');
        }
      } else {
        logger.error({ tweetId: t.tweetId }, 'Reply guy: replyToTweet returned null — posting failed');
        result.errors++;
      }
    }
  }
}

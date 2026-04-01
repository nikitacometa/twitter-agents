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
import type { MetricsRepository } from '../metrics/metrics.repository.js';
import type { ReplyGuyCandidateRepository } from './reply-guy-candidate.repository.js';
import type { GenerationMetadata } from './reply-guy-candidate.repository.js';
import { ReplyGuySelector } from './reply-guy-selector.js';
import type { SelectorConfig } from './reply-guy-selector.js';
import type { EvaluatedCandidate, CycleResult } from './types.js';
import { generateRoastsLightning, generateRoastsMax } from '../admin/roast-generator.js';
import type { MaxRoastResult } from '../admin/roast-generator.js';
import { buildTweetRoastContext } from '../roast/prompt-builder.js';
import type { TweetRoastContextInput } from '../roast/prompt-builder.js';
import { formatDryRunMessage, formatLivePostMessage, sendReplyGuyNotification } from './reply-guy-notify.js';
import type { RunnerUp } from './reply-guy-notify.js';
import { routeCandidates } from './pipeline-router.js';
import { isQuietHour } from '@scheduler/scheduler.js';

interface WinnerContext {
  tweetData: TweetData | null;
  profileContext: string;
}

/** Max cycle duration — allows 2-3 Max runs (~8 min each) plus eval overhead */
const CYCLE_TIMEOUT_MS = 20 * 60 * 1000;

export interface ReplyGuyPipelineConfig {
  provider: ProviderManager;
  twitterClient: ITwitterClient;
  candidateRepo: ReplyGuyCandidateRepository;
  metricsRepo?: MetricsRepository;
  logger: Logger;
  telegramToken: string;
  adminChatId: number | string;
  dryRun: boolean;
  maxDailyPosts: number;
  selectorConfig: SelectorConfig;
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
      this.config.logger.info('Reply guy: cycle skipped — already running');
      return { candidates: 0, evaluated: 0, winners: 0, generated: 0, notified: 0, errors: 0 };
    }

    this.isRunning = true;
    const cycleStart = Date.now();
    const result: CycleResult = { candidates: 0, evaluated: 0, winners: 0, generated: 0, notified: 0, errors: 0 };

    try {
      this.config.logger.info({ tweets: scoredTweets.length }, 'Reply guy: cycle started');

      // 0a. Skip during quiet hours (UTC 5-10 — US sleeping, EU commuting)
      if (isQuietHour()) {
        this.config.logger.info('Reply guy: skipping cycle — quiet hours');
        return result;
      }

      // 0b. Kill-switch via Telegram /replyguy off
      if (this.config.configRepo?.get('reply_guy_enabled') === 'false') {
        this.config.logger.info('Reply guy: skipping cycle — disabled via kill-switch');
        return result;
      }

      // 1. Hard filter
      const candidates = this.selector.filterCandidates(scoredTweets, this.config.selectorConfig);
      result.candidates = candidates.length;

      if (candidates.length === 0) {
        this.config.logger.info({ total: scoredTweets.length }, 'Reply guy: no candidates after hard filter');
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

      // 3. Check daily posting cap
      const todayPosted = this.config.candidateRepo.getTodayPostedCount();
      const postsRemaining = this.config.maxDailyPosts - todayPosted;
      if (postsRemaining <= 0) {
        this.config.logger.info(
          { todayPosted, cap: this.config.maxDailyPosts },
          'Reply guy: daily posting cap reached — skipping generation',
        );
        return result;
      }

      // 4. Route all candidates to Max (Lightning only as fallback)
      const decisions = routeCandidates(winners).slice(0, postsRemaining);

      this.config.logger.info(
        { total: decisions.length, dryRun: this.config.dryRun, todayPosted, postsRemaining },
        'Reply guy: processing winners via Max pipeline',
      );

      // 5. Process all winners sequentially via Max with Lightning fallback
      for (const decision of decisions) {
        if (Date.now() - cycleStart > CYCLE_TIMEOUT_MS) {
          this.config.logger.warn(
            { elapsed: Math.round((Date.now() - cycleStart) / 1000) },
            'Reply guy: cycle timeout — aborting remaining winners',
          );
          break;
        }

        try {
          await this.processWinner(decision.candidate, result);
        } catch (error) {
          result.errors++;
          this.config.logger.error(
            { err: error, tweetId: decision.candidate.tweet.tweetId, author: decision.candidate.tweet.authorHandle },
            'Reply guy: winner processing failed completely',
          );
        }
      }

      // Probabilistic prune (~1% chance per cycle)
      if (Math.random() < 0.01) {
        const pruned = this.config.candidateRepo.pruneOld();
        if (pruned > 0) {
          this.config.logger.info({ pruned }, 'Reply guy: pruned old candidates');
        }
      }

      this.config.logger.info(
        { ...result, dryRun: this.config.dryRun, cycleMs: Date.now() - cycleStart },
        'Reply guy: cycle complete',
      );
      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process a winner: build context once, try Max, fall back to Lightning on failure.
   * Context is built once and shared to avoid duplicate Twitter API calls on fallback.
   */
  private async processWinner(winner: EvaluatedCandidate, result: CycleResult): Promise<void> {
    const { logger } = this.config;
    const t = winner.tweet;

    const ctx = await this.buildWinnerContext(winner);

    try {
      await this.processWinnerMax(winner, ctx, result);
    } catch (maxErr) {
      logger.error(
        { err: maxErr, tweetId: t.tweetId, author: t.authorHandle },
        'Reply guy: Max failed — falling back to Lightning',
      );

      try {
        await this.processWinnerLightning(winner, ctx, result);
      } catch (lightningErr) {
        logger.error(
          { err: lightningErr, tweetId: t.tweetId },
          'Reply guy: Lightning fallback also failed',
        );
        throw lightningErr;
      }
    }
  }

  private async buildWinnerContext(
    winner: EvaluatedCandidate,
  ): Promise<WinnerContext> {
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

  private async processWinnerMax(
    winner: EvaluatedCandidate,
    ctx: WinnerContext,
    result: CycleResult,
  ): Promise<void> {
    const { logger, candidateRepo } = this.config;
    const t = winner.tweet;

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
      profileContext: ctx.profileContext,
      tweetMode: true,
      quick: true,
    });

    if (maxResult.variants.length === 0) {
      logger.warn({ tweetId: t.tweetId }, 'Reply guy: Max produced 0 variants');
      throw new Error('Max produced 0 variants after filtering');
    }

    const best = maxResult.variants[0]!;
    const runnerUps: RunnerUp[] = maxResult.variants.slice(1, 4).map((v) => ({ text: v.text, score: v.judgeScore }));

    const metadata = buildMaxMetadata(maxResult, runnerUps);
    candidateRepo.markGeneratedWithMetadata(t.tweetId, best.text, best.judgeScore, 'max', metadata);

    logger.info(
      {
        tweetId: t.tweetId,
        author: t.authorHandle,
        tier: t.tier,
        score: best.judgeScore,
        angle: best.angle,
        pipeline: best.pipeline,
        durationMs: maxResult.stats.durationMs,
        variants: maxResult.stats.totalGenerated,
        afterDedup: maxResult.stats.afterDedup,
      },
      'Reply guy: Max generation complete',
    );

    await this.postOrNotify(winner, ctx.tweetData, best.text, 'max', maxResult.stats.durationMs, result, runnerUps);
  }

  private async processWinnerLightning(
    winner: EvaluatedCandidate,
    ctx: WinnerContext,
    result: CycleResult,
  ): Promise<void> {
    const { logger, candidateRepo } = this.config;
    const t = winner.tweet;

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
      ctx.profileContext,
      true,
    );

    if (lightningResult.variants.length === 0) {
      logger.warn({ tweetId: t.tweetId }, 'Reply guy: Lightning produced 0 variants');
      candidateRepo.markSkipped(t.tweetId, winner.roastability, 'No variants passed filters');
      return;
    }

    const best = lightningResult.variants[0]!;
    const runnerUps: RunnerUp[] = lightningResult.variants.slice(1, 3).map((v) => ({ text: v.text, score: v.score }));

    const metadata: GenerationMetadata = {
      durationMs: lightningResult.stats.durationMs,
      variantsTotal: lightningResult.stats.generated,
      variantsFiltered: lightningResult.stats.afterDedup,
      runnerUps: runnerUps.map((r) => ({ text: r.text, score: r.score })),
    };
    candidateRepo.markGeneratedWithMetadata(t.tweetId, best.text, best.score, 'lightning', metadata);

    logger.info(
      { tweetId: t.tweetId, author: t.authorHandle, score: best.score, durationMs: lightningResult.stats.durationMs },
      'Reply guy: Lightning fallback generation complete',
    );

    await this.postOrNotify(winner, ctx.tweetData, best.text, 'lightning', lightningResult.stats.durationMs, result, runnerUps);
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
          logger.warn(
            { tweetId: t.tweetId, pwId: postResult.tweetId },
            'Reply guy: post unconfirmed — tweet may or may not exist',
          );
        } else {
          candidateRepo.markPosted(t.tweetId, postResult.tweetId);
          result.generated++;

          // Record in bot_tweets for metrics pipeline (engagement tracking, daily aggregates)
          this.recordBotTweet(postResult.tweetId, roastText, t.tweetId);

          logger.info(
            { tweetId: t.tweetId, postedTweetId: postResult.tweetId, author: t.authorHandle, pipeline: pipelineType },
            'Reply guy: posted successfully',
          );
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
        try {
          const tweetUrl = `https://x.com/i/status/${t.tweetId}`;
          const html = [
            `❌ <b>Reply Guy posting failed</b>`,
            `Target: <a href="${tweetUrl}">@${winner.tweet.authorHandle}</a> (${pipelineType})`,
            `Roast: <code>${roastText.slice(0, 200)}</code>`,
            `Duration: ${String(Math.round(durationMs / 1000))}s`,
          ].join('\n');
          await sendReplyGuyNotification(this.config.telegramToken, this.config.adminChatId, html);
        } catch (notifErr) {
          logger.warn({ err: notifErr }, 'Reply guy: failed to send error notification');
        }
      }
    }
  }

  /**
   * Insert a reply-guy post into bot_tweets for the metrics pipeline.
   * This enables engagement tracking, daily aggregates, and performance analysis.
   */
  private recordBotTweet(postedTweetId: string, text: string, inReplyToTweetId: string): void {
    if (!this.config.metricsRepo) return;

    try {
      this.config.metricsRepo.insertBotTweet({
        tweetId: postedTweetId,
        text,
        createdAt: new Date().toISOString(),
        inReplyToTweetId,
        referencedTweetId: inReplyToTweetId,
        referencedTweetType: 'replied_to',
        isReply: true,
        isQuote: false,
        hasMedia: false,
        hasLink: /https?:\/\//.test(text),
        hasMention: true,
      });
    } catch (error) {
      this.config.logger.warn(
        { err: error, postedTweetId },
        'Reply guy: failed to record bot tweet — metrics may be incomplete',
      );
    }
  }
}

function buildMaxMetadata(maxResult: MaxRoastResult, runnerUps: RunnerUp[]): GenerationMetadata {
  return {
    durationMs: maxResult.stats.durationMs,
    variantsTotal: maxResult.stats.totalGenerated,
    variantsFiltered: maxResult.stats.afterDedup,
    runnerUps: runnerUps.map((r) => ({ text: r.text, score: r.score })),
    pipelineStats: maxResult.stats.pipelineResults.map((p) => ({
      pipeline: p.pipeline,
      status: p.status,
      variants: p.variants,
      durationMs: p.durationMs,
    })),
  };
}

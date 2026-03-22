import type { Logger } from 'pino';
import type { TargetType, RoastSource } from '@common/types/index.js';
import type { QueueRepository } from '@storage/repositories/queue.repository.js';
import type { RoastRepository } from '@storage/repositories/roast.repository.js';
import type { ConfigRepository } from '@storage/repositories/config.repository.js';
import type { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import type { StockpileRepository } from '@storage/repositories/stockpile.repository.js';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { ITwitterClient } from '@twitter/twitter-client.interface.js';
import type { IProfileFetcher } from '@twitter/twitter-client.interface.js';
import { generateRoasts } from '@admin/roast-generator.js';
import type { GenerateRoastsResult } from '@admin/roast-generator.js';
import { RoastEngine } from '@roast/roast-engine.js';
import { SelfEvaluator } from '@farm/self-evaluator.js';
import type { FarmAttempt } from '@farm/types.js';
import { classifyFreshness, calculateExpiry } from '@farm/freshness.js';
import { getErrorMessage } from '@common/utils/error.util.js';
import { isQuietHour } from '@scheduler/scheduler.js';
import { downloadTweetMedia } from '@common/utils/media-downloader.js';
import type { ActivityLogger } from '../activity/activity-logger.js';

export interface QueueProcessResult {
  dequeued: boolean;
  posted?: boolean;
  savedOnly?: boolean;
  pendingApproval?: boolean;
  roastId?: number;
  tweetId?: string;
  target?: string;
  error?: string;
  fromStockpile?: boolean;
  evaluationScore?: number;
  newStockpileCount?: number;
  postedText?: string;
  stockpiledVariants?: Array<{ text: string; score: number; angle: string }>;
}

export class QueueManager {
  private readonly queueRepo: QueueRepository;
  private readonly roastRepo: RoastRepository;
  private readonly configRepo: ConfigRepository;
  private readonly feedbackRepo: FeedbackRepository;
  private readonly provider: ProviderManager;
  private readonly twitter?: ITwitterClient;
  private readonly profileFetcher?: IProfileFetcher;
  private readonly stockpile?: StockpileRepository;
  private readonly logger: Logger;
  private readonly dailyLimit: number;
  private readonly mentionReplyLimit: number;
  private readonly enableMentionReplies: boolean;
  private readonly casualReplyLimit: number;
  private readonly evaluationThreshold: number;
  private readonly activityLogger?: ActivityLogger;
  private cachedRoastEngine: RoastEngine | null = null;
  private cachedEvaluator: SelfEvaluator | null = null;
  private readonly pendingApprovals = new Map<number, { stockpileId?: number }>();
  private readonly approvingIds = new Set<number>();

  constructor(opts: {
    queueRepo: QueueRepository;
    roastRepo: RoastRepository;
    configRepo: ConfigRepository;
    feedbackRepo: FeedbackRepository;
    provider: ProviderManager;
    twitter?: ITwitterClient;
    profileFetcher?: IProfileFetcher;
    stockpile?: StockpileRepository;
    logger: Logger;
    dailyLimit: number;
    mentionReplyLimit?: number;
    casualReplyLimit?: number;
    enableMentionReplies: boolean;
    evaluationThreshold?: number;
    activityLogger?: ActivityLogger;
  }) {
    this.queueRepo = opts.queueRepo;
    this.roastRepo = opts.roastRepo;
    this.configRepo = opts.configRepo;
    this.feedbackRepo = opts.feedbackRepo;
    this.provider = opts.provider;
    this.twitter = opts.twitter;
    this.profileFetcher = opts.profileFetcher;
    this.stockpile = opts.stockpile;
    this.logger = opts.logger;
    this.dailyLimit = opts.dailyLimit;
    this.mentionReplyLimit = opts.mentionReplyLimit ?? 20;
    this.casualReplyLimit = opts.casualReplyLimit ?? 40;
    this.evaluationThreshold = opts.evaluationThreshold ?? 3.5;
    this.enableMentionReplies = opts.enableMentionReplies;
    this.activityLogger = opts.activityLogger;
  }

  /**
   * Process one item from the queue (respects pause/quiet/limits).
   */
  async processNext(): Promise<QueueProcessResult> {
    const runtime = this.configRepo.getRuntime();
    if (runtime.paused) {
      this.logger.debug('Queue paused — skipping');
      return { dequeued: false, error: 'Bot is paused' };
    }

    if (isQuietHour()) {
      this.logger.debug('Quiet hours — skipping queue processing');
      return { dequeued: false, error: 'Quiet hours (2-7 UTC)' };
    }

    const todayCount = this.roastRepo.getTodayCount('autonomous');
    if (todayCount >= this.dailyLimit) {
      this.logger.info({ todayCount, dailyLimit: this.dailyLimit }, 'Daily limit reached');
      this.activityLogger?.emit({ type: 'stats', data: { count: todayCount, limit: this.dailyLimit } });
      return { dequeued: false, error: `Daily limit reached (${String(todayCount)}/${String(this.dailyLimit)})` };
    }

    return this.dequeueAndProcess();
  }

  /**
   * Manual trigger: respects daily limits but bypasses pause/quiet/posting-mode flags.
   */
  async processNextManual(): Promise<QueueProcessResult> {
    const todayCount = this.roastRepo.getTodayCount('autonomous');
    if (todayCount >= this.dailyLimit) {
      this.logger.info({ todayCount, dailyLimit: this.dailyLimit }, 'Daily limit reached (manual)');
      return { dequeued: false, error: `Daily limit reached (${String(todayCount)}/${String(this.dailyLimit)})` };
    }

    return this.dequeueAndProcess(true);
  }

  /**
   * Enqueue a target for autonomous roasting.
   */
  enqueueAutonomous(targetName: string): number {
    return this.queueRepo.enqueue({
      targetName,
      targetType: 'project',
      source: 'autonomous',
      priority: 5,
    });
  }

  /**
   * Force-process next item, ignoring pause/quiet/limit/posting-mode (for manual testing).
   */
  async processNextForce(): Promise<QueueProcessResult> {
    return this.dequeueAndProcess(true);
  }

  private async dequeueAndProcess(force = false): Promise<QueueProcessResult> {
    const item = this.queueRepo.dequeue();
    if (!item) {
      this.logger.debug('Queue empty');
      return { dequeued: false };
    }

    this.logger.info({ queueId: item.id, target: item.targetName, source: item.source }, 'Processing queue item');

    // M3.4: Idempotency — skip if a roast for this target was already posted recently (crash recovery)
    const existing = this.roastRepo.findRecentByTarget(item.targetName, item.source);
    if (existing?.tweetId) {
      this.logger.warn(
        { queueId: item.id, existingRoastId: existing.id, tweetId: existing.tweetId },
        'Skipping — roast already posted for this target (idempotency)',
      );
      this.queueRepo.complete(item.id);
      return { dequeued: true, posted: true, tweetId: existing.tweetId, target: item.targetName };
    }

    // Casual replies use a separate lightweight pipeline
    if (item.source === 'casual_reply') {
      try {
        return await this.processCasualReply(item);
      } catch (error) {
        const msg = getErrorMessage(error);
        this.logger.error({ err: error, queueId: item.id, target: item.targetName }, 'Casual reply failed');
        this.queueRepo.fail(item.id, msg.slice(0, 500));
        return { dequeued: true, posted: false, target: item.targetName, error: msg.slice(0, 200) };
      }
    }

    // Determine reply context early
    const replyToId = extractReplyToId(item.context);
    const isReply = !!replyToId;

    // Daily limit for mention replies (separate from autonomous limit)
    if (!force && isReply) {
      const mentionToday = this.roastRepo.getTodayCount('mention');
      if (mentionToday >= this.mentionReplyLimit) {
        this.logger.info(
          { mentionToday, limit: this.mentionReplyLimit, queueId: item.id },
          'Mention reply daily limit reached',
        );
        this.queueRepo.fail(item.id, 'Daily mention reply limit reached');
        return { dequeued: true, posted: false, target: item.targetName, error: 'Mention reply limit reached' };
      }
    }

    // Check stockpile before generating — use pre-made roast if available
    if (this.stockpile) {
      try {
        const stockpiled = this.stockpile.findBest(item.targetName);
        if (stockpiled) {
          this.logger.info(
            { queueId: item.id, stockpileId: stockpiled.id, target: item.targetName, score: stockpiled.qualityScore },
            'Using stockpiled roast instead of generating',
          );
          this.activityLogger?.emit({ type: 'cooking', data: { target: item.targetName, fromStockpile: true } });

          const roastId = this.roastRepo.insert({
            targetName: item.targetName,
            targetType: item.targetType,
            tweetText: stockpiled.tweetText,
            replyToId,
            source: item.source,
            status: 'pending_approval',
            factChecked: true,
            contextData: stockpiled.researchNotes ?? undefined,
          });

          const postResult = await this.postOrSkip(stockpiled.tweetText, replyToId);

          if (postResult === 'pending_approval') {
            this.pendingApprovals.set(roastId, { stockpileId: stockpiled.id });
            this.queueRepo.complete(item.id);
            this.logger.info(
              { queueId: item.id, roastId, target: item.targetName, fromStockpile: true },
              'Stockpiled roast pending approval',
            );
            return {
              dequeued: true, pendingApproval: true, roastId, target: item.targetName,
              fromStockpile: true, postedText: stockpiled.tweetText,
            };
          }

          if (postResult === 'no_twitter') {
            this.stockpile.markServed(stockpiled.id, 'bot');
            this.queueRepo.complete(item.id);
            this.logger.info(
              { queueId: item.id, roastId, target: item.targetName, fromStockpile: true },
              'Stockpiled roast ready (no Twitter — saved only)',
            );
            return { dequeued: true, posted: false, savedOnly: true, target: item.targetName, fromStockpile: true };
          }

          if (postResult) {
            this.stockpile.markServed(stockpiled.id, 'bot');
            this.roastRepo.updateStatus(roastId, 'posted', postResult.tweetId);
            this.queueRepo.complete(item.id);
            this.activityLogger?.emit({ type: 'posted', data: { target: item.targetName, tweetId: postResult.tweetId } });
            this.logger.info(
              { queueId: item.id, roastId, tweetId: postResult.tweetId, target: item.targetName, fromStockpile: true },
              'Stockpiled roast posted',
            );
            return { dequeued: true, posted: true, tweetId: postResult.tweetId, target: item.targetName, fromStockpile: true };
          }

          this.roastRepo.updateStatus(roastId, 'failed');
          this.queueRepo.fail(item.id, 'Twitter post returned null (stockpile)');
          return { dequeued: true, posted: false, target: item.targetName, error: 'Twitter post returned null' };
        }
      } catch (error) {
        this.logger.error(
          { err: error, queueId: item.id, target: item.targetName },
          'Stockpile check failed — falling through to generation',
        );
      }
    }

    const mediaUrls = extractMediaUrls(item.context);
    let downloaded: { paths: string[]; cleanup: () => Promise<void> } | undefined;

    try {
      if (mediaUrls.length > 0) {
        downloaded = await downloadTweetMedia(mediaUrls, this.logger);
        this.logger.info(
          { queueId: item.id, requested: mediaUrls.length, downloaded: downloaded.paths.length },
          'Tweet media downloaded for roast',
        );
      }

      const imagePaths = downloaded?.paths.length ? downloaded.paths : undefined;

      // Profile enrichment for Scenario 2 (parent tweet) and Scenario 3 (tagged handle)
      let profileContext: string | undefined;
      if (this.profileFetcher) {
        const handle = extractHandleFromContext(item.context);
        const parentAuthor = extractParentAuthorFromTarget(item.targetName);
        const username = handle ?? parentAuthor;
        if (username && username !== 'anon') {
          profileContext = await this.buildProfileContext(username);
        }
      }

      this.activityLogger?.emit({ type: 'target_locked', data: { target: item.targetName } });
      this.activityLogger?.emit({ type: 'cooking', data: { target: item.targetName, strategies: 3 } });

      // Full farm flow: generate (3 strategies × 2 variants + mutations) → evaluate → stockpile → post best
      const output = await generateRoasts(
        item.targetName, this.provider, this.logger, this.feedbackRepo,
        'farm-generate', 2, undefined, undefined, undefined, imagePaths, profileContext,
        undefined, this.stockpile, 2,
      );

      if (output.variants.length === 0) {
        this.queueRepo.fail(item.id, 'No variants generated');
        return { dequeued: true, posted: false, target: item.targetName, error: 'No variants generated' };
      }

      this.activityLogger?.emit({
        type: 'think',
        narrative: output.diaryThought || undefined,
        data: { target: item.targetName, variantCount: output.variants.length },
      });

      // Evaluate all variants through 5-judge panel and collect passing ones
      const { best, newStockpileCount, bestScore, stockpiledVariants } = await this.evaluateAndStockpile(
        output, item.targetName, item.targetType,
      );

      if (best) {
        this.activityLogger?.emit({
          type: 'roast_ready',
          data: { target: item.targetName, score: bestScore },
        });
      }

      if (!best) {
        // All variants discarded by judges — still try posting the top self-scored variant
        this.logger.warn(
          { queueId: item.id, target: item.targetName, variantCount: output.variants.length },
          'All variants discarded by evaluation — using top self-scored',
        );
        const fallback = output.variants[output.bestIndex] ?? output.variants[0]!;
        return await this.postGeneratedRoast(
          item, fallback.text, output, replyToId, undefined, 0, stockpiledVariants,
        );
      }

      return await this.postGeneratedRoast(
        item, best.text, output, replyToId, bestScore, newStockpileCount, stockpiledVariants,
      );
    } catch (error) {
      const msg = getErrorMessage(error);
      this.logger.error({ err: error, queueId: item.id, target: item.targetName }, 'Queue processing failed');
      this.queueRepo.fail(item.id, msg.slice(0, 500));
      this.activityLogger?.emit({ type: 'error', data: { error: msg.slice(0, 150) } });
      return { dequeued: true, posted: false, target: item.targetName, error: msg.slice(0, 200) };
    } finally {
      if (downloaded) {
        await downloaded.cleanup().catch((err) => {
          this.logger.debug({ err }, 'Failed to cleanup downloaded media');
        });
      }
    }
  }

  private getRoastEngine(): RoastEngine {
    if (!this.cachedRoastEngine) {
      this.cachedRoastEngine = new RoastEngine({
        provider: this.provider,
        logger: this.logger,
        evaluationMode: 'none',
      });
    }
    return this.cachedRoastEngine;
  }

  private getEvaluator(): SelfEvaluator {
    if (!this.cachedEvaluator) {
      this.cachedEvaluator = new SelfEvaluator({
        provider: this.provider,
        logger: this.logger,
        threshold: this.evaluationThreshold,
      });
    }
    return this.cachedEvaluator;
  }

  /**
   * Evaluate all generated variants through 5-judge panel.
   * Variants passing threshold are saved to stockpile.
   * Returns the best passing variant (or undefined if all discarded).
   */
  private async evaluateAndStockpile(
    output: GenerateRoastsResult,
    targetName: string,
    targetType: string,
  ): Promise<{
    best: { text: string; score: number; angle: string } | undefined;
    bestScore: number | undefined;
    newStockpileCount: number;
    stockpiledVariants: Array<{ text: string; score: number; angle: string }>;
  }> {
    const evaluator = this.getEvaluator();
    let newStockpileCount = 0;
    let bestVariant: { text: string; score: number; angle: string } | undefined;
    let bestComposite = 0;
    const stockpiledVariants: Array<{ text: string; score: number; angle: string }> = [];

    // Build FarmAttempt-compatible objects for the evaluator
    const fakeAttempts: Array<{ attempt: FarmAttempt; variant: { text: string; score: number; angle: string } }> = [];
    for (let i = 0; i < output.variants.length; i++) {
      const v = output.variants[i]!;
      fakeAttempts.push({
        attempt: {
          id: -(i + 1), // negative IDs to distinguish from real farm attempts
          targetName,
          targetType,
          tweetText: v.text,
          angle: v.angle,
          strategy: null,
          mutationSeed: null,
          llmSelfScore: v.score,
          evaluatorScore: null,
          evaluatorOutput: null,
          researchNotes: output.researchNotes ?? null,
          factCheckPassed: output.factCheckPassed,
          agentOutput: null,
          promoted: false,
          createdAt: new Date().toISOString(),
        },
        variant: v,
      });
    }

    // Evaluate all variants concurrently (max 3 at a time to avoid overload)
    const concurrency = 3;
    for (let i = 0; i < fakeAttempts.length; i += concurrency) {
      const chunk = fakeAttempts.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        chunk.map(({ attempt }) => evaluator.evaluate(attempt)),
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j]!;
        const { variant } = chunk[j]!;

        if (result.status !== 'fulfilled') {
          this.logger.warn(
            { target: targetName, text: variant.text.slice(0, 80), err: result.reason },
            'Variant evaluation failed',
          );
          continue;
        }

        const evalResult = result.value;
        this.logger.info(
          {
            target: targetName,
            score: evalResult.compositeScore,
            verdict: evalResult.verdict,
            angle: variant.angle,
            text: variant.text.slice(0, 80),
          },
          'Variant evaluated',
        );

        if (evalResult.verdict === 'stockpile' && this.stockpile) {
          // Check for duplicates before adding to stockpile
          if (!this.stockpile.isDuplicate(variant.text, targetName)) {
            const freshness = classifyFreshness(variant.text, output.researchNotes ?? null);
            this.stockpile.insert({
              targetName,
              targetType,
              tweetText: variant.text,
              angle: variant.angle,
              qualityScore: evalResult.compositeScore,
              evaluatorOutput: JSON.stringify(evalResult.evaluations),
              researchNotes: output.researchNotes ?? undefined,
              freshnessType: freshness,
              expiresAt: calculateExpiry(freshness) ?? undefined,
            });
            newStockpileCount++;
            stockpiledVariants.push({ text: variant.text, score: evalResult.compositeScore, angle: variant.angle });
            this.logger.info(
              { target: targetName, score: evalResult.compositeScore, angle: variant.angle },
              'Variant added to stockpile',
            );
          }
        }

        // Track the best passing variant
        if (evalResult.verdict === 'stockpile' && evalResult.compositeScore > bestComposite) {
          bestComposite = evalResult.compositeScore;
          bestVariant = variant;
        }
      }
    }

    this.logger.info(
      {
        target: targetName,
        totalVariants: output.variants.length,
        newStockpile: newStockpileCount,
        bestScore: bestComposite || undefined,
      },
      'Farm-quality evaluation complete',
    );

    return {
      best: bestVariant,
      bestScore: bestComposite || undefined,
      newStockpileCount,
      stockpiledVariants,
    };
  }

  /**
   * Save roast to DB and post to Twitter (or save-only if no Twitter).
   */
  private async postGeneratedRoast(
    item: { id: number; targetName: string; targetType: TargetType; source: RoastSource; context: string | null },
    tweetText: string,
    output: GenerateRoastsResult,
    replyToId: string | undefined,
    evaluationScore: number | undefined,
    newStockpileCount: number,
    stockpiledVariants?: Array<{ text: string; score: number; angle: string }>,
  ): Promise<QueueProcessResult> {
    const roastId = this.roastRepo.insert({
      targetName: item.targetName,
      targetType: item.targetType,
      tweetText,
      replyToId,
      source: item.source,
      status: 'pending_approval',
      factChecked: output.factCheckPassed,
      contextData: output.researchNotes ?? undefined,
      agentOutput: JSON.stringify(output),
    });

    const postResult = await this.postOrSkip(tweetText, replyToId);

    if (postResult === 'pending_approval') {
      this.pendingApprovals.set(roastId, {});
      this.queueRepo.complete(item.id);
      this.logger.info(
        { queueId: item.id, roastId, target: item.targetName, evaluationScore, newStockpileCount },
        'Roast pending approval',
      );
      return {
        dequeued: true, pendingApproval: true, roastId, target: item.targetName,
        evaluationScore, newStockpileCount, postedText: tweetText, stockpiledVariants,
      };
    }

    if (postResult === 'no_twitter') {
      this.queueRepo.complete(item.id);
      this.logger.info(
        { queueId: item.id, roastId, target: item.targetName, evaluationScore, newStockpileCount },
        'Roast generated (no Twitter — saved only)',
      );
      return {
        dequeued: true, posted: false, savedOnly: true, target: item.targetName,
        evaluationScore, newStockpileCount, postedText: tweetText, stockpiledVariants,
      };
    }

    if (postResult) {
      this.roastRepo.updateStatus(roastId, 'posted', postResult.tweetId);
      this.queueRepo.complete(item.id);

      // Mark the posted roast in stockpile as served if it was just added
      if (this.stockpile && newStockpileCount > 0) {
        const available = this.stockpile.getAvailable(item.targetName, 1);
        const match = available.find((s) => s.tweetText === tweetText);
        if (match) {
          this.stockpile.markServed(match.id, 'bot');
        }
      }

      this.activityLogger?.emit({ type: 'posted', data: { target: item.targetName, tweetId: postResult.tweetId } });

      this.logger.info(
        {
          queueId: item.id, roastId, tweetId: postResult.tweetId,
          target: item.targetName, isReply: !!replyToId,
          evaluationScore, newStockpileCount,
        },
        'Roast posted successfully',
      );
      return {
        dequeued: true, posted: true, tweetId: postResult.tweetId, target: item.targetName,
        evaluationScore, newStockpileCount, postedText: tweetText, stockpiledVariants,
      };
    }

    this.roastRepo.updateStatus(roastId, 'failed');
    this.queueRepo.fail(item.id, 'Twitter post returned null');
    return { dequeued: true, posted: false, target: item.targetName, error: 'Twitter post returned null' };
  }

  private async processCasualReply(
    item: { id: number; targetName: string; targetType: string; source: string; context: string | null },
  ): Promise<QueueProcessResult> {
    const replyToId = extractReplyToId(item.context);
    if (!replyToId) {
      this.queueRepo.fail(item.id, 'Casual reply has no reply_to context');
      return { dequeued: true, posted: false, target: item.targetName, error: 'No reply_to context' };
    }

    if (!this.enableMentionReplies) {
      this.logger.info({ queueId: item.id, target: item.targetName }, 'Casual reply skipped — ENABLE_MENTION_REPLIES=false');
      this.queueRepo.fail(item.id, 'Mention replies disabled');
      return { dequeued: true, posted: false, target: item.targetName, error: 'Mention replies disabled' };
    }

    // Daily limit for casual replies (separate from mention roasts)
    const casualToday = this.roastRepo.getTodayCount('casual_reply');
    if (casualToday >= this.casualReplyLimit) {
      this.logger.info(
        { casualToday, limit: this.casualReplyLimit, queueId: item.id },
        'Casual reply daily limit reached',
      );
      this.queueRepo.fail(item.id, 'Daily casual reply limit reached');
      return { dequeued: true, posted: false, target: item.targetName, error: 'Casual reply limit reached' };
    }

    // Extract trigger text and author from context
    const triggerText = extractTriggerText(item.context);
    const authorUsername = item.targetName.replace(/^@/, '');

    // Optional profile enrichment
    let profileContext: string | undefined;
    if (this.profileFetcher) {
      profileContext = await this.buildProfileContext(authorUsername);
    }

    const engine = this.getRoastEngine();
    const result = await engine.generateCasualReply(
      triggerText ?? item.targetName,
      authorUsername,
      profileContext,
    );

    // Save to roasts table for tracking
    const roastId = this.roastRepo.insert({
      targetName: item.targetName,
      targetType: 'person',
      tweetText: result.text,
      replyToId,
      source: 'casual_reply',
      status: 'pending_approval',
      factChecked: true,
      agentOutput: JSON.stringify(result),
    });

    const postResult = await this.postOrSkip(result.text, replyToId);

    if (postResult === 'pending_approval') {
      this.pendingApprovals.set(roastId, {});
      this.queueRepo.complete(item.id);
      this.logger.info(
        { queueId: item.id, roastId, target: item.targetName, tone: result.tone },
        'Casual reply pending approval',
      );
      return { dequeued: true, pendingApproval: true, roastId, target: item.targetName, postedText: result.text };
    }

    if (postResult === 'no_twitter') {
      this.queueRepo.complete(item.id);
      this.logger.info(
        { queueId: item.id, roastId, target: item.targetName, tone: result.tone },
        'Casual reply generated (no Twitter — saved only)',
      );
      return { dequeued: true, posted: false, savedOnly: true, target: item.targetName };
    }

    if (postResult) {
      this.roastRepo.updateStatus(roastId, 'posted', postResult.tweetId);
      this.queueRepo.complete(item.id);
      this.activityLogger?.emit({ type: 'posted', data: { target: item.targetName, tweetId: postResult.tweetId } });
      this.logger.info(
        { queueId: item.id, roastId, tweetId: postResult.tweetId, target: item.targetName, tone: result.tone },
        'Casual reply posted',
      );
      return { dequeued: true, posted: true, tweetId: postResult.tweetId, target: item.targetName };
    }

    this.roastRepo.updateStatus(roastId, 'failed');
    this.queueRepo.fail(item.id, 'Twitter post returned null (casual reply)');
    return { dequeued: true, posted: false, target: item.targetName, error: 'Twitter post returned null' };
  }

  private isApproveMode(): boolean {
    return this.configRepo.getRuntime().approveMode;
  }

  private async postOrSkip(
    text: string,
    replyToId?: string,
  ): Promise<{ tweetId: string } | null | 'no_twitter' | 'pending_approval'> {
    if (this.isApproveMode()) return 'pending_approval';
    if (!this.twitter) return 'no_twitter';
    return replyToId
      ? this.twitter.replyToTweet(text, replyToId)
      : this.twitter.postTweet(text);
  }

  getPendingCount(): number {
    return this.queueRepo.getPendingCount();
  }

  getQueueItems(limit = 10): Array<{ id: number; targetName: string; source: string; status: string; priority: number; createdAt: string }> {
    return this.queueRepo.getTop(limit).map((item) => ({
      id: item.id,
      targetName: item.targetName,
      source: item.source,
      status: item.status,
      priority: item.priority,
      createdAt: item.createdAt,
    }));
  }

  /**
   * Approve a pending roast — post to Twitter and update status.
   * Works even after restart (reads replyToId from DB).
   */
  async approveRoast(roastId: number): Promise<{ tweetId: string; text: string } | null> {
    if (this.approvingIds.has(roastId)) return null;
    this.approvingIds.add(roastId);
    try {
      const roast = this.roastRepo.getById(roastId);
      if (!roast || roast.status !== 'pending_approval') return null;
      if (!this.twitter) return null;

      const replyToId = roast.replyToId ?? undefined;

      const postResult = replyToId
        ? await this.twitter.replyToTweet(roast.tweetText, replyToId)
        : await this.twitter.postTweet(roast.tweetText);

      if (!postResult) return null;

      this.roastRepo.updateStatus(roastId, 'posted', postResult.tweetId);

      // Mark stockpile entry as served (prefer stored ID, fallback to text match)
      const pending = this.pendingApprovals.get(roastId);
      if (this.stockpile) {
        if (pending?.stockpileId) {
          this.stockpile.markServed(pending.stockpileId, 'bot');
        } else {
          const available = this.stockpile.getAvailable(roast.targetName, 20);
          const match = available.find((s) => s.tweetText === roast.tweetText);
          if (match) this.stockpile.markServed(match.id, 'bot');
        }
      }

      this.activityLogger?.emit({ type: 'posted', data: { target: roast.targetName, tweetId: postResult.tweetId } });

      this.pendingApprovals.delete(roastId);
      return { tweetId: postResult.tweetId, text: roast.tweetText };
    } finally {
      this.approvingIds.delete(roastId);
    }
  }

  /**
   * Reject a pending roast. Stockpile entry stays available for future use.
   */
  rejectRoast(roastId: number): boolean {
    const roast = this.roastRepo.getById(roastId);
    if (!roast || roast.status !== 'pending_approval') return false;

    this.roastRepo.updateStatus(roastId, 'rejected');
    this.pendingApprovals.delete(roastId);
    return true;
  }

  private async buildProfileContext(username: string): Promise<string | undefined> {
    try {
      const profile = await this.profileFetcher!.getProfile(username);
      if (!profile) return undefined;

      const lines: string[] = [`@${profile.username}`];
      if (profile.biography) lines.push(`Bio: ${profile.biography}`);
      if (profile.followersCount !== null) lines.push(`Followers: ${profile.followersCount.toLocaleString()}`);
      if (profile.isVerified) lines.push('Verified: Yes');
      if (profile.website) lines.push(`Website: ${profile.website}`);
      if (profile.recentTweets.length > 0) {
        lines.push('\nRecent tweets:');
        for (const tweet of profile.recentTweets) {
          lines.push(`- ${tweet.slice(0, 200)}`);
        }
      }
      return lines.join('\n');
    } catch (error) {
      this.logger.debug({ err: error, username }, 'Profile enrichment failed');
      return undefined;
    }
  }
}

export function extractReplyToId(context: string | null): string | undefined {
  if (!context) return undefined;
  const match = context.match(/^reply_to:(\d+)/);
  return match?.[1];
}

export function extractHandleFromContext(context: string | null): string | undefined {
  if (!context) return undefined;
  const match = context.match(/\|handle:@(\w+)/);
  return match?.[1];
}

export function extractParentAuthorFromTarget(targetName: string): string | undefined {
  const match = targetName.match(/^tweet by @(\w+)/);
  return match?.[1];
}

export function extractTriggerText(context: string | null): string | undefined {
  if (!context) return undefined;
  // text: is always the last segment in context, so grab everything after it
  const match = context.match(/\|text:(.+)$/);
  return match?.[1] || undefined;
}

export function extractMediaUrls(context: string | null): string[] {
  if (!context) return [];
  const match = context.match(/\|media:(.+?)(?:\||$)/);
  if (!match?.[1]) return [];
  return match[1].split(',').filter((url) => url.startsWith('http'));
}

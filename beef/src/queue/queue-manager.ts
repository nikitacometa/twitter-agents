import type { Logger } from 'pino';
import type { TargetType, RoastSource } from '@common/types/index.js';
import type { QueueRepository } from '@storage/repositories/queue.repository.js';
import type { RoastRepository } from '@storage/repositories/roast.repository.js';
import type { ConfigRepository } from '@storage/repositories/config.repository.js';
import type { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import type { ExternalExampleRepository } from '@storage/repositories/external-example.repository.js';
import type { RoastPatternRepository } from '@storage/repositories/roast-pattern.repository.js';
import type { FarmAttemptRepository } from '@storage/repositories/farm-attempt.repository.js';
import type { StockpileRepository } from '@storage/repositories/stockpile.repository.js';
import type { MentionRepository } from '@storage/repositories/mention.repository.js';
import type { TweetRepository } from '@storage/repositories/tweet.repository.js';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { ITwitterClient } from '@twitter/twitter-client.interface.js';
import type { IProfileFetcher } from '@twitter/twitter-client.interface.js';
import { generateRoasts } from '@admin/roast-generator.js';
import type { GenerateRoastsResult } from '@admin/roast-generator.js';
import { buildTweetRoastContext } from '@roast/prompt-builder.js';
import { RoastEngine } from '@roast/roast-engine.js';
import { SelfEvaluator } from '@farm/self-evaluator.js';
import type { FarmAttempt } from '@farm/types.js';
import { classifyFreshness, calculateExpiry } from '@farm/freshness.js';
import { getErrorMessage } from '@common/utils/error.util.js';
import { isQuietHour } from '@scheduler/scheduler.js';
import { downloadTweetMedia } from '@common/utils/media-downloader.js';
import type { TwitterEnricher } from '@farm/twitter-enricher.js';
import type { ActivityLogger } from '../activity/activity-logger.js';

export interface QueueProcessResult {
  dequeued: boolean;
  posted?: boolean;
  savedOnly?: boolean;
  pendingApproval?: boolean;
  postBlocked?: boolean;
  roastId?: number;
  tweetId?: string;
  target?: string;
  error?: string;
  fromStockpile?: boolean;
  evaluationScore?: number;
  newStockpileCount?: number;
  postedText?: string;
  stockpiledVariants?: Array<{ text: string; score: number; angle: string }>;
  roastSource?: RoastSource;
  replyToId?: string;
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
  private readonly exampleRepo?: ExternalExampleRepository;
  private readonly patternRepo?: RoastPatternRepository;
  private readonly farmAttemptRepo?: FarmAttemptRepository;
  private readonly mentionRepo?: MentionRepository;
  private readonly tweetRepo?: TweetRepository;
  private readonly logger: Logger;
  private readonly dailyLimit: number;
  private readonly mentionReplyLimit: number;
  private readonly enableMentionReplies: boolean;
  private readonly casualReplyLimit: number;
  private readonly evaluationThreshold: number;
  private readonly minFollowerThreshold: number;
  private readonly twitterEnricher?: TwitterEnricher;
  private readonly activityLogger?: ActivityLogger;
  private cachedRoastEngine: RoastEngine | null = null;
  private cachedEvaluator: SelfEvaluator | null = null;
  private readonly pendingApprovals = new Map<number, { stockpileId?: number; mentionTweetId?: string }>();
  private readonly approvingIds = new Set<number>();
  private readonly regeneratingIds = new Set<number>();
  private processingInFlight = false;

  constructor(opts: {
    queueRepo: QueueRepository;
    roastRepo: RoastRepository;
    configRepo: ConfigRepository;
    feedbackRepo: FeedbackRepository;
    provider: ProviderManager;
    twitter?: ITwitterClient;
    profileFetcher?: IProfileFetcher;
    stockpile?: StockpileRepository;
    exampleRepo?: ExternalExampleRepository;
    patternRepo?: RoastPatternRepository;
    farmAttemptRepo?: FarmAttemptRepository;
    mentionRepo?: MentionRepository;
    tweetRepo?: TweetRepository;
    twitterEnricher?: TwitterEnricher;
    logger: Logger;
    dailyLimit: number;
    mentionReplyLimit?: number;
    casualReplyLimit?: number;
    enableMentionReplies: boolean;
    evaluationThreshold?: number;
    minFollowerThreshold?: number;
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
    this.exampleRepo = opts.exampleRepo;
    this.patternRepo = opts.patternRepo;
    this.farmAttemptRepo = opts.farmAttemptRepo;
    this.mentionRepo = opts.mentionRepo;
    this.tweetRepo = opts.tweetRepo;
    this.twitterEnricher = opts.twitterEnricher;
    this.logger = opts.logger;
    this.dailyLimit = opts.dailyLimit;
    this.mentionReplyLimit = opts.mentionReplyLimit ?? 20;
    this.casualReplyLimit = opts.casualReplyLimit ?? 40;
    this.evaluationThreshold = opts.evaluationThreshold ?? 3.5;
    this.minFollowerThreshold = opts.minFollowerThreshold ?? 0;
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
      return { dequeued: false, error: 'Quiet hours (5-10 UTC)' };
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

  /**
   * Enqueue a tweet URL for roasting (reply to that tweet).
   * Fetches the tweet, saves to corpus, and enqueues with same context
   * format as mention-triggered parent tweet roasts.
   */
  async enqueueTweetUrl(tweetUrl: string): Promise<{ queueId: number; targetName: string } | null> {
    const tweetId = parseTweetUrl(tweetUrl);
    if (!tweetId) return null;

    if (!this.twitter?.getTweet) {
      this.logger.warn('enqueueTweetUrl: getTweet not available on twitter client');
      return null;
    }

    const tweet = await this.twitter.getTweet(tweetId);
    if (!tweet) {
      this.logger.warn({ tweetId }, 'enqueueTweetUrl: tweet not found');
      return null;
    }

    // Save to tweet repo for corpus building
    if (this.tweetRepo) {
      this.tweetRepo.insert({
        tweetId: tweet.tweetId,
        authorId: tweet.authorId,
        authorName: tweet.authorName,
        text: tweet.text,
        source: 'mention_poll',
        createdAt: new Date().toISOString(),
      });
    }

    const tweetSnippet = tweet.text.slice(0, 120);
    const mediaPart = tweet.mediaUrls?.length
      ? `|media:${tweet.mediaUrls.join(',')}`
      : '';
    const textB64 = Buffer.from(tweet.text).toString('base64');
    const targetName = tweetSnippet
      ? `tweet by @${tweet.authorName}: "${tweetSnippet}"`
      : `tweet by @${tweet.authorName}`;

    const queueId = this.queueRepo.enqueue({
      targetName,
      targetType: 'project',
      source: 'mention',
      priority: 1,
      context: `reply_to:${tweet.tweetId}|tweet_text_b64:${textB64}${mediaPart}`,
    });

    this.logger.info(
      { queueId, tweetId: tweet.tweetId, author: tweet.authorName, targetName },
      'Tweet URL enqueued for roasting',
    );

    return { queueId, targetName };
  }

  private async dequeueAndProcess(force = false): Promise<QueueProcessResult> {
    // Single-flight guard: the scheduler cron and mention-triggered immediate
    // processing can overlap. Both would pass the daily-limit / dedup checks
    // before either records its post (TOCTOU), so overlapping runs serialize here.
    if (this.processingInFlight) {
      this.logger.debug('Queue processing already in flight — skipping');
      return { dequeued: false, error: 'Processing already in progress' };
    }
    this.processingInFlight = true;
    try {
      return await this.dequeueAndProcessInner(force);
    } finally {
      this.processingInFlight = false;
    }
  }

  private async dequeueAndProcessInner(force = false): Promise<QueueProcessResult> {
    const item = this.queueRepo.dequeue();
    if (!item) {
      this.logger.debug('Queue empty');
      return { dequeued: false };
    }

    this.logger.info({ queueId: item.id, target: item.targetName, source: item.source }, 'Processing queue item');

    // M3.4: Idempotency — skip if an autonomous roast for this target was already posted recently.
    // Only applies to autonomous source (scheduler shouldn't double-post same target).
    // Mention/reply flows are deduped by reply_to_id and conversation_id below.
    if (item.source === 'autonomous') {
      const existing = this.roastRepo.findRecentByTarget(item.targetName, item.source);
      if (existing?.tweetId) {
        this.logger.warn(
          { queueId: item.id, existingRoastId: existing.id, tweetId: existing.tweetId },
          'Skipping — roast already posted for this target (idempotency)',
        );
        this.queueRepo.complete(item.id);
        return { dequeued: true, posted: true, tweetId: existing.tweetId, target: item.targetName };
      }
    }

    // Thread-level dedup — never reply twice to the same tweet
    const replyToId = extractReplyToId(item.context);
    if (replyToId && this.roastRepo.existsReplyTo(replyToId)) {
      this.logger.warn(
        { queueId: item.id, replyToId, target: item.targetName },
        'Skipping — already replied to this tweet',
      );
      this.queueRepo.complete(item.id);
      return { dequeued: true, posted: true, target: item.targetName };
    }

    // Conversation-level dedup — max 1 reply per conversation thread
    // Casual replies (direct engagement with bot) are exempt — tweet-level dedup above still prevents duplicates
    const conversationId = extractConversationId(item.context);
    if (conversationId && item.source !== 'casual_reply' && this.roastRepo.hasRepliedInConversation(conversationId)) {
      this.logger.warn(
        { queueId: item.id, conversationId, target: item.targetName },
        'Skipping — already replied in this conversation thread',
      );
      this.queueRepo.complete(item.id);
      return { dequeued: true, posted: true, target: item.targetName };
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

    // Determine reply context early (replyToId already extracted above for dedup)
    const mentionTweetId = extractMentionTweetId(item.context);
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
            conversationId: extractConversationId(item.context),
            source: item.source,
            status: 'pending_approval',
            factChecked: true,
            contextData: stockpiled.researchNotes ?? undefined,
            angle: stockpiled.angle ?? undefined,
          });

          const postResult = await this.postOrSkip(stockpiled.tweetText, replyToId, item.source);

          if (postResult === 'pending_approval' || postResult === 'reply_blocked') {
            const blocked = postResult === 'reply_blocked';
            this.pendingApprovals.set(roastId, { stockpileId: stockpiled.id, mentionTweetId });
            this.queueRepo.complete(item.id);
            this.logger.info(
              { queueId: item.id, roastId, target: item.targetName, fromStockpile: true, blocked },
              blocked ? 'Stockpiled roast reply blocked (403) — pending manual review' : 'Stockpiled roast pending approval',
            );
            return {
              dequeued: true, pendingApproval: true, postBlocked: blocked || undefined, roastId, target: item.targetName,
              fromStockpile: true, postedText: stockpiled.tweetText,
              roastSource: item.source, replyToId,
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
            return { dequeued: true, posted: true, tweetId: postResult.tweetId, target: item.targetName, fromStockpile: true, postedText: stockpiled.tweetText };
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

      // Profile enrichment for all scenarios — prefer TwitterEnricher (richer data) over basic profileFetcher
      let profileContext: string | undefined;
      let targetFollowers: number | null = null;
      const handle = extractHandleFromContext(item.context);
      const parentAuthor = extractParentAuthorFromTarget(item.targetName);
      const targetHandle = extractHandleFromTarget(item.targetName);
      const username = handle ?? parentAuthor ?? targetHandle;
      if (username && username !== 'anon') {
        if (this.twitterEnricher?.isConfigured) {
          const enriched = await this.twitterEnricher.enrich(username);
          profileContext = enriched?.profileContext;
          targetFollowers = enriched?.followersCount ?? null;
        }
        if (!profileContext && this.profileFetcher) {
          profileContext = await this.buildProfileContext(username);
          if (targetFollowers === null) {
            targetFollowers = await this.getTargetFollowers(username);
          }
        }
      }

      // Skip targets below follower threshold (mentions/reply_guy only — autonomous targets are pre-vetted)
      if (this.minFollowerThreshold > 0 && item.source !== 'autonomous' && targetFollowers !== null && targetFollowers < this.minFollowerThreshold) {
        this.logger.info(
          { queueId: item.id, target: item.targetName, followers: targetFollowers, threshold: this.minFollowerThreshold },
          'Skipping — target below follower threshold',
        );
        this.queueRepo.complete(item.id);
        return { dequeued: true, posted: false, target: item.targetName, error: `Below follower threshold (${targetFollowers} < ${this.minFollowerThreshold})` };
      }

      // Mention context enrichment — look up original mention and parent tweet from DB
      const mentionContext = this.buildMentionContext(item.context);
      if (mentionContext) {
        profileContext = profileContext
          ? `${profileContext}\n\n--- Mention context ---\n${mentionContext}`
          : mentionContext;
      }

      // Tweet-mode: if queue context contains encoded tweet text, build tweet-specific context
      let isTweetMode = false;
      const tweetText = extractTweetTextFromContext(item.context);
      if (tweetText) {
        profileContext = buildTweetRoastContext({
          tweetText,
          tweetAuthor: username ?? 'unknown',
          enrichmentContext: profileContext,
          imagePaths,
        });
        isTweetMode = true;
      }

      this.activityLogger?.emit({ type: 'target_locked', data: { target: item.targetName } });
      this.activityLogger?.emit({ type: 'cooking', data: { target: item.targetName, strategies: 3 } });

      // Full farm flow: generate (3 strategies × 2 variants + mutations) → evaluate → stockpile → post best
      const isRoastMe = extractRoastMeFlag(item.context);
      const output = await generateRoasts(
        item.targetName, this.provider, this.logger, this.feedbackRepo,
        'farm-generate', 2, this.configRepo, this.exampleRepo, this.patternRepo,
        imagePaths, profileContext, undefined, this.stockpile, 2, this.farmAttemptRepo,
        undefined, isRoastMe || undefined, item.targetType as 'person' | 'project' | 'token' | 'trend',
        isTweetMode || undefined,
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

      // Evaluate variants — full judge panel in primary mode, self-score in degraded
      let best: { text: string; score: number; angle: string } | undefined;
      let bestScore: number | undefined;
      let newStockpileCount = 0;
      let stockpiledVariants: Array<{ text: string; score: number; angle: string }> = [];

      if (this.provider.mode === 'primary') {
        const evalResult = await this.evaluateAndStockpile(output, item.targetName, item.targetType);
        best = evalResult.best;
        bestScore = evalResult.bestScore;
        newStockpileCount = evalResult.newStockpileCount;
        stockpiledVariants = evalResult.stockpiledVariants;
      } else {
        this.logger.info(
          { target: item.targetName, mode: this.provider.mode },
          'Degraded mode — using self-score ranking',
        );
        const sorted = [...output.variants].sort((a, b) => b.score - a.score);
        best = sorted[0];
        bestScore = best?.score;
      }

      if (best) {
        this.activityLogger?.emit({
          type: 'roast_ready',
          data: { target: item.targetName, score: bestScore },
        });
      }

      if (!best) {
        // Every variant was vetoed by the judge panel — fail closed. Posting a
        // self-scored variant here would silently bypass the quality gate on
        // exactly the batches the judges liked least.
        this.logger.warn(
          { queueId: item.id, target: item.targetName, variantCount: output.variants.length },
          'All variants discarded by evaluation — rejecting queue item',
        );
        this.queueRepo.fail(item.id, 'All variants rejected by judge panel');
        this.activityLogger?.emit({
          type: 'error',
          data: { error: `All variants for ${item.targetName} rejected by judge panel` },
        });
        return {
          dequeued: true,
          posted: false,
          target: item.targetName,
          error: 'All variants rejected by judge panel',
          stockpiledVariants,
        };
      }

      return await this.postGeneratedRoast(
        item, best.text, output, replyToId, bestScore, newStockpileCount, stockpiledVariants, best.angle,
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
    angle?: string,
  ): Promise<QueueProcessResult> {
    const roastId = this.roastRepo.insert({
      targetName: item.targetName,
      targetType: item.targetType,
      tweetText,
      replyToId,
      conversationId: extractConversationId(item.context),
      source: item.source,
      status: 'pending_approval',
      factChecked: output.factCheckPassed,
      contextData: output.researchNotes ?? undefined,
      agentOutput: JSON.stringify(output),
      angle,
    });

    const postResult = await this.postOrSkip(tweetText, replyToId, item.source);

    if (postResult === 'pending_approval' || postResult === 'reply_blocked') {
      const blocked = postResult === 'reply_blocked';
      this.pendingApprovals.set(roastId, { mentionTweetId: extractMentionTweetId(item.context) });
      this.queueRepo.complete(item.id);
      this.logger.info(
        { queueId: item.id, roastId, target: item.targetName, evaluationScore, newStockpileCount, blocked },
        blocked ? 'Reply blocked (403) — pending manual review' : 'Roast pending approval',
      );
      return {
        dequeued: true, pendingApproval: true, postBlocked: blocked || undefined, roastId, target: item.targetName,
        evaluationScore, newStockpileCount, postedText: tweetText, stockpiledVariants,
        roastSource: item.source, replyToId,
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
        roastSource: item.source, replyToId,
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

    // Profile enrichment — prefer TwitterEnricher for richer data + follower count
    let profileContext: string | undefined;
    let authorFollowers: number | null = null;
    if (this.twitterEnricher?.isConfigured) {
      const enriched = await this.twitterEnricher.enrich(authorUsername);
      profileContext = enriched?.profileContext;
      authorFollowers = enriched?.followersCount ?? null;
    }
    if (!profileContext && this.profileFetcher) {
      profileContext = await this.buildProfileContext(authorUsername);
      if (authorFollowers === null) {
        authorFollowers = await this.getTargetFollowers(authorUsername);
      }
    }

    // Skip authors below follower threshold
    if (this.minFollowerThreshold > 0 && authorFollowers !== null && authorFollowers < this.minFollowerThreshold) {
      this.logger.info(
        { queueId: item.id, target: item.targetName, followers: authorFollowers, threshold: this.minFollowerThreshold },
        'Casual reply skipped — author below follower threshold',
      );
      this.queueRepo.complete(item.id);
      return { dequeued: true, posted: false, target: item.targetName, error: `Below follower threshold (${authorFollowers})` };
    }

    // Mention context enrichment — get full mention text from DB
    const mentionContext = this.buildMentionContext(item.context);
    if (mentionContext) {
      profileContext = profileContext
        ? `${profileContext}\n\n--- Mention context ---\n${mentionContext}`
        : mentionContext;
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
      conversationId: extractConversationId(item.context),
      source: 'casual_reply',
      status: 'pending_approval',
      factChecked: true,
      agentOutput: JSON.stringify(result),
    });

    const postResult = await this.postOrSkip(result.text, replyToId, 'casual_reply');

    if (postResult === 'pending_approval' || postResult === 'reply_blocked') {
      const blocked = postResult === 'reply_blocked';
      this.pendingApprovals.set(roastId, { mentionTweetId: extractMentionTweetId(item.context) });
      this.queueRepo.complete(item.id);
      this.logger.info(
        { queueId: item.id, roastId, target: item.targetName, tone: result.tone, blocked },
        blocked ? 'Casual reply blocked (403) — pending manual review' : 'Casual reply pending approval',
      );
      return { dequeued: true, pendingApproval: true, postBlocked: blocked || undefined, roastId, target: item.targetName, postedText: result.text, roastSource: 'casual_reply', replyToId };
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
      // Mark the originating mention as processed
      const mentionTweetId = extractMentionTweetId(item.context);
      if (mentionTweetId && this.mentionRepo) {
        this.mentionRepo.markProcessed(mentionTweetId, postResult.tweetId);
      }
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

  private requiresApproval(source: RoastSource): boolean {
    const runtime = this.configRepo.getRuntime();
    const replySources: RoastSource[] = ['mention', 'reply_guy', 'casual_reply'];
    if (replySources.includes(source)) return runtime.approveMentions;
    return runtime.approveMode;
  }

  private async postOrSkip(
    text: string,
    replyToId: string | undefined,
    source: RoastSource,
  ): Promise<{ tweetId: string } | null | 'no_twitter' | 'pending_approval' | 'reply_blocked'> {
    if (this.requiresApproval(source)) return 'pending_approval';
    if (!this.twitter) return 'no_twitter';

    try {
      return replyToId
        ? await this.twitter.replyToTweet(text, replyToId)
        : await this.twitter.postTweet(text);
    } catch (error) {
      const msg = getErrorMessage(error);
      // 403 on reply = permanent (thread restricted by author). Escalate to manual review.
      if (msg.includes('403') && replyToId) {
        this.logger.warn({ replyToId, error: msg.slice(0, 200) }, 'Reply blocked (403) — escalating to manual review');
        return 'reply_blocked';
      }
      throw error;
    }
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

      // Guard: mention/reply sources MUST have replyToId — posting standalone is always a bug
      const replySources: RoastSource[] = ['mention', 'reply_guy', 'casual_reply'];
      if (replySources.includes(roast.source) && !replyToId) {
        this.logger.error(
          { roastId, source: roast.source, target: roast.targetName },
          'Cannot approve mention roast without reply_to_id — would post standalone (data corruption)',
        );
        return null;
      }

      let postResult;
      if (replyToId) {
        try {
          postResult = await this.twitter.replyToTweet(roast.tweetText, replyToId);
        } catch (error) {
          const errMsg = getErrorMessage(error);
          // 403 = reply restricted. Auto-fallback: try replying to the mention tweet instead.
          const pending = this.pendingApprovals.get(roastId);
          if (errMsg.includes('403') && pending?.mentionTweetId && pending.mentionTweetId !== replyToId) {
            this.logger.warn(
              { roastId, parentTweetId: replyToId, mentionTweetId: pending.mentionTweetId },
              'Reply to parent tweet blocked (403) — falling back to mention tweet',
            );
            postResult = await this.twitter.replyToTweet(roast.tweetText, pending.mentionTweetId);
          } else {
            throw error;
          }
        }
      } else {
        postResult = await this.twitter.postTweet(roast.tweetText);
      }

      if (!postResult) return null;

      this.roastRepo.updateStatus(roastId, 'posted', postResult.tweetId);

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

      // Mark the originating mention as processed
      if (pending?.mentionTweetId && this.mentionRepo) {
        this.mentionRepo.markProcessed(pending.mentionTweetId, postResult.tweetId);
      }

      this.pendingApprovals.delete(roastId);
      return { tweetId: postResult.tweetId, text: roast.tweetText };
    } finally {
      this.approvingIds.delete(roastId);
    }
  }

  /**
   * Approve a pending roast — post as standalone tweet (no reply), ignoring replyToId.
   * Used as fallback when reply is blocked (403).
   */
  async approveRoastStandalone(roastId: number): Promise<{ tweetId: string; text: string } | null> {
    if (this.approvingIds.has(roastId)) return null;
    this.approvingIds.add(roastId);
    try {
      const roast = this.roastRepo.getById(roastId);
      if (!roast || roast.status !== 'pending_approval') return null;
      if (!this.twitter) return null;

      const postResult = await this.twitter.postTweet(roast.tweetText);
      if (!postResult) return null;

      this.roastRepo.updateStatus(roastId, 'posted', postResult.tweetId);

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
      this.logger.info({ roastId, tweetId: postResult.tweetId }, 'Roast posted standalone (403 fallback)');
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

  /**
   * Regenerate a roast that is pending approval.
   * Rejects the old roast, re-runs the full generation + evaluation pipeline,
   * and returns a new pending_approval result.
   *
   * Guards against concurrent regeneration and concurrent approve via separate Sets.
   */
  async regenerateRoast(oldRoastId: number): Promise<QueueProcessResult | null> {
    if (this.regeneratingIds.has(oldRoastId)) return null;
    if (this.approvingIds.has(oldRoastId)) return null;

    this.regeneratingIds.add(oldRoastId);
    try {
      const oldRoast = this.roastRepo.getById(oldRoastId);
      if (!oldRoast || oldRoast.status !== 'pending_approval') return null;

      // Save mentionTweetId before reject clears pendingApprovals
      const oldMentionTweetId = this.pendingApprovals.get(oldRoastId)?.mentionTweetId;

      // Reject old roast immediately (before long-running generation)
      this.rejectRoast(oldRoastId);

      // Profile enrichment
      let profileContext: string | undefined;
      if (this.profileFetcher) {
        const parentAuthor = extractParentAuthorFromTarget(oldRoast.targetName);
        const targetHandle = extractHandleFromTarget(oldRoast.targetName);
        const username = parentAuthor ?? targetHandle;
        if (username && username !== 'anon') {
          profileContext = await this.buildProfileContext(username);
        }
      }

      // Mention context — reconstruct from replyToId if available
      if (oldRoast.replyToId) {
        const contextLines: string[] = [];

        // Look up the original mention (who requested the roast)
        if (this.mentionRepo) {
          const mention = this.mentionRepo.getByTweetId(oldRoast.replyToId);
          if (mention) {
            contextLines.push(`Requested by: @${mention.authorName}`);
            contextLines.push(`Request type: ${mention.requestType ?? 'unknown'}`);
            contextLines.push(`Mention text: "${mention.text}"`);
          }
        }

        // Look up the parent tweet text (independent of mention lookup)
        // replyToId now points to the mention tweet, so look for the roast target's tweet instead
        if (this.tweetRepo) {
          const parentAuthor = extractParentAuthorFromTarget(oldRoast.targetName);
          const targetHandle = extractHandleFromTarget(oldRoast.targetName);
          const targetUsername = parentAuthor ?? targetHandle;
          if (targetUsername) {
            const targetTweets = this.tweetRepo.getByAuthorName(targetUsername, 1);
            const parentTweet = targetTweets[0];
            if (parentTweet) {
              contextLines.push(`\nParent tweet by @${parentTweet.authorName}:`);
              contextLines.push(`"${parentTweet.text}"`);
            }
          }
        }

        if (contextLines.length > 0) {
          const mentionContext = contextLines.join('\n');
          profileContext = profileContext
            ? `${profileContext}\n\n--- Mention context ---\n${mentionContext}`
            : mentionContext;
        }
      }

      this.activityLogger?.emit({ type: 'cooking', data: { target: oldRoast.targetName, regenerate: true } });

      const output = await generateRoasts(
        oldRoast.targetName, this.provider, this.logger, this.feedbackRepo,
        'farm-generate', 2, this.configRepo, this.exampleRepo, this.patternRepo,
        undefined, profileContext, undefined, this.stockpile, 2, this.farmAttemptRepo,
      );

      if (output.variants.length === 0) {
        return { dequeued: true, posted: false, target: oldRoast.targetName, error: 'No variants generated on regeneration' };
      }

      let best: { text: string; score: number; angle: string } | undefined;
      let bestScore: number | undefined;
      let newStockpileCount = 0;
      let stockpiledVariants: Array<{ text: string; score: number; angle: string }> = [];

      if (this.provider.mode === 'primary') {
        const evalResult = await this.evaluateAndStockpile(output, oldRoast.targetName, oldRoast.targetType);
        best = evalResult.best;
        bestScore = evalResult.bestScore;
        newStockpileCount = evalResult.newStockpileCount;
        stockpiledVariants = evalResult.stockpiledVariants;
      } else {
        const sorted = [...output.variants].sort((a, b) => b.score - a.score);
        best = sorted[0];
        bestScore = best?.score;
      }

      const tweetText = best
        ? best.text
        : (output.variants[output.bestIndex] ?? output.variants[0]!).text;
      const evalScore = best ? bestScore : undefined;

      const selectedAngle = best?.angle ?? (output.variants[output.bestIndex] ?? output.variants[0])?.angle;
      const newRoastId = this.roastRepo.insert({
        targetName: oldRoast.targetName,
        targetType: oldRoast.targetType,
        tweetText,
        replyToId: oldRoast.replyToId ?? undefined,
        conversationId: oldRoast.conversationId ?? undefined,
        source: oldRoast.source,
        status: 'pending_approval',
        factChecked: output.factCheckPassed,
        contextData: output.researchNotes ?? undefined,
        agentOutput: JSON.stringify(output),
        angle: selectedAngle,
      });

      this.pendingApprovals.set(newRoastId, { mentionTweetId: oldMentionTweetId });

      this.logger.info(
        { oldRoastId, newRoastId, target: oldRoast.targetName, evalScore, newStockpileCount },
        'Roast regenerated — new version pending approval',
      );

      return {
        dequeued: true, pendingApproval: true, roastId: newRoastId,
        target: oldRoast.targetName, evaluationScore: evalScore,
        newStockpileCount, postedText: tweetText, stockpiledVariants,
        roastSource: oldRoast.source, replyToId: oldRoast.replyToId ?? undefined,
      };
    } catch (error) {
      this.logger.error({ err: error, oldRoastId }, 'Roast regeneration failed');
      throw error;
    } finally {
      this.regeneratingIds.delete(oldRoastId);
    }
  }

  /**
   * Build enriched context from DB for mention-triggered queue items.
   * Looks up the original mention text and parent tweet from stored data.
   */
  private buildMentionContext(context: string | null): string | undefined {
    const mentionTweetId = extractMentionTweetId(context);
    const replyToId = extractReplyToId(context);
    const lines: string[] = [];

    // Look up the original mention (who requested and what they said)
    if (mentionTweetId && this.mentionRepo) {
      const mention = this.mentionRepo.getByTweetId(mentionTweetId);
      if (mention) {
        lines.push(`Requested by: @${mention.authorName}`);
        lines.push(`Request type: ${mention.requestType ?? 'unknown'}`);
        lines.push(`Mention text: "${mention.text}"`);
      }
    }

    // Look up the full parent tweet text (may be longer than the 120-char snippet in targetName)
    // Prefer explicit parent: field (new format), fall back to replyToId (legacy)
    const parentId = extractParentTweetId(context) ?? replyToId;
    if (parentId && this.tweetRepo) {
      const parentTweet = this.tweetRepo.getByTweetId(parentId);
      if (parentTweet) {
        lines.push(`\nParent tweet by @${parentTweet.authorName}:`);
        lines.push(`"${parentTweet.text}"`);
      }
    }

    return lines.length > 0 ? lines.join('\n') : undefined;
  }

  private async getTargetFollowers(username: string): Promise<number | null> {
    try {
      const profile = await this.profileFetcher?.getProfile(username);
      return profile?.followersCount ?? null;
    } catch {
      return null;
    }
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

/** Extract a Twitter handle from targetName (e.g. "@elonmusk" → "elonmusk", "$SOL" → "SOL"). */
export function extractHandleFromTarget(targetName: string): string | undefined {
  // @handle format (from S1 explicit "roast @X" or S3 enqueueHandleRoast)
  const atMatch = targetName.match(/^@(\w+)$/);
  if (atMatch?.[1]) return atMatch[1];
  // Plain word that looks like a handle (alphanumeric, 3+ chars, no spaces)
  if (/^\w{3,15}$/.test(targetName) && !/^tweet by/.test(targetName)) return targetName;
  return undefined;
}

export function extractMentionTweetId(context: string | null): string | undefined {
  if (!context) return undefined;
  const match = context.match(/\|mention:(\d+)/);
  return match?.[1];
}

export function extractConversationId(context: string | null): string | undefined {
  if (!context) return undefined;
  const match = context.match(/\|conversation:([^|]+)/);
  return match?.[1];
}

export function extractRoastMeFlag(context: string | null): boolean {
  if (!context) return false;
  return /\|roast_me:1/.test(context);
}

export function extractParentTweetId(context: string | null): string | undefined {
  if (!context) return undefined;
  const match = context.match(/\|parent:(\d+)/);
  return match?.[1];
}

export function extractTweetTextFromContext(context: string | null): string | undefined {
  if (!context) return undefined;
  const match = context.match(/\|tweet_text_b64:([A-Za-z0-9+/=]+)/);
  if (!match?.[1]) return undefined;
  try {
    return Buffer.from(match[1], 'base64').toString('utf-8');
  } catch {
    return undefined;
  }
}

export function extractMediaUrls(context: string | null): string[] {
  if (!context) return [];
  const match = context.match(/\|media:(.+?)(?:\||$)/);
  if (!match?.[1]) return [];
  return match[1].split(',').filter((url) => url.startsWith('http'));
}

/**
 * Parse a tweet URL and extract the tweet ID.
 * Supports: https://x.com/user/status/123, https://twitter.com/user/status/123
 */
export function parseTweetUrl(input: string): string | null {
  const match = input.match(/(?:x\.com|twitter\.com)\/\w+\/status\/(\d+)/);
  return match?.[1] ?? null;
}

/** Quick check if a string looks like a tweet URL. */
export function isTweetUrl(input: string): boolean {
  return /^(?:https?:\/\/)?(?:x\.com|twitter\.com)\/\w+\/status\/\d+/.test(input);
}

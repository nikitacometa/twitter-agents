import type { Logger } from 'pino';
import type { QueueRepository } from '@storage/repositories/queue.repository.js';
import type { RoastRepository } from '@storage/repositories/roast.repository.js';
import type { ConfigRepository } from '@storage/repositories/config.repository.js';
import type { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import type { StockpileRepository } from '@storage/repositories/stockpile.repository.js';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { ITwitterClient } from '@twitter/twitter-client.interface.js';
import type { IProfileFetcher } from '@twitter/twitter-client.interface.js';
import { generateRoasts } from '@admin/roast-generator.js';
import { RoastEngine } from '@roast/roast-engine.js';
import { getErrorMessage } from '@common/utils/error.util.js';
import { isQuietHour } from '@scheduler/scheduler.js';
import { downloadTweetMedia } from '@common/utils/media-downloader.js';

export interface QueueProcessResult {
  dequeued: boolean;
  posted?: boolean;
  savedOnly?: boolean;
  tweetId?: string;
  target?: string;
  error?: string;
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
  private readonly enableAutonomousPosting: boolean;
  private readonly enableMentionReplies: boolean;
  private readonly casualReplyLimit: number;
  private cachedRoastEngine: RoastEngine | null = null;

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
    enableAutonomousPosting: boolean;
    enableMentionReplies: boolean;
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
    this.enableAutonomousPosting = opts.enableAutonomousPosting;
    this.enableMentionReplies = opts.enableMentionReplies;
  }

  /**
   * Process one item from the queue (respects pause/quiet/limits).
   */
  async processNext(): Promise<QueueProcessResult> {
    const runtime = this.configRepo.getRuntime();
    if (runtime.paused) {
      this.logger.debug('Queue paused — skipping');
      return { dequeued: false };
    }

    if (isQuietHour()) {
      this.logger.debug('Quiet hours — skipping queue processing');
      return { dequeued: false };
    }

    const todayCount = this.roastRepo.getTodayCount('autonomous');
    if (todayCount >= this.dailyLimit) {
      this.logger.info({ todayCount, dailyLimit: this.dailyLimit }, 'Daily limit reached');
      return { dequeued: false };
    }

    return this.dequeueAndProcess();
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

    // Determine reply context early — used by posting mode checks, stockpile, and generation
    const replyToId = extractReplyToId(item.context);
    const isReply = !!replyToId;

    // Check posting mode before serving stockpile or generating (force bypasses for Telegram /trigger)
    if (!force) {
      if (isReply && !this.enableMentionReplies) {
        this.logger.info({ queueId: item.id, target: item.targetName }, 'Mention reply skipped — ENABLE_MENTION_REPLIES=false');
        this.queueRepo.fail(item.id, 'Mention replies disabled');
        return { dequeued: true, posted: false, target: item.targetName, error: 'Mention replies disabled' };
      }
      if (!isReply && !this.enableAutonomousPosting) {
        this.logger.info({ queueId: item.id, target: item.targetName }, 'Autonomous post skipped — ENABLE_AUTONOMOUS_POSTING=false');
        this.queueRepo.fail(item.id, 'Autonomous posting disabled');
        return { dequeued: true, posted: false, target: item.targetName, error: 'Autonomous posting disabled' };
      }

      // M3.3: Daily limit for mention replies (separate from autonomous limit)
      if (isReply) {
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

          const roastId = this.roastRepo.insert({
            targetName: item.targetName,
            targetType: item.targetType,
            tweetText: stockpiled.tweetText,
            source: item.source,
            status: 'pending_approval',
            factChecked: true,
            contextData: stockpiled.researchNotes ?? undefined,
          });

          const postResult = await this.postOrSkip(stockpiled.tweetText, replyToId);

          if (postResult === 'no_twitter') {
            this.stockpile.markServed(stockpiled.id, 'bot');
            this.roastRepo.updateStatus(roastId, 'pending_approval');
            this.queueRepo.complete(item.id);
            this.logger.info(
              { queueId: item.id, roastId, target: item.targetName, fromStockpile: true },
              'Stockpiled roast ready (no Twitter — saved only)',
            );
            return { dequeued: true, posted: false, savedOnly: true, target: item.targetName };
          }

          if (postResult) {
            this.stockpile.markServed(stockpiled.id, 'bot');
            this.roastRepo.updateStatus(roastId, 'posted', postResult.tweetId);
            this.queueRepo.complete(item.id);
            this.logger.info(
              { queueId: item.id, roastId, tweetId: postResult.tweetId, target: item.targetName, fromStockpile: true },
              'Stockpiled roast posted',
            );
            return { dequeued: true, posted: true, tweetId: postResult.tweetId, target: item.targetName };
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

      const output = await generateRoasts(
        item.targetName, this.provider, this.logger, this.feedbackRepo,
        undefined, undefined, undefined, undefined, undefined, imagePaths, profileContext,
      );

      if (output.variants.length === 0) {
        this.queueRepo.fail(item.id, 'No variants generated');
        return { dequeued: true, posted: false, target: item.targetName, error: 'No variants generated' };
      }

      const best = output.variants[output.bestIndex] ?? output.variants[0]!;

      const roastId = this.roastRepo.insert({
        targetName: item.targetName,
        targetType: item.targetType,
        tweetText: best.text,
        source: item.source,
        status: 'pending_approval',
        factChecked: output.factCheckPassed,
        contextData: output.researchNotes ?? undefined,
        agentOutput: JSON.stringify(output),
      });

      // Reply if triggered by a mention, standalone tweet otherwise
      const postResult = await this.postOrSkip(best.text, replyToId);

      if (postResult === 'no_twitter') {
        this.roastRepo.updateStatus(roastId, 'pending_approval');
        this.queueRepo.complete(item.id);
        this.logger.info(
          { queueId: item.id, roastId, target: item.targetName },
          'Roast generated (no Twitter — saved only)',
        );
        return { dequeued: true, posted: false, savedOnly: true, target: item.targetName };
      }

      if (postResult) {
        this.roastRepo.updateStatus(roastId, 'posted', postResult.tweetId);
        this.queueRepo.complete(item.id);
        this.logger.info(
          { queueId: item.id, roastId, tweetId: postResult.tweetId, target: item.targetName, isReply: !!replyToId },
          'Roast posted successfully',
        );
        return { dequeued: true, posted: true, tweetId: postResult.tweetId, target: item.targetName };
      } else {
        this.roastRepo.updateStatus(roastId, 'failed');
        this.queueRepo.fail(item.id, 'Twitter post returned null');
        return { dequeued: true, posted: false, target: item.targetName, error: 'Twitter post returned null' };
      }
    } catch (error) {
      const msg = getErrorMessage(error);
      this.logger.error({ err: error, queueId: item.id, target: item.targetName }, 'Queue processing failed');
      this.queueRepo.fail(item.id, msg.slice(0, 500));
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
      source: 'casual_reply',
      status: 'pending_approval',
      factChecked: true,
      agentOutput: JSON.stringify(result),
    });

    const postResult = await this.postOrSkip(result.text, replyToId);

    if (postResult === 'no_twitter') {
      this.roastRepo.updateStatus(roastId, 'pending_approval');
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

  private async postOrSkip(
    text: string,
    replyToId?: string,
  ): Promise<{ tweetId: string } | null | 'no_twitter'> {
    if (!this.twitter) return 'no_twitter';
    return replyToId
      ? this.twitter.replyToTweet(text, replyToId)
      : this.twitter.postTweet(text);
  }

  getPendingCount(): number {
    return this.queueRepo.getPendingCount();
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

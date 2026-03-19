import type { Logger } from 'pino';
import type { QueueRepository } from '@storage/repositories/queue.repository.js';
import type { RoastRepository } from '@storage/repositories/roast.repository.js';
import type { ConfigRepository } from '@storage/repositories/config.repository.js';
import type { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { ITwitterClient } from '@twitter/twitter-client.interface.js';
import { generateRoasts } from '@admin/roast-generator.js';
import { getErrorMessage } from '@common/utils/error.util.js';
import { isQuietHour } from '@scheduler/scheduler.js';
import { downloadTweetMedia } from '@common/utils/media-downloader.js';

export interface QueueProcessResult {
  dequeued: boolean;
  posted?: boolean;
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
  private readonly twitter: ITwitterClient;
  private readonly logger: Logger;
  private readonly dailyLimit: number;
  private readonly mentionReplyLimit: number;
  private readonly enableAutonomousPosting: boolean;
  private readonly enableMentionReplies: boolean;

  constructor(opts: {
    queueRepo: QueueRepository;
    roastRepo: RoastRepository;
    configRepo: ConfigRepository;
    feedbackRepo: FeedbackRepository;
    provider: ProviderManager;
    twitter: ITwitterClient;
    logger: Logger;
    dailyLimit: number;
    mentionReplyLimit?: number;
    enableAutonomousPosting: boolean;
    enableMentionReplies: boolean;
  }) {
    this.queueRepo = opts.queueRepo;
    this.roastRepo = opts.roastRepo;
    this.configRepo = opts.configRepo;
    this.feedbackRepo = opts.feedbackRepo;
    this.provider = opts.provider;
    this.twitter = opts.twitter;
    this.logger = opts.logger;
    this.dailyLimit = opts.dailyLimit;
    this.mentionReplyLimit = opts.mentionReplyLimit ?? 20;
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

    // Check posting mode before generating roast (force bypasses for Telegram /trigger)
    const replyToId = extractReplyToId(item.context);
    const isReply = !!replyToId;

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
      const output = await generateRoasts(
        item.targetName, this.provider, this.logger, this.feedbackRepo,
        undefined, undefined, undefined, undefined, undefined, imagePaths,
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
      const postResult = replyToId
        ? await this.twitter.replyToTweet(best.text, replyToId)
        : await this.twitter.postTweet(best.text);

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

  getPendingCount(): number {
    return this.queueRepo.getPendingCount();
  }
}

function extractReplyToId(context: string | null): string | undefined {
  if (!context) return undefined;
  const match = context.match(/^reply_to:(\d+)/);
  return match?.[1];
}

function extractMediaUrls(context: string | null): string[] {
  if (!context) return [];
  const match = context.match(/\|media:(.+?)(?:\||$)/);
  if (!match?.[1]) return [];
  return match[1].split(',').filter((url) => url.startsWith('http'));
}

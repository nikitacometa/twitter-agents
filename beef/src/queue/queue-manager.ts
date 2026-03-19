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

export class QueueManager {
  private readonly queueRepo: QueueRepository;
  private readonly roastRepo: RoastRepository;
  private readonly configRepo: ConfigRepository;
  private readonly feedbackRepo: FeedbackRepository;
  private readonly provider: ProviderManager;
  private readonly twitter: ITwitterClient;
  private readonly logger: Logger;
  private readonly dailyLimit: number;

  constructor(opts: {
    queueRepo: QueueRepository;
    roastRepo: RoastRepository;
    configRepo: ConfigRepository;
    feedbackRepo: FeedbackRepository;
    provider: ProviderManager;
    twitter: ITwitterClient;
    logger: Logger;
    dailyLimit: number;
  }) {
    this.queueRepo = opts.queueRepo;
    this.roastRepo = opts.roastRepo;
    this.configRepo = opts.configRepo;
    this.feedbackRepo = opts.feedbackRepo;
    this.provider = opts.provider;
    this.twitter = opts.twitter;
    this.logger = opts.logger;
    this.dailyLimit = opts.dailyLimit;
  }

  /**
   * Process one item from the queue. Returns true if an item was processed.
   */
  async processNext(): Promise<boolean> {
    const runtime = this.configRepo.getRuntime();
    if (runtime.paused) {
      this.logger.debug('Queue paused — skipping');
      return false;
    }

    if (isQuietHour()) {
      this.logger.debug('Quiet hours — skipping queue processing');
      return false;
    }

    const todayCount = this.roastRepo.getTodayCount('autonomous');
    if (todayCount >= this.dailyLimit) {
      this.logger.info({ todayCount, dailyLimit: this.dailyLimit }, 'Daily limit reached');
      return false;
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
   * Force-process next item, ignoring pause/quiet/limit (for manual testing).
   */
  async processNextForce(): Promise<boolean> {
    return this.dequeueAndProcess();
  }

  private async dequeueAndProcess(): Promise<boolean> {
    const item = this.queueRepo.dequeue();
    if (!item) {
      this.logger.debug('Queue empty');
      return false;
    }

    this.logger.info({ queueId: item.id, target: item.targetName, source: item.source }, 'Processing queue item');

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
        return true;
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
      const replyToId = extractReplyToId(item.context);
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
      } else {
        this.roastRepo.updateStatus(roastId, 'failed');
        this.queueRepo.fail(item.id, 'Twitter post failed');
      }

      return true;
    } catch (error) {
      const msg = getErrorMessage(error);
      this.logger.error({ err: error, queueId: item.id, target: item.targetName }, 'Queue processing failed');
      this.queueRepo.fail(item.id, msg.slice(0, 500));
      return true;
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

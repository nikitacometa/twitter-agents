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
import { generateRoastsLightning } from '../admin/roast-generator.js';
import { buildTweetRoastContext } from '../roast/prompt-builder.js';
import type { TweetRoastContextInput } from '../roast/prompt-builder.js';
import { formatDryRunMessage, formatLivePostMessage, sendReplyGuyNotification } from './reply-guy-notify.js';

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
      return { candidates: 0, evaluated: 0, winners: 0, generated: 0, notified: 0, errors: 0 };
    }

    this.isRunning = true;
    const cycleStart = Date.now();
    const result: CycleResult = { candidates: 0, evaluated: 0, winners: 0, generated: 0, notified: 0, errors: 0 };

    try {
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

      // 3. Process each winner
      for (const winner of winners) {
        if (Date.now() - cycleStart > CYCLE_TIMEOUT_MS) {
          this.config.logger.warn('Reply guy: cycle timeout — aborting remaining winners');
          break;
        }

        try {
          await this.processWinner(winner, result);
        } catch (error) {
          result.errors++;
          this.config.logger.error(
            { err: error, tweetId: winner.tweet.tweetId, author: winner.tweet.authorHandle },
            'Reply guy: failed to process winner',
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

      this.config.logger.info(result, 'Reply guy: cycle complete');
      return result;
    } finally {
      this.isRunning = false;
    }
  }

  private async processWinner(winner: EvaluatedCandidate, result: CycleResult): Promise<void> {
    const { logger, twitterClient, candidateRepo, dryRun } = this.config;
    const t = winner.tweet;

    // Fetch full tweet data (metrics, parent tweet)
    let tweetData: TweetData | null = null;
    if (twitterClient.getTweet) {
      try {
        tweetData = await twitterClient.getTweet(t.tweetId);
      } catch (error) {
        logger.warn({ err: error, tweetId: t.tweetId }, 'Reply guy: failed to fetch tweet data');
      }
    }

    // Build tweet roast context
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

    // Fetch parent tweet if this is a reply
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

    // Fetch quoted tweet if present
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

    const profileContext = buildTweetRoastContext(contextInput);

    // Generate lightning roast (tweet-mode)
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
      undefined, // imagePaths
      profileContext,
      true, // tweetMode
    );

    if (lightningResult.variants.length === 0) {
      logger.warn({ tweetId: t.tweetId }, 'Reply guy: lightning produced 0 variants');
      candidateRepo.markSkipped(t.tweetId, winner.roastability, 'No variants passed filters');
      return;
    }

    // Pick best variant
    const best = lightningResult.variants[0]!;
    candidateRepo.markGenerated(t.tweetId, best.text, best.score);
    result.generated++;

    const dailyCount = candidateRepo.getTodayCount();

    if (dryRun) {
      // Dry run — send to Telegram only
      const html = formatDryRunMessage(
        winner,
        tweetData,
        best.text,
        dailyCount,
        this.config.selectorConfig.dailyCap,
      );

      await sendReplyGuyNotification(this.config.telegramToken, this.config.adminChatId, html);
      candidateRepo.markPosted(t.tweetId, null);
      result.notified++;
    } else {
      // Live mode — post via Playwright
      const postResult = await twitterClient.replyToTweet(best.text, t.tweetId);

      if (postResult) {
        candidateRepo.markPosted(t.tweetId, postResult.tweetId);
        result.notified++;

        const html = formatLivePostMessage(
          winner,
          best.text,
          postResult.tweetId,
          dailyCount,
          this.config.selectorConfig.dailyCap,
        );
        try {
          await sendReplyGuyNotification(this.config.telegramToken, this.config.adminChatId, html);
        } catch (error) {
          logger.warn({ err: error }, 'Reply guy: failed to send live post notification');
        }
      } else {
        logger.error({ tweetId: t.tweetId }, 'Reply guy: replyToTweet returned null');
        result.errors++;
      }
    }
  }
}

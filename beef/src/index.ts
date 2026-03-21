import dotenv from 'dotenv';
import { resolve } from 'node:path';

// Load order: CLI env vars > .env.{BEEF_ENV} > .env (dotenv never overrides existing)
const beefEnv = process.env.BEEF_ENV || 'test';
dotenv.config({ path: resolve(process.cwd(), `.env.${beefEnv}`) });
dotenv.config();

import { validateEnv } from './common/config/env.validation.js';
import { logger } from './common/utils/logger.js';
import { createDatabase } from './storage/database.js';
import { LlmLogRepository } from './storage/repositories/llm-log.repository.js';
import { FeedbackRepository } from './storage/repositories/feedback.repository.js';
import { QueueRepository } from './storage/repositories/queue.repository.js';
import { RoastRepository } from './storage/repositories/roast.repository.js';
import { ConfigRepository } from './storage/repositories/config.repository.js';
import { MentionRepository } from './storage/repositories/mention.repository.js';
import { UserRepository } from './storage/repositories/user.repository.js';
import { ExternalExampleRepository } from './storage/repositories/external-example.repository.js';
import { RoastPatternRepository } from './storage/repositories/roast-pattern.repository.js';
import { StockpileRepository } from './storage/repositories/stockpile.repository.js';
import { TweetRepository } from './storage/repositories/tweet.repository.js';
import { TargetRepository } from './storage/repositories/target.repository.js';
import { ClaudeCodeProvider } from './agent/claude-code.provider.js';
import {
  createAnthropicSDKProvider,
} from './agent/anthropic-sdk.provider.js';
import { ProviderManager } from './agent/provider-manager.js';
import { createBot } from './admin/bot.js';
import type { ITwitterClient, IProfileFetcher } from './twitter/twitter-client.interface.js';
import { TwitterClient } from './twitter/twitter-client.js';
import { ScraperTwitterClient } from './twitter/scraper-twitter-client.js';
import { MentionHandler } from './twitter/mention-handler.js';
import { Scheduler } from './scheduler/scheduler.js';
import { QueueManager } from './queue/queue-manager.js';
import { EngagementTracker } from './learning/engagement-tracker.js';
import { HealthMonitor } from './health/health-monitor.js';
import { CachedProfileFetcher } from './twitter/cached-profile-fetcher.js';

const config = validateEnv();

const botUsername = config.TWITTER_BOT_USERNAME || config.TWITTER_USERNAME || '0xBeefer';

logger.info(
  {
    botName: config.BOT_NAME,
    beefEnv: config.BEEF_ENV,
    nodeEnv: config.NODE_ENV,
    twitterMode: config.TWITTER_CLIENT_MODE,
    twitterEnabled: config.ENABLE_TWITTER,
    dryRun: config.DRY_RUN,
    botUsername,
  },
  `Starting $BEEF roast bot [${config.BEEF_ENV.toUpperCase()}]`,
);

// --- Database ---
const db = createDatabase(config.DB_PATH, logger);
const llmLogRepo = new LlmLogRepository(db);
const feedbackRepo = new FeedbackRepository(db);
const queueRepo = new QueueRepository(db);
const roastRepo = new RoastRepository(db);
const configRepo = new ConfigRepository(db);
const mentionRepo = new MentionRepository(db);
const userRepo = new UserRepository(db);
const exampleRepo = new ExternalExampleRepository(db);
const patternRepo = new RoastPatternRepository(db);
const stockpileRepo = new StockpileRepository(db);
const tweetRepo = new TweetRepository(db);
const targetRepo = new TargetRepository(db);

// --- Recover stuck queue items from previous crash ---
const resetCount = queueRepo.resetProcessing();
if (resetCount > 0) {
  logger.warn({ resetCount }, 'Reset stuck processing queue items back to pending');
}

// --- LLM Providers (optional — bot works without them for manual eval) ---
let provider: ProviderManager | null = null;
try {
  const primary = new ClaudeCodeProvider(logger, llmLogRepo);
  const fallback = createAnthropicSDKProvider(config.ANTHROPIC_API_KEY, logger, llmLogRepo);
  const alerter = {
    send: async (msg: string) => {
      logger.warn({ alert: msg }, 'Provider alert');
      if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
        try {
          const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`;
          await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: config.TELEGRAM_CHAT_ID,
              text: `🚨 <b>Provider Alert</b>\n\n${msg.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] ?? c)}`,
              parse_mode: 'HTML',
            }),
          });
        } catch (err) {
          logger.error({ err }, 'Failed to send alert to Telegram');
        }
      }
    },
  };
  provider = new ProviderManager(primary, fallback, alerter, logger);
  logger.info('LLM providers initialized');
} catch (error) {
  logger.warn({ err: error }, 'LLM providers not available — manual eval only');
}

// --- Twitter Client (only when ENABLE_TWITTER=true) ---
let twitter: ITwitterClient | undefined;
let profileFetcher: IProfileFetcher | undefined;
let mentionHandler: MentionHandler | undefined;
let engagementTracker: EngagementTracker | undefined;

if (config.ENABLE_TWITTER) {
  if (config.TWITTER_CLIENT_MODE === 'scraper' && config.TWITTER_USERNAME && config.TWITTER_PASSWORD) {
    const scraperClient = new ScraperTwitterClient({
      credentials: {
        username: config.TWITTER_USERNAME,
        password: config.TWITTER_PASSWORD,
        phone: config.TWITTER_PHONE,
        twoFactorSecret: config.TWITTER_2FA_SECRET,
      },
      dryRun: config.DRY_RUN,
      logger,
    });

    try {
      await scraperClient.initialize();
      twitter = scraperClient;
      profileFetcher = new CachedProfileFetcher({
        inner: scraperClient,
        targetRepo,
        userRepo,
        logger,
      });
      logger.info('Twitter client: scraper mode (cookie auth)');
    } catch (error) {
      logger.error({ err: error }, 'Scraper login failed — falling back to API mode');
      twitter = new TwitterClient({ dryRun: config.DRY_RUN, logger });
    }
  } else {
    const twitterCredentials =
      config.TWITTER_API_KEY && config.TWITTER_API_SECRET && config.TWITTER_ACCESS_TOKEN && config.TWITTER_ACCESS_SECRET
        ? {
            apiKey: config.TWITTER_API_KEY,
            apiSecret: config.TWITTER_API_SECRET,
            accessToken: config.TWITTER_ACCESS_TOKEN,
            accessSecret: config.TWITTER_ACCESS_SECRET,
          }
        : undefined;

    const apiClient = new TwitterClient({
      credentials: twitterCredentials,
      dryRun: config.DRY_RUN,
      logger,
    });
    twitter = apiClient;
    profileFetcher = new CachedProfileFetcher({
      inner: apiClient,
      targetRepo,
      userRepo,
      logger,
    });
    logger.info('Twitter client: API mode');
  }

  mentionHandler = new MentionHandler({
    twitter,
    mentionRepo,
    userRepo,
    configRepo,
    queueRepo,
    tweetRepo,
    logger,
    botUsername,
  });

  engagementTracker = new EngagementTracker({
    twitter,
    roastRepo,
    db,
    logger,
  });
} else {
  logger.info('Twitter disabled (ENABLE_TWITTER=false) — telegram-only mode');
}

// --- Queue Manager ---
let queueManager: QueueManager | null = null;
if (provider) {
  queueManager = new QueueManager({
    queueRepo,
    roastRepo,
    configRepo,
    feedbackRepo,
    provider,
    twitter,
    profileFetcher,
    stockpile: stockpileRepo,
    logger,
    dailyLimit: config.ROASTS_PER_DAY,
    mentionReplyLimit: config.MENTION_REPLIES_PER_DAY,
    enableAutonomousPosting: config.ENABLE_AUTONOMOUS_POSTING,
    enableMentionReplies: config.ENABLE_MENTION_REPLIES,
  });
  logger.info({ dailyLimit: config.ROASTS_PER_DAY }, 'Queue manager initialized');
}

// --- Health Monitor ---
const healthMonitor = new HealthMonitor({
  port: 3000,
  logger,
  db,
  beefEnv: config.BEEF_ENV,
  checks: {
    isTwitterConfigured: () => twitter?.isConfigured ?? false,
    isProviderAvailable: () => provider !== null,
    getQueuePending: () => queueRepo.getPendingCount(),
    getRoastsToday: () => roastRepo.getTodayCount('autonomous'),
    getApiUsage: twitter && 'usage' in twitter ? () => (twitter as TwitterClient).usage : undefined,
  },
});

// --- Scheduler ---
const scheduler = new Scheduler(logger);

if (queueManager) {
  const qm = queueManager;
  scheduler.register({
    name: 'queue-processor',
    cronTime: '*/20 * * * *',
    jitterMs: 5 * 60 * 1000,
    handler: async () => {
      await qm.processNext();
    },
  });
}

if (mentionHandler) {
  const mh = mentionHandler;
  scheduler.register({
    name: 'mention-poller',
    cronTime: '*/10 * * * *',
    jitterMs: 2 * 60 * 1000,
    handler: async () => {
      await mh.poll();
    },
  });
}

if (engagementTracker) {
  const et = engagementTracker;
  scheduler.register({
    name: 'engagement-tracker',
    cronTime: '0 * * * *',
    jitterMs: 5 * 60 * 1000,
    handler: async () => {
      await et.trackRecent();
    },
  });
}

// --- Telegram Bot ---
let bot: ReturnType<typeof createBot> | null = null;
if (config.TELEGRAM_BOT_TOKEN) {
  bot = createBot({
    token: config.TELEGRAM_BOT_TOKEN,
    adminIds: config.TELEGRAM_ADMIN_IDS,
    openAccess: config.TELEGRAM_OPEN_ACCESS,
    feedbackRepo,
    provider,
    logger,
    queueManager: queueManager ?? undefined,
    configRepo,
    exampleRepo,
    patternRepo,
    stockpileRepo,
    postingMode: {
      autonomous: config.ENABLE_AUTONOMOUS_POSTING,
      mentionReplies: config.ENABLE_MENTION_REPLIES,
    },
    pollMentions: mentionHandler ? () => mentionHandler.poll() : undefined,
    twitterEnabled: config.ENABLE_TWITTER,
    beefEnv: config.BEEF_ENV,
  });

  void bot.start({
    drop_pending_updates: true,
    onStart: () =>
      logger.info(
        { admins: config.TELEGRAM_ADMIN_IDS, openAccess: config.TELEGRAM_OPEN_ACCESS },
        'Telegram bot polling started',
      ),
  });
} else {
  logger.warn('TELEGRAM_BOT_TOKEN not set — Telegram bot disabled');
}

// Start services
healthMonitor.start();
scheduler.start();

// --- Graceful shutdown ---
const shutdown = async () => {
  logger.info('Shutting down...');
  scheduler.stop();
  healthMonitor.stop();
  if (bot) await bot.stop();
  if (provider) {
    await provider.waitForIdle(185_000);
    provider.shutdown();
  }
  if (twitter?.shutdown) await twitter.shutdown();
  db.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  void shutdown();
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled rejection');
  void shutdown();
});

import 'dotenv/config';
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
import { ClaudeCodeProvider } from './agent/claude-code.provider.js';
import {
  createAnthropicSDKProvider,
} from './agent/anthropic-sdk.provider.js';
import { ProviderManager } from './agent/provider-manager.js';
import { createBot } from './admin/bot.js';
import type { ITwitterClient } from './twitter/twitter-client.interface.js';
import { TwitterClient } from './twitter/twitter-client.js';
import { ScraperTwitterClient } from './twitter/scraper-twitter-client.js';
import { MentionHandler } from './twitter/mention-handler.js';
import { Scheduler } from './scheduler/scheduler.js';
import { QueueManager } from './queue/queue-manager.js';
import { EngagementTracker } from './learning/engagement-tracker.js';
import { HealthMonitor } from './health/health-monitor.js';

const config = validateEnv();

logger.info({ botName: config.BOT_NAME, env: config.NODE_ENV }, 'Starting $BEEF roast bot');

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
  const alerter = { send: (msg: string) => Promise.resolve(logger.warn({ alert: msg }, 'Provider alert')) };
  provider = new ProviderManager(primary, fallback, alerter, logger);
  logger.info('LLM providers initialized');
} catch (error) {
  logger.warn({ err: error }, 'LLM providers not available — manual eval only');
}

// --- Twitter Client ---
let twitter: ITwitterClient;

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

  twitter = new TwitterClient({
    credentials: twitterCredentials,
    dryRun: config.DRY_RUN,
    logger,
  });
  logger.info('Twitter client: API mode');
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
    logger,
    dailyLimit: config.ROASTS_PER_DAY,
    enableAutonomousPosting: config.ENABLE_AUTONOMOUS_POSTING,
    enableMentionReplies: config.ENABLE_MENTION_REPLIES,
  });
  logger.info({ dailyLimit: config.ROASTS_PER_DAY }, 'Queue manager initialized');
}

// --- Mention Handler ---
const mentionHandler = new MentionHandler({
  twitter,
  mentionRepo,
  userRepo,
  configRepo,
  queueRepo,
  logger,
});

// --- Engagement Tracker ---
const engagementTracker = new EngagementTracker({
  twitter,
  roastRepo,
  db,
  logger,
});

// --- Health Monitor ---
const healthMonitor = new HealthMonitor({
  port: 3000,
  logger,
  db,
  checks: {
    isTwitterConfigured: () => twitter.isConfigured,
    isProviderAvailable: () => provider !== null,
    getQueuePending: () => queueRepo.getPendingCount(),
    getRoastsToday: () => roastRepo.getTodayCount('autonomous'),
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

// Poll mentions every 10 minutes
scheduler.register({
  name: 'mention-poller',
  cronTime: '*/10 * * * *',
  jitterMs: 2 * 60 * 1000,
  handler: async () => {
    await mentionHandler.poll();
  },
});

// Track engagement every hour
scheduler.register({
  name: 'engagement-tracker',
  cronTime: '0 * * * *',
  jitterMs: 5 * 60 * 1000,
  handler: async () => {
    await engagementTracker.trackRecent();
  },
});

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
  });

  void bot.start({
    onStart: () => {
      logger.info(
        { admins: config.TELEGRAM_ADMIN_IDS, openAccess: config.TELEGRAM_OPEN_ACCESS },
        'Telegram bot started',
      );
    },
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
  if (twitter.shutdown) await twitter.shutdown();
  db.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

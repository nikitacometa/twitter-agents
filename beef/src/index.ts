import 'dotenv/config';
import { validateEnv } from './common/config/env.validation.js';
import { logger } from './common/utils/logger.js';
import { createDatabase } from './storage/database.js';
import { LlmLogRepository } from './storage/repositories/llm-log.repository.js';
import { FeedbackRepository } from './storage/repositories/feedback.repository.js';
import { ClaudeCodeProvider } from './agent/claude-code.provider.js';
import {
  createAnthropicSDKProvider,
} from './agent/anthropic-sdk.provider.js';
import { ProviderManager } from './agent/provider-manager.js';
import { createBot } from './admin/bot.js';

const config = validateEnv();

logger.info({ botName: config.BOT_NAME, env: config.NODE_ENV }, 'Starting $BEEF roast bot');

// --- Database ---
const db = createDatabase(config.DB_PATH, logger);
const llmLogRepo = new LlmLogRepository(db);
const feedbackRepo = new FeedbackRepository(db);

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

// --- Telegram Bot ---
if (config.TELEGRAM_BOT_TOKEN) {
  const bot = createBot({
    token: config.TELEGRAM_BOT_TOKEN,
    adminIds: config.TELEGRAM_ADMIN_IDS,
    openAccess: config.TELEGRAM_OPEN_ACCESS,
    feedbackRepo,
    provider,
    logger,
  });

  void bot.start({
    onStart: () => {
      logger.info(
        { admins: config.TELEGRAM_ADMIN_IDS, openAccess: config.TELEGRAM_OPEN_ACCESS },
        'Telegram bot started',
      );
    },
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await bot.stop();
    provider?.shutdown();
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
} else {
  logger.warn('TELEGRAM_BOT_TOKEN not set — Telegram bot disabled');
  logger.info('Set TELEGRAM_BOT_TOKEN in .env to enable Telegram bot');
}

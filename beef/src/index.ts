import 'dotenv/config';
import { validateEnv } from './common/config/env.validation.js';
import { logger } from './common/utils/logger.js';

const config = validateEnv();

logger.info({ botName: config.BOT_NAME, env: config.NODE_ENV }, 'Starting $BEEF roast bot');

// TODO: Initialize Twitter client
// TODO: Initialize roast engine (Claude Sonnet)
// TODO: Initialize news monitor
// TODO: Start scheduler

logger.info('Bot initialized. Waiting for events...');

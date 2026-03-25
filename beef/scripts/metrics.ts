#!/usr/bin/env npx tsx
/**
 * Metrics Pipeline CLI — sync bot tweets, refresh engagement metrics, generate reports.
 *
 * Usage:
 *   pnpm metrics              # sync + basic report
 *   pnpm metrics --analyze    # + LLM strategic analysis (future)
 *   pnpm metrics --force      # full re-sync (ignore incremental state)
 *   pnpm metrics --quiet      # no terminal output, only DB + Telegram alerts
 */

import { config } from 'dotenv';
config({ override: true });
config({ path: '.env.production' });

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TwitterApi } from 'twitter-api-v2';
import { createDatabase } from '@storage/database.js';
import { logger } from '@common/utils/logger.js';
import { MetricsRepository } from '@metrics/metrics.repository.js';
import { TimelineSyncer } from '@metrics/timeline-syncer.js';
import { MetricsRefresher } from '@metrics/metrics-refresher.js';
import { ReportGenerator } from '@metrics/report-generator.js';
import { getErrorMessage } from '@common/utils/error.util.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, '../data/beef.db');

// --- Parse args ---

const args = process.argv.slice(2);
const force = args.includes('--force');
const quiet = args.includes('--quiet');
const analyze = args.includes('--analyze');

async function main(): Promise<void> {
  // Validate Twitter API credentials
  const apiKey = process.env['TWITTER_API_KEY'];
  const apiSecret = process.env['TWITTER_API_SECRET'];
  const accessToken = process.env['TWITTER_ACCESS_TOKEN'];
  const accessSecret = process.env['TWITTER_ACCESS_SECRET'];

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    logger.error('Twitter API credentials required. Set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET');
    process.exit(1);
  }

  // Init Twitter API client (direct, not through ITwitterClient)
  const api = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken,
    accessSecret,
  });

  // Init database (runs migrations automatically)
  const db = createDatabase(DB_PATH, logger);
  const repo = new MetricsRepository(db);

  // Check API budget before proceeding
  const monthlyReads = repo.getMonthlyApiReads();
  if (monthlyReads > 9000) {
    logger.error(
      { monthlyReads },
      'API budget nearly exhausted (>9000/10000 reads). Aborting. Use --force to override.',
    );
    if (!force) {
      process.exit(1);
    }
  } else if (monthlyReads > 7000) {
    logger.warn({ monthlyReads }, 'API budget above 70% — consider reducing sync frequency');
  }

  const syncer = new TimelineSyncer({ api, repo, logger });
  const refresher = new MetricsRefresher({ api, repo, logger });
  const reporter = new ReportGenerator({ repo, logger });

  try {
    // Step 1: Resolve bot user ID
    const userId = await syncer.resolveBotUserId();

    // Step 2: Account snapshot
    await syncer.snapshotAccount();

    // Step 3: Timeline sync
    const syncResult = await syncer.sync({ userId, force });

    // Step 4: Metrics refresh
    const refreshResult = await refresher.refresh();

    // Step 5: Generate report
    const reportData = reporter.gatherData(syncResult, refreshResult);

    // Terminal output
    if (!quiet) {
      const report = reporter.formatTerminalReport(reportData);
      console.log(report);
    }

    // Telegram alerts (only on events)
    const telegramAlert = reporter.formatTelegramAlert(reportData);
    if (telegramAlert) {
      await sendTelegramAlert(telegramAlert);
    }

    // Step 6: LLM analysis (future)
    if (analyze) {
      logger.info('LLM analysis not yet implemented — use report data for manual review');
    }

    logger.info('Metrics pipeline complete');
  } catch (error) {
    logger.error({ err: error }, 'Metrics pipeline failed');
    await sendTelegramAlert(`Metrics pipeline failed: ${getErrorMessage(error)}`);
    process.exit(1);
  } finally {
    db.close();
  }
}

async function sendTelegramAlert(text: string): Promise<void> {
  const token = process.env['TELEGRAM_BOT_TOKEN'];
  const chatId = process.env['TELEGRAM_CHAT_ID'];
  if (!token || !chatId) return;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to send Telegram alert');
  }
}

main().catch((error) => {
  console.error('Fatal error:', getErrorMessage(error));
  process.exit(1);
});

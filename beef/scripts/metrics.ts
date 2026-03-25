#!/usr/bin/env npx tsx
/**
 * Metrics Pipeline CLI — sync bot tweets, refresh engagement metrics, generate reports.
 *
 * Usage:
 *   pnpm metrics              # sync + basic report
 *   pnpm metrics --analyze    # + LLM strategic analysis (requires ANTHROPIC_API_KEY)
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
import { analyzeMetrics } from '@metrics/metrics-analyzer.js';
import type { MetricsAnalysisInput } from '@metrics/metrics-analyzer.js';
import { sendFarmNotification } from '@farm/notify.js';
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

    // Step 6: LLM analysis
    if (analyze) {
      const anthropicKey = process.env['ANTHROPIC_API_KEY'];
      if (!anthropicKey) {
        logger.info('ANTHROPIC_API_KEY not set — skipping LLM analysis');
      } else {
        // Check if analysis was already run recently (< 24h)
        const latest = repo.getLatestAnalysis('weekly');
        const staleHours = latest
          ? (Date.now() - new Date(latest.created_at).getTime()) / (1000 * 60 * 60)
          : Infinity;

        if (staleHours < 24 && !force) {
          logger.info({ hoursAgo: Math.round(staleHours) }, 'LLM analysis already run recently — skipping (use --force to override)');
        } else {
          const analysisInput: MetricsAnalysisInput = {
            periodDays: 7,
            topTweets: reportData.topTweets.map((t) => ({
              text: t.text, angle: null, impressions: t.impressions,
              er: t.engagement_rate, likes: t.likes,
            })),
            worstTweets: reportData.worstTweets.map((t) => ({
              text: t.text, angle: null, impressions: t.impressions, er: t.engagement_rate,
            })),
            byAngle: reportData.byAngle,
            byHour: reportData.byHour,
            byType: reportData.byType,
            stats: {
              total: reportData.stats.total,
              totalImpressions: reportData.stats.totalImpressions,
              avgEngagementRate: reportData.stats.avgEngagementRate,
            },
            weekTrend: reportData.weekTrend,
            suppressed: reportData.suppressed.length,
            deleted: reportData.deleted.length,
          };

          const analysisResult = await analyzeMetrics(analysisInput, anthropicKey, logger);
          if (analysisResult) {
            reportData.analysisResult = analysisResult;
            const periodEnd = new Date().toISOString().slice(0, 10);
            const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            repo.insertAnalysis({
              analysisType: 'weekly',
              periodStart,
              periodEnd,
              summary: analysisResult.summary,
              recommendations: JSON.stringify(analysisResult.recommendations),
              rawData: JSON.stringify(analysisResult),
            });
            logger.info('LLM analysis stored');
          }
        }
      }
    }

    // Terminal output
    if (!quiet) {
      const report = reporter.formatTerminalReport(reportData);
      console.log(report);
    }

    // Telegram alerts (only on events)
    const telegramToken = process.env['TELEGRAM_BOT_TOKEN'];
    const telegramChatId = process.env['TELEGRAM_CHAT_ID'];
    const telegramAlert = reporter.formatTelegramAlert(reportData);
    if (telegramAlert && telegramToken && telegramChatId) {
      try {
        await sendFarmNotification(telegramToken, telegramChatId, telegramAlert);
      } catch (error) {
        logger.warn({ err: error }, 'Failed to send Telegram alert');
      }
    }

    // Step 7: Snapshot retention
    const thinned = repo.thinOldSnapshots();
    if (thinned.deleted7d > 0 || thinned.deleted30d > 0) {
      logger.info(thinned, 'Thinned old snapshots');
    }

    logger.info('Metrics pipeline complete');
  } catch (error) {
    logger.error({ err: error }, 'Metrics pipeline failed');
    const errToken = process.env['TELEGRAM_BOT_TOKEN'];
    const errChatId = process.env['TELEGRAM_CHAT_ID'];
    if (errToken && errChatId) {
      try {
        await sendFarmNotification(errToken, errChatId, `Metrics pipeline failed: ${getErrorMessage(error)}`);
      } catch { /* best-effort */ }
    }
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error('Fatal error:', getErrorMessage(error));
  process.exit(1);
});

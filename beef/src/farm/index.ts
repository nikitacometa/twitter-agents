#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Roast Farm Pipeline — CLI entry point.
 *
 * Usage:
 *   pnpm farm stats
 *   pnpm farm pipeline --count 10
 *   pnpm farm discover --limit 20
 *   pnpm farm generate --targets "Uniswap,Aave"
 *   pnpm farm evaluate --threshold 4.0
 *   pnpm farm export --top 50
 *   pnpm farm prune --attempts-ttl 30
 */

import { Command } from 'commander';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '@storage/database.js';
import { FarmTargetRepository } from '@storage/repositories/farm-target.repository.js';
import { FarmAttemptRepository } from '@storage/repositories/farm-attempt.repository.js';
import { StockpileRepository } from '@storage/repositories/stockpile.repository.js';
import { LlmLogRepository } from '@storage/repositories/llm-log.repository.js';
import { ClaudeCodeProvider } from '@agent/claude-code.provider.js';
import { ProviderManager } from '@agent/provider-manager.js';
import { SelfEvaluator } from './self-evaluator.js';
import { createFarmLogger } from './logger.js';
import type { FarmStats } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = resolve(__dirname, '../../data/beef.db');

function createRepos(dbPath: string) {
  const logger = createFarmLogger();
  const db = createDatabase(dbPath, logger);
  return {
    db,
    logger,
    farmTarget: new FarmTargetRepository(db),
    farmAttempt: new FarmAttemptRepository(db),
    stockpile: new StockpileRepository(db),
  };
}

function createProviderFrom(db: ReturnType<typeof createDatabase>, logger: ReturnType<typeof createFarmLogger>) {
  const llmLog = new LlmLogRepository(db);
  const primary = new ClaudeCodeProvider(logger, llmLog);
  const alerter = { send: (msg: string) => Promise.resolve(logger.warn({ alert: msg }, 'Farm alert')) };
  return new ProviderManager(primary, null, alerter, logger);
}

function buildStats(
  farmTarget: FarmTargetRepository,
  farmAttempt: FarmAttemptRepository,
  stockpile: StockpileRepository,
): FarmStats {
  const targetCounts = farmTarget.getCountByStatus();
  const attemptStats = farmAttempt.getStats();
  const stockpileStats = stockpile.getStats();
  const topTargets = stockpile.getTopTargets(10);

  return {
    targets: {
      total: Object.values(targetCounts).reduce((a, b) => a + b, 0),
      pending: targetCounts.pending,
      completed: targetCounts.completed,
    },
    attempts: {
      total: attemptStats.total,
      evaluated: attemptStats.evaluated,
      promoted: attemptStats.promoted,
      avgScore: attemptStats.avgScore,
    },
    stockpile: {
      total: stockpileStats.total,
      available: stockpileStats.byStatus['available'] ?? 0,
      served: (stockpileStats.byStatus['served_bot'] ?? 0) + (stockpileStats.byStatus['served_landing'] ?? 0),
      expired: stockpileStats.byStatus['expired'] ?? 0,
      avgScore: stockpileStats.avgScore,
    },
    topTargets,
  };
}

function printStats(stats: FarmStats): void {
  console.log('\n--- Roast Farm Stats ---\n');

  console.log('Targets:');
  console.log(`  Total: ${String(stats.targets.total)}`);
  console.log(`  Pending: ${String(stats.targets.pending)}`);
  console.log(`  Completed: ${String(stats.targets.completed)}`);

  console.log('\nAttempts:');
  console.log(`  Total: ${String(stats.attempts.total)}`);
  console.log(`  Evaluated: ${String(stats.attempts.evaluated)}`);
  console.log(`  Promoted: ${String(stats.attempts.promoted)}`);
  console.log(`  Avg score: ${stats.attempts.avgScore !== null ? stats.attempts.avgScore.toFixed(2) : 'N/A'}`);

  console.log('\nStockpile:');
  console.log(`  Total: ${String(stats.stockpile.total)}`);
  console.log(`  Available: ${String(stats.stockpile.available)}`);
  console.log(`  Served: ${String(stats.stockpile.served)}`);
  console.log(`  Expired: ${String(stats.stockpile.expired)}`);
  console.log(`  Avg score: ${stats.stockpile.avgScore !== null ? stats.stockpile.avgScore.toFixed(2) : 'N/A'}`);

  if (stats.topTargets.length > 0) {
    console.log('\nTop Targets:');
    for (const t of stats.topTargets) {
      console.log(`  ${t.name}: ${String(t.stockpileCount)} roasts (avg ${t.avgScore.toFixed(2)})`);
    }
  }

  console.log('');
}

// --- CLI ---

const program = new Command()
  .name('farm')
  .description('Roast Farm Pipeline — generate, evaluate, and curate roast content')
  .version('0.1.0');

program
  .command('stats')
  .description('Show farm pipeline statistics')
  .option('--db <path>', 'Database path', DEFAULT_DB_PATH)
  .action((opts: { db: string }) => {
    const { db, farmTarget, farmAttempt, stockpile } = createRepos(opts.db);
    const stats = buildStats(farmTarget, farmAttempt, stockpile);
    printStats(stats);
    db.close();
  });

program
  .command('evaluate')
  .description('Evaluate unevaluated farm attempts with judge panel')
  .option('--db <path>', 'Database path', DEFAULT_DB_PATH)
  .option('--limit <n>', 'Max attempts to evaluate', '20')
  .option('--threshold <score>', 'Minimum composite score for stockpile', '4.0')
  .option('--concurrency <n>', 'Parallel evaluations', '3')
  .action(async (opts: { db: string; limit: string; threshold: string; concurrency: string }) => {
    const { db, farmAttempt, stockpile, logger } = createRepos(opts.db);
    const provider = createProviderFrom(db, logger);

    const limit = parseInt(opts.limit, 10);
    const threshold = parseFloat(opts.threshold);
    const concurrency = parseInt(opts.concurrency, 10);

    const unevaluated = farmAttempt.getUnevaluated(limit);
    if (unevaluated.length === 0) {
      console.log('No unevaluated attempts found.');
      db.close();
      return;
    }

    console.log(`Evaluating ${String(unevaluated.length)} attempts (threshold=${String(threshold)})...\n`);

    const evaluator = new SelfEvaluator({ provider, logger, threshold });
    const results = await evaluator.evaluateBatch(unevaluated, concurrency);

    let promoted = 0;
    let discarded = 0;

    for (const result of results) {
      const evalJson = JSON.stringify(result.evaluations);
      farmAttempt.updateScore(result.attemptId, result.compositeScore, evalJson);

      if (result.verdict === 'stockpile') {
        const attempt = farmAttempt.getById(result.attemptId);
        if (!attempt) {
          logger.warn({ attemptId: result.attemptId }, 'Attempt disappeared after evaluation');
          continue;
        }
        if (stockpile.isDuplicate(attempt.tweetText, attempt.targetName)) {
          discarded++;
          logger.info({ attemptId: attempt.id }, 'Skipped duplicate roast');
          console.log(`  ~ ${attempt.targetName}: ${result.compositeScore.toFixed(1)} → duplicate, skipped`);
        } else {
          stockpile.insert({
            attemptId: attempt.id,
            targetName: attempt.targetName,
            targetType: attempt.targetType,
            tweetText: attempt.tweetText,
            angle: attempt.angle ?? undefined,
            qualityScore: result.compositeScore,
            evaluatorOutput: evalJson,
            researchNotes: attempt.researchNotes ?? undefined,
            freshnessType: 'evergreen',
          });
          farmAttempt.markPromoted(attempt.id);
          promoted++;
          console.log(`  ✓ ${attempt.targetName}: ${result.compositeScore.toFixed(1)} → stockpile`);
        }
      } else {
        discarded++;
        const attempt = farmAttempt.getById(result.attemptId);
        const name = attempt?.targetName ?? `#${String(result.attemptId)}`;
        console.log(`  ✗ ${name}: ${result.compositeScore.toFixed(1)} → discard`);
      }
    }

    console.log(`\nDone: ${String(promoted)} promoted, ${String(discarded)} discarded`);
    db.close();
  });

program
  .command('prune')
  .description('Clean up old farm attempts and expired stockpile')
  .option('--db <path>', 'Database path', DEFAULT_DB_PATH)
  .option('--attempts-ttl <days>', 'TTL for unpromoted attempts in days', '30')
  .action((opts: { db: string; attemptsTtl: string }) => {
    const { db, farmAttempt, stockpile, logger } = createRepos(opts.db);
    const ttl = parseInt(opts.attemptsTtl, 10);
    const prunedAttempts = farmAttempt.pruneOld(ttl);
    const prunedExpired = stockpile.pruneExpired();
    logger.info({ prunedAttempts, prunedExpired, ttlDays: ttl }, 'Prune complete');
    console.log(`Pruned ${String(prunedAttempts)} old attempts (>${String(ttl)} days)`);
    console.log(`Expired ${String(prunedExpired)} data-dependent stockpile roasts`);
    db.close();
  });

program.parse();

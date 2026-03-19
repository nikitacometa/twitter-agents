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
 *   pnpm farm export --top 50 --output data/landing.json
 *   pnpm farm sync --export data/stockpile.ndjson
 *   pnpm farm sync --import data/stockpile.ndjson
 *   pnpm farm pipeline --discover-limit 10 --generate-limit 5
 *   pnpm farm prune --attempts-ttl 30
 */

import { config } from 'dotenv';
config({ override: true });
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
import { BatchGenerator } from './batch-generator.js';
import { TargetDiscoverer } from './target-discoverer.js';
import { createFarmLogger } from './logger.js';
import { exportNdjson, importNdjson, exportLandingJson } from './sync.js';
import { formatFarmSummary, sendFarmNotification } from './notify.js';
import type { FarmRunSummary, GenerateTargetStats, EvaluateAttemptResult } from './notify.js';
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
  .command('discover')
  .description('Discover roast targets from DexScreener and CoinGecko')
  .option('--db <path>', 'Database path', DEFAULT_DB_PATH)
  .option('--limit <n>', 'Max targets to discover', '20')
  .option('--source <src>', 'Source: dexscreener, coingecko, or all', 'all')
  .option('--enrich', 'Enrich top candidates via Perplexity')
  .option('--max-enrich <n>', 'Max Perplexity enrichment calls', '5')
  .action(async (opts: {
    db: string;
    limit: string;
    source: string;
    enrich?: boolean;
    maxEnrich: string;
  }) => {
    const { db, farmTarget, stockpile, logger } = createRepos(opts.db);
    const provider = createProviderFrom(db, logger);

    const validSources = ['all', 'dexscreener', 'coingecko'] as const;
    if (!validSources.includes(opts.source as typeof validSources[number])) {
      console.log(`Invalid source "${opts.source}". Use: dexscreener, coingecko, or all.`);
      db.close();
      return;
    }
    const sources: Array<'dexscreener' | 'coingecko'> = opts.source === 'all'
      ? ['dexscreener', 'coingecko']
      : [opts.source as 'dexscreener' | 'coingecko'];

    const limit = parseInt(opts.limit, 10);
    const maxEnrich = parseInt(opts.maxEnrich, 10);

    console.log(`Discovering targets from ${sources.join(' + ')} (limit ${String(limit)})...\n`);

    const discoverer = new TargetDiscoverer({
      provider,
      farmTarget,
      stockpile,
      logger,
      maxEnrich,
    });

    const { targets, result } = await discoverer.discover({
      limit,
      sources,
      enrich: opts.enrich ?? false,
    });

    for (const target of targets) {
      const scoreStr = target.priorityScore >= 0
        ? `+${String(target.priorityScore)}`
        : String(target.priorityScore);
      console.log(`  ${scoreStr} ${target.name} (${target.type}, ${target.source})`);
      console.log(`      ${target.reason}`);
    }

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      for (const err of result.errors) {
        console.log(`  ✗ ${err}`);
      }
    }

    console.log(`\nDone: ${String(result.discovered)} discovered, ${String(result.skippedDuplicates)} duplicates skipped, ${String(result.enriched)} enriched`);
    db.close();
  });

program
  .command('generate')
  .description('Generate roast variants for targets')
  .option('--db <path>', 'Database path', DEFAULT_DB_PATH)
  .option('--targets <names>', 'Comma-separated target names')
  .option('--from-discovered', 'Use pending targets from farm_targets')
  .option('--limit <n>', 'Max targets (with --from-discovered)', '5')
  .option('--variants <n>', 'Variants per target', '3')
  .option('--mutations <n>', 'Mutations per target', '2')
  .option('--concurrency <n>', 'Parallel generation tasks', '2')
  .action(async (opts: {
    db: string;
    targets?: string;
    fromDiscovered?: boolean;
    limit: string;
    variants: string;
    mutations: string;
    concurrency: string;
  }) => {
    const { db, farmTarget, farmAttempt, logger } = createRepos(opts.db);
    const provider = createProviderFrom(db, logger);

    let targets: Array<{ name: string; type: string }> = [];

    if (opts.targets) {
      targets = opts.targets.split(',').map((name) => ({
        name: name.trim(),
        type: 'project',
      }));
    } else if (opts.fromDiscovered) {
      const limit = parseInt(opts.limit, 10);
      const pending = farmTarget.getPending(limit);
      targets = pending.map((t) => ({ name: t.name, type: t.type }));

      for (const t of pending) {
        farmTarget.updateStatus(t.id, 'generating');
      }
    }

    if (targets.length === 0) {
      console.log('No targets specified. Use --targets or --from-discovered.');
      db.close();
      return;
    }

    const variantsPerTarget = parseInt(opts.variants, 10);
    const mutationCount = parseInt(opts.mutations, 10);
    const concurrency = parseInt(opts.concurrency, 10);

    console.log(`Generating ${String(variantsPerTarget)} variants for ${String(targets.length)} targets...\n`);

    const generator = new BatchGenerator({
      provider,
      farmAttempt,
      logger,
      variantsPerTarget,
      mutationCount,
    });

    const results = await generator.generateBatch(targets, concurrency);

    let totalAttempts = 0;
    let totalFiltered = 0;

    for (const result of results) {
      totalAttempts += result.attempts;
      totalFiltered += result.filtered;

      const mutationLabel = result.mutations.length > 0
        ? ` [${result.mutations.map((m) => m.id).join(', ')}]`
        : '';

      if (result.errors.length > 0) {
        console.log(`  ✗ ${result.targetName} (${result.strategy}${mutationLabel}): ${result.errors[0]}`);
      } else {
        console.log(`  ✓ ${result.targetName} (${result.strategy}${mutationLabel}): ${String(result.attempts)} stored, ${String(result.filtered)} filtered`);
      }
    }

    // Mark discovered targets as completed
    if (opts.fromDiscovered) {
      const pending = farmTarget.getPending(0);
      for (const t of pending) {
        if (t.status === 'generating') {
          farmTarget.updateStatus(t.id, 'completed');
        }
      }
    }

    console.log(`\nDone: ${String(totalAttempts)} attempts stored, ${String(totalFiltered)} filtered out`);
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

program
  .command('export')
  .description('Export stockpile for landing page (JSON)')
  .option('--db <path>', 'Database path', DEFAULT_DB_PATH)
  .option('--top <n>', 'Max roasts to export', '50')
  .option('--output <path>', 'Output file path')
  .action(async (opts: { db: string; top: string; output?: string }) => {
    const { db, stockpile } = createRepos(opts.db);
    try {
      const limit = parseInt(opts.top, 10);
      const data = exportLandingJson(stockpile, limit);

      if (opts.output) {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(opts.output, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`Exported ${String(data.total)} roasts to ${opts.output}`);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
    } finally {
      db.close();
    }
  });

program
  .command('sync')
  .description('Sync stockpile via NDJSON (export/import)')
  .option('--db <path>', 'Database path', DEFAULT_DB_PATH)
  .option('--export <path>', 'Export stockpile to NDJSON file')
  .option('--import <path>', 'Import stockpile from NDJSON file')
  .option('--limit <n>', 'Max rows to export', '1000')
  .action(async (opts: { db: string; export?: string; import?: string; limit: string }) => {
    const { db, stockpile, logger } = createRepos(opts.db);
    try {
      if (!opts.export && !opts.import) {
        console.log('Specify --export <path> or --import <path>.');
        return;
      }

      if (opts.export) {
        const limit = parseInt(opts.limit, 10);
        const count = await exportNdjson(stockpile, opts.export, limit, logger);
        console.log(`Exported ${String(count)} roasts to ${opts.export}`);
      }

      if (opts.import) {
        const result = await importNdjson(stockpile, opts.import, logger);
        console.log(`Imported ${String(result.imported)}, skipped ${String(result.skipped)} duplicates, ${String(result.errors)} errors`);
      }
    } finally {
      db.close();
    }
  });

program
  .command('pipeline')
  .description('Run full pipeline: discover → generate → evaluate')
  .option('--db <path>', 'Database path', DEFAULT_DB_PATH)
  .option('--discover-limit <n>', 'Max targets to discover', '10')
  .option('--discover-source <src>', 'Source: dexscreener, coingecko, or all', 'all')
  .option('--generate-limit <n>', 'Max targets to generate for', '5')
  .option('--variants <n>', 'Variants per target', '3')
  .option('--mutations <n>', 'Mutations per target', '2')
  .option('--eval-limit <n>', 'Max attempts to evaluate', '20')
  .option('--threshold <score>', 'Minimum score for stockpile', '4.0')
  .option('--concurrency <n>', 'Parallel tasks', '2')
  .option('--enrich', 'Enrich top candidates via Perplexity')
  .option('--max-enrich <n>', 'Max Perplexity enrichment calls', '5')
  .option('--notify', 'Send Telegram notification on completion')
  .action(async (opts: {
    db: string;
    discoverLimit: string;
    discoverSource: string;
    generateLimit: string;
    variants: string;
    mutations: string;
    evalLimit: string;
    threshold: string;
    concurrency: string;
    enrich?: boolean;
    maxEnrich: string;
    notify?: boolean;
  }) => {
    const { db, farmTarget, farmAttempt, stockpile, logger } = createRepos(opts.db);
    const startedAt = new Date().toISOString();

    // Accumulators for the Telegram summary
    const discoverData: FarmRunSummary['discover'] = {
      discovered: 0,
      skippedDuplicates: 0,
      enriched: 0,
      errors: [],
      topTargets: [],
    };
    const generateData: FarmRunSummary['generate'] = {
      targetsProcessed: 0,
      totalAttempts: 0,
      totalFiltered: 0,
      perTarget: [],
    };
    const evaluateData: FarmRunSummary['evaluate'] = {
      evaluated: 0,
      promoted: 0,
      discarded: 0,
      duplicates: 0,
      threshold: 4.0,
      results: [],
    };
    const newStockpile: FarmRunSummary['newStockpile'] = [];

    try {
      const provider = createProviderFrom(db, logger);
      const concurrency = parseInt(opts.concurrency, 10);

      // --- Step 1: Discover ---
      console.log('=== Step 1: Discover ===\n');

      const validSources = ['all', 'dexscreener', 'coingecko'] as const;
      if (!validSources.includes(opts.discoverSource as typeof validSources[number])) {
        console.log(`Invalid source "${opts.discoverSource}". Use: dexscreener, coingecko, or all.`);
        return;
      }
      const sources: Array<'dexscreener' | 'coingecko'> = opts.discoverSource === 'all'
        ? ['dexscreener', 'coingecko']
        : [opts.discoverSource as 'dexscreener' | 'coingecko'];

      const discoverLimit = parseInt(opts.discoverLimit, 10);

      const maxEnrich = parseInt(opts.maxEnrich, 10);
      const discoverer = new TargetDiscoverer({
        provider,
        farmTarget,
        stockpile,
        logger,
        maxEnrich,
      });

      const { targets: discoveredTargets, result: discoverResult } = await discoverer.discover({
        limit: discoverLimit,
        sources,
        enrich: opts.enrich ?? false,
      });

      discoverData.discovered = discoverResult.discovered;
      discoverData.skippedDuplicates = discoverResult.skippedDuplicates;
      discoverData.enriched = discoverResult.enriched;
      discoverData.errors = discoverResult.errors;
      discoverData.topTargets = discoveredTargets
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, 8)
        .map((t) => ({
          name: t.name,
          type: t.type,
          priorityScore: t.priorityScore,
          reason: t.reason,
        }));

      console.log(`Discovered ${String(discoverResult.discovered)} targets, ${String(discoverResult.skippedDuplicates)} duplicates skipped`);
      if (discoverResult.errors.length > 0) {
        for (const err of discoverResult.errors) {
          console.log(`  ✗ ${err}`);
        }
      }

      // --- Step 2: Generate ---
      console.log('\n=== Step 2: Generate ===\n');

      const generateLimit = parseInt(opts.generateLimit, 10);
      const pending = farmTarget.getPending(generateLimit);

      if (pending.length === 0) {
        console.log('No pending targets for generation.');
      } else {
        for (const t of pending) {
          farmTarget.updateStatus(t.id, 'generating');
        }

        const variantsPerTarget = parseInt(opts.variants, 10);
        const mutationCount = parseInt(opts.mutations, 10);

        console.log(`Generating ${String(variantsPerTarget)} variants for ${String(pending.length)} targets...\n`);

        const generator = new BatchGenerator({
          provider,
          farmAttempt,
          logger,
          variantsPerTarget,
          mutationCount,
        });

        const genTargets = pending.map((t) => ({ name: t.name, type: t.type }));
        const genResults = await generator.generateBatch(genTargets, concurrency);

        let totalAttempts = 0;
        const failedTargetNames = new Set<string>();
        for (const result of genResults) {
          totalAttempts += result.attempts;
          generateData.totalFiltered += result.filtered;

          const perTarget: GenerateTargetStats = {
            name: result.targetName,
            type: result.strategy,
            attempts: result.attempts,
            filtered: result.filtered,
            errors: result.errors,
          };
          generateData.perTarget.push(perTarget);

          if (result.errors.length > 0) {
            failedTargetNames.add(result.targetName);
            console.log(`  ✗ ${result.targetName}: ${result.errors[0]}`);
          } else {
            console.log(`  ✓ ${result.targetName}: ${String(result.attempts)} attempts`);
          }
        }

        generateData.targetsProcessed = pending.length;
        generateData.totalAttempts = totalAttempts;

        // Mark successful targets as completed, failed ones back to pending
        for (const t of pending) {
          farmTarget.updateStatus(t.id, failedTargetNames.has(t.name) ? 'pending' : 'completed');
        }

        console.log(`Generated ${String(totalAttempts)} total attempts`);
      }

      // --- Step 3: Evaluate ---
      console.log('\n=== Step 3: Evaluate ===\n');

      const evalLimit = parseInt(opts.evalLimit, 10);
      const threshold = parseFloat(opts.threshold);
      evaluateData.threshold = threshold;

      const unevaluated = farmAttempt.getUnevaluated(evalLimit);
      if (unevaluated.length === 0) {
        console.log('No unevaluated attempts found.');
      } else {
        console.log(`Evaluating ${String(unevaluated.length)} attempts (threshold=${String(threshold)})...\n`);

        const evaluator = new SelfEvaluator({ provider, logger, threshold });
        const evalResults = await evaluator.evaluateBatch(unevaluated, concurrency);

        evaluateData.evaluated = evalResults.length;

        for (const result of evalResults) {
          const evalJson = JSON.stringify(result.evaluations);
          farmAttempt.updateScore(result.attemptId, result.compositeScore, evalJson);

          if (result.verdict === 'stockpile') {
            const attempt = farmAttempt.getById(result.attemptId);
            if (!attempt) continue;
            if (stockpile.isDuplicate(attempt.tweetText, attempt.targetName)) {
              evaluateData.duplicates++;
              const evalEntry: EvaluateAttemptResult = {
                targetName: attempt.targetName,
                score: result.compositeScore,
                verdict: 'duplicate',
              };
              evaluateData.results.push(evalEntry);
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
              evaluateData.promoted++;
              const evalEntry: EvaluateAttemptResult = {
                targetName: attempt.targetName,
                score: result.compositeScore,
                verdict: 'stockpile',
              };
              evaluateData.results.push(evalEntry);
              newStockpile.push({
                targetName: attempt.targetName,
                tweetText: attempt.tweetText,
                angle: attempt.angle,
                qualityScore: result.compositeScore,
              });
              console.log(`  ✓ ${attempt.targetName}: ${result.compositeScore.toFixed(1)} → stockpile`);
            }
          } else {
            evaluateData.discarded++;
            const attempt = farmAttempt.getById(result.attemptId);
            const evalEntry: EvaluateAttemptResult = {
              targetName: attempt?.targetName ?? `#${String(result.attemptId)}`,
              score: result.compositeScore,
              verdict: 'discard',
            };
            evaluateData.results.push(evalEntry);
          }
        }

        console.log(`\nEvaluated: ${String(evaluateData.promoted)} promoted, ${String(evaluateData.discarded)} discarded`);
      }

      // --- Summary ---
      const stats = buildStats(farmTarget, farmAttempt, stockpile);
      console.log('\n=== Pipeline Complete ===');
      console.log(`Stockpile: ${String(stats.stockpile.available)} available (${String(stats.stockpile.total)} total)`);

      // --- Telegram Notification ---
      if (opts.notify) {
        const botToken = process.env['TELEGRAM_BOT_TOKEN'];
        const chatId = process.env['TELEGRAM_CHAT_ID'];

        if (!botToken || !chatId) {
          logger.warn('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping notification');
        } else {
          const summary: FarmRunSummary = {
            startedAt,
            finishedAt: new Date().toISOString(),
            discover: discoverData,
            generate: generateData,
            evaluate: evaluateData,
            newStockpile,
            stockpileTotals: {
              available: stats.stockpile.available,
              total: stats.stockpile.total,
              avgScore: stats.stockpile.avgScore,
            },
          };

          const message = formatFarmSummary(summary);
          await sendFarmNotification(botToken, chatId, message);
          logger.info({ chatId }, 'Farm run notification sent');
        }
      }
    } finally {
      db.close();
    }
  });

program.parse();

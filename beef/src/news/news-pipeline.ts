/**
 * News roast pipeline orchestrator — Phases 1-5.
 *
 * Phase 1: Data gathering (DB + fresh poll + DexScreener + CoinGecko)
 * Phase 2: Deep research + story mining (Opus + Perplexity)
 * Phase 3: Parallel generation (Opus + Lightning)
 * Phase 4: Filter + evaluate (rankBatch + serious 5-judge)
 * Phase 5: Notify + store
 */

import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { StockpileRepository } from '@storage/repositories/stockpile.repository.js';
import type { NewsEventRepository } from './news-event.repository.js';
import type {
  NewsVariant,
  RankedNewsVariant,
  NewsPipelineResult,
  NewsPipelineStats,
  ResearchOutput,
} from './types.js';
import { runNewsResearch, runNewsResearchFallback } from './news-research.js';
import { runNewsGeneration } from './news-generator.js';
import { formatNewsDigest, sendNewsDigest } from './news-notify.js';
import {
  fetchDexScreenerTrending,
  fetchCoinGeckoTopMovers,
} from '@farm/target-discoverer.js';
import type { DexScreenerToken, CoinGeckoMarketItem } from '@farm/target-discoverer.js';
import { RoastEvaluator, preFilter } from '@evaluation/evaluator.js';
import type { RankInput } from '@evaluation/evaluator.js';
import { filterRoast } from '@content/content-filter.js';
import { jaccardDedup } from '@roast/roast-engine.js';
import { getErrorMessage } from '@common/utils/error.util.js';

const MAX_STORIES = 5;
const TOP_SELECT = 5;
const RUNNER_UP_COUNT = 3;
const SERIOUS_EVAL_TOP = 8;
const MAX_PER_STORY = 2;

export interface NewsPipelineOptions {
  provider: ProviderManager;
  logger: Logger;
  newsEventRepo: NewsEventRepository;
  stockpileRepo: StockpileRepository;
  telegramToken: string;
  chatId: number | string;
  /** Skip serious eval, rankBatch only. */
  quick?: boolean;
  /** Skip Telegram digest notification (caller handles it). */
  skipNotify?: boolean;
}

export async function runNewsPipeline(opts: NewsPipelineOptions): Promise<NewsPipelineResult> {
  const {
    provider, logger, newsEventRepo, stockpileRepo,
    telegramToken, chatId, quick = false, skipNotify = false,
  } = opts;

  const pipelineStart = Date.now();

  // ═══════════════════════════════════════════════════════
  // PHASE 1: Data Gathering
  // ═══════════════════════════════════════════════════════
  const gatherStart = Date.now();
  logger.info('Phase 1: gathering data');

  // All sources in parallel
  const [events, dexResult, geckoResult] = await Promise.all([
    Promise.resolve(newsEventRepo.getRecent(24, 100)),
    fetchDexScreenerTrending().catch((err): DexScreenerToken[] => {
      logger.warn({ err: getErrorMessage(err) }, 'DexScreener fetch failed');
      return [];
    }),
    fetchCoinGeckoTopMovers(20).catch((err): CoinGeckoMarketItem[] => {
      logger.warn({ err: getErrorMessage(err) }, 'CoinGecko fetch failed');
      return [];
    }),
  ]);

  const gatherMs = Date.now() - gatherStart;
  logger.info(
    { events: events.length, dexTokens: dexResult.length, geckoItems: geckoResult.length, gatherMs },
    'Phase 1 complete',
  );

  // ═══════════════════════════════════════════════════════
  // PHASE 2: Deep Research + Story Mining
  // ═══════════════════════════════════════════════════════
  const researchStart = Date.now();
  logger.info('Phase 2: research + story mining');

  let research: ResearchOutput;
  try {
    research = await runNewsResearch({
      provider,
      logger,
      events,
      dexTokens: dexResult,
      geckoItems: geckoResult,
    });
  } catch (err) {
    logger.warn({ err: getErrorMessage(err) }, 'Phase 2 Opus research failed, trying fallback');
    if (events.length === 0) {
      throw new Error('No monitor events and research failed — cannot generate news digest');
    }
    research = await runNewsResearchFallback({ provider, logger, events });
  }

  const researchMs = Date.now() - researchStart;
  const storiesFound = research.stories.length;
  const stories = research.stories.slice(0, MAX_STORIES);

  logger.info(
    { storiesFound, selected: stories.length, researchMs },
    'Phase 2 complete',
  );

  if (stories.length === 0) {
    throw new Error('No roastable stories found — quiet day');
  }

  // ═══════════════════════════════════════════════════════
  // PHASE 3: Parallel Generation
  // ═══════════════════════════════════════════════════════
  const generateStart = Date.now();
  logger.info('Phase 3: parallel generation');

  const genResult = await runNewsGeneration({
    provider,
    logger,
    research: { ...research, stories },
  });

  const generateMs = Date.now() - generateStart;
  const allVariants: NewsVariant[] = [...genResult.opusVariants, ...genResult.lightningVariants];
  const totalGenerated = allVariants.length;

  logger.info(
    { totalGenerated, opus: genResult.opusVariants.length, lightning: genResult.lightningVariants.length, generateMs },
    'Phase 3 complete',
  );

  if (totalGenerated === 0) {
    throw new Error('All generation legs failed — no variants produced');
  }

  // ═══════════════════════════════════════════════════════
  // PHASE 4: Filter + Evaluate
  // ═══════════════════════════════════════════════════════
  const evalStart = Date.now();
  logger.info('Phase 4: filter + evaluate');

  // Step 1: Filter pipeline
  const filtered: NewsVariant[] = [];
  for (const v of allVariants) {
    const contentResult = filterRoast(v.text);
    if (!contentResult.passed) continue;
    const preResult = preFilter(v.text);
    if (!preResult.pass) continue;
    filtered.push(v);
  }

  // Sort by self-score for dedup (higher survives)
  filtered.sort((a, b) => b.selfScore - a.selfScore);
  const deduped = jaccardDedup(filtered, 0.6);

  logger.info(
    { totalGenerated, afterFilter: filtered.length, afterDedup: deduped.length },
    'Filter + dedup complete',
  );

  if (deduped.length === 0) {
    throw new Error(`All ${String(totalGenerated)} variants filtered out`);
  }

  // Step 2: Batch ranking
  const rankInputs: RankInput[] = deduped.map((v, idx) => ({
    index: idx,
    text: v.text,
    angle: v.angle,
    selfScore: v.selfScore,
  }));

  const evaluator = new RoastEvaluator({ provider, logger, mode: 'quick' });
  let ranked: RankedNewsVariant[];

  try {
    const rankingOutput = await evaluator.rankBatch(rankInputs);
    ranked = [];
    for (const r of rankingOutput.rankings) {
      if (r.index < 0 || r.index >= deduped.length) continue;
      const v = deduped[r.index]!;
      ranked.push({
        ...v,
        judgeScore: r.score,
        funny: r.funny,
        impact: r.impact,
        original: r.original,
        reason: r.reason,
      });
    }
  } catch (err) {
    logger.warn({ err: getErrorMessage(err) }, 'Batch ranking failed, using self-score');
    ranked = deduped.map((v) => ({
      ...v,
      judgeScore: v.selfScore,
      funny: 0,
      impact: 0,
      original: 0,
      reason: 'self-score fallback',
    }));
  }

  // Ensure ranked is sorted
  ranked.sort((a, b) => b.judgeScore - a.judgeScore);
  const rankedCount = ranked.length;

  // Step 3: Serious evaluation on top candidates
  let evaluated = 0;
  if (!quick && ranked.length > 0) {
    const topN = ranked.slice(0, SERIOUS_EVAL_TOP);
    const seriousEvaluator = new RoastEvaluator({ provider, logger, mode: 'serious' });

    const evalInputs = topN.map((v, i) => ({
      id: `news-eval-${String(i)}`,
      targetName: v.storyId,
      tweetText: v.text,
      researchNotes: genResult.researchNotes ?? research.researchSummary,
    }));

    try {
      const evalResults = await seriousEvaluator.evaluateBatch(evalInputs, 3);
      evaluated = evalResults.length;

      for (let i = 0; i < evalResults.length; i++) {
        const evalResult = evalResults[i]!;
        const variant = topN[i]!;
        variant.judgeScore = evalResult.compositeScore;
        if (evalResult.verdict === 'discard') {
          variant.judgeScore = 0;
          variant.reason = evalResult.vetoReasons?.[0] ?? 'vetoed';
        }
      }

      // Re-sort after serious eval
      topN.sort((a, b) => b.judgeScore - a.judgeScore);
      ranked.splice(0, topN.length, ...topN);
      ranked.sort((a, b) => b.judgeScore - a.judgeScore);
    } catch (err) {
      logger.warn({ err: getErrorMessage(err) }, 'Serious eval failed, keeping rankBatch scores');
    }
  }

  // Step 4: Story diversity enforcement (max 2 per story)
  const finalRoasts: RankedNewsVariant[] = [];
  const storyCount = new Map<string, number>();

  for (const variant of ranked) {
    if (variant.judgeScore <= 0) continue;
    const count = storyCount.get(variant.storyId) ?? 0;
    if (count >= MAX_PER_STORY) continue;
    storyCount.set(variant.storyId, count + 1);
    finalRoasts.push(variant);
    if (finalRoasts.length >= TOP_SELECT + RUNNER_UP_COUNT) break;
  }

  const topRoasts = finalRoasts.slice(0, TOP_SELECT);
  const runnerUps = finalRoasts.slice(TOP_SELECT, TOP_SELECT + RUNNER_UP_COUNT);

  const evalMs = Date.now() - evalStart;

  logger.info(
    { ranked: rankedCount, evaluated, selected: topRoasts.length, runnerUps: runnerUps.length, evalMs },
    'Phase 4 complete',
  );

  // ═══════════════════════════════════════════════════════
  // PHASE 5: Notify + Store
  // ═══════════════════════════════════════════════════════
  const durationMs = Date.now() - pipelineStart;

  const stats: NewsPipelineStats = {
    storiesFound,
    storiesSelected: stories.length,
    totalGenerated,
    afterFilter: filtered.length,
    afterDedup: deduped.length,
    ranked: rankedCount,
    evaluated,
    selected: topRoasts.length,
    durationMs,
    phaseTimings: {
      gatherMs,
      researchMs,
      generateMs,
      evaluateMs: evalMs,
    },
    opusVariants: genResult.opusVariants.length,
    lightningVariants: genResult.lightningVariants.length,
  };

  // Format and send Telegram notification (unless caller handles it)
  if (!skipNotify) {
    const html = formatNewsDigest(topRoasts, runnerUps, stories, stats);
    try {
      await sendNewsDigest(telegramToken, chatId, html);
      logger.info('News digest sent to Telegram');
    } catch (err) {
      logger.error({ err: getErrorMessage(err) }, 'Failed to send news digest to Telegram');
    }
  }

  // Stockpile all evaluated roasts (top + runners) with 48h expiry
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  for (const roast of [...topRoasts, ...runnerUps]) {
    try {
      stockpileRepo.insert({
        targetName: roast.storyId,
        targetType: 'project',
        tweetText: roast.text,
        angle: roast.angle,
        qualityScore: roast.judgeScore,
        researchNotes: genResult.researchNotes ?? undefined,
        freshnessType: 'data_dependent',
        expiresAt,
      });
    } catch (err) {
      logger.warn({ err: getErrorMessage(err), text: roast.text.slice(0, 50) }, 'Failed to stockpile news roast');
    }
  }

  // Mark all events from this window as used — sourceTweetIds is unreliable
  // because LLM may not populate it, and all events contributed context to research
  const allTweetIds = events.map((e) => e.tweetId);
  newsEventRepo.markUsed(allTweetIds);

  // Log digest
  newsEventRepo.insertDigest({
    storiesFound,
    storiesSelected: stories.length,
    variantsGenerated: totalGenerated,
    variantsFiltered: deduped.length,
    variantsEvaluated: evaluated,
    roastsSent: topRoasts.length,
    topStory: topRoasts[0]?.storyId,
    topScore: topRoasts[0]?.judgeScore,
    researchSummary: research.researchSummary,
    durationMs,
  });

  logger.info(
    { durationMs, stories: stories.length, generated: totalGenerated, selected: topRoasts.length },
    'News pipeline complete',
  );

  return {
    stories,
    topRoasts,
    runnerUps,
    researchSummary: research.researchSummary,
    marketContext: research.marketContext,
    stats,
  };
}

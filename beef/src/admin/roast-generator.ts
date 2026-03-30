import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { AgentRoastOutput, TaskProfile } from '@agent/agent.types.js';
import type { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import type { ConfigRepository } from '@storage/repositories/config.repository.js';
import type { ExternalExampleRepository } from '@storage/repositories/external-example.repository.js';
import type { RoastPatternRepository } from '@storage/repositories/roast-pattern.repository.js';
import type { StockpileRepository } from '@storage/repositories/stockpile.repository.js';
import type { FarmAttemptRepository } from '@storage/repositories/farm-attempt.repository.js';
import { RoastEngine, jaccardDedup } from '@roast/roast-engine.js';
import type { EvaluationMode, FastRoastResult, LightningRoastResult } from '@roast/roast-engine.js';
import { buildCreativeMemory } from '@roast/creative-memory.js';
import { RoastEvaluator, preFilter } from '@evaluation/evaluator.js';
import type { EvaluationOutput, RankInput } from '@evaluation/evaluator.js';
import { filterRoast } from '@content/content-filter.js';
import { getErrorMessage } from '@common/utils/error.util.js';

let cachedEngine: RoastEngine | null = null;
let cachedEvaluationMode: EvaluationMode = 'none';
let cachedThreshold: number | undefined;

function getEngine(
  provider: ProviderManager,
  logger: Logger,
  evaluationMode: EvaluationMode = 'none',
  evaluationThreshold?: number,
): RoastEngine {
  if (!cachedEngine || cachedEvaluationMode !== evaluationMode || cachedThreshold !== evaluationThreshold) {
    cachedEngine = new RoastEngine({ provider, logger, evaluationMode, evaluationThreshold });
    cachedEvaluationMode = evaluationMode;
    cachedThreshold = evaluationThreshold;
  }
  return cachedEngine;
}

export interface GenerateRoastsResult extends AgentRoastOutput {
  evaluation?: EvaluationOutput;
}

export async function generateRoasts(
  targetName: string,
  provider: ProviderManager,
  logger: Logger,
  feedbackRepo?: FeedbackRepository,
  profile?: TaskProfile,
  variantCount?: number,
  configRepo?: ConfigRepository,
  exampleRepo?: ExternalExampleRepository,
  patternRepo?: RoastPatternRepository,
  imagePaths?: string[],
  profileContext?: string,
  evaluationMode?: EvaluationMode,
  stockpileRepo?: StockpileRepository,
  mutationCount?: number,
  farmAttemptRepo?: FarmAttemptRepository,
  evaluationThreshold?: number,
  roastMeMode?: boolean,
  targetType?: 'person' | 'project' | 'token' | 'trend',
  tweetMode?: boolean,
  userContext?: string,
): Promise<GenerateRoastsResult> {
  const engine = getEngine(provider, logger, evaluationMode, evaluationThreshold);

  let memory = buildCreativeMemory({
    targetName,
    logger,
    feedbackRepo,
    configRepo,
    exampleRepo,
    patternRepo,
    stockpileRepo,
    farmAttemptRepo,
  });

  // Ensure memory exists if any augmentation fields are provided
  const hasAugmentation = profileContext || userContext || roastMeMode || targetType || tweetMode;
  if (hasAugmentation && !memory) {
    memory = { fireExamples: [] };
  }
  if (memory) {
    if (profileContext) memory = { ...memory, profileContext };
    if (userContext) memory = { ...memory, userContext };
    if (roastMeMode !== undefined || targetType || tweetMode !== undefined) {
      memory = { ...memory, roastMeMode, targetType, tweetMode };
    }
  }

  if (memory && (memory.fireExamples.length > 0 || memory.angleWeights || memory.rejectExamples || memory.externalExamples)) {
    logger.info(
      {
        target: targetName,
        fireExamples: memory.fireExamples.length,
        externalExamples: memory.externalExamples?.length ?? 0,
        learnedTechniques: memory.learnedTechniques?.length ?? 0,
        hasHistory: !!memory.targetHistory,
        rejectExamples: memory.rejectExamples?.length ?? 0,
        angleWeights: memory.angleWeights?.length ?? 0,
        hasStyleSupplement: !!memory.styleSupplement,
      },
      'Creative memory loaded',
    );
  }

  const result = await engine.generateRoast(targetName, 'telegram', memory, profile, variantCount, imagePaths, mutationCount);

  // Record variants as farm_attempts for reject-example learning
  if (farmAttemptRepo) {
    for (const variant of result.draft.variants) {
      try {
        farmAttemptRepo.insert({
          targetName,
          targetType: 'project',
          tweetText: variant.text,
          angle: variant.angle,
          strategy: 'unified',
          llmSelfScore: variant.score,
          researchNotes: result.draft.researchNotes ?? undefined,
          factCheckPassed: result.draft.factCheckPassed,
        });
      } catch (err) {
        logger.warn({ err, target: targetName }, 'Failed to record farm attempt');
      }
    }
  }

  return {
    variants: result.draft.variants,
    bestIndex: result.draft.bestIndex,
    researchNotes: result.draft.researchNotes,
    factCheckPassed: result.draft.factCheckPassed,
    evaluation: result.evaluation,
    diaryThought: result.diaryThought,
  };
}

export async function generateRoastsFast(
  targetName: string,
  provider: ProviderManager,
  logger: Logger,
  feedbackRepo?: FeedbackRepository,
  configRepo?: ConfigRepository,
  exampleRepo?: ExternalExampleRepository,
  patternRepo?: RoastPatternRepository,
  stockpileRepo?: StockpileRepository,
  farmAttemptRepo?: FarmAttemptRepository,
  imagePaths?: string[],
  profileContext?: string,
  tweetMode?: boolean,
  userContext?: string,
): Promise<FastRoastResult> {
  const engine = getEngine(provider, logger, 'none');

  let memory = buildCreativeMemory({
    targetName,
    logger,
    feedbackRepo,
    configRepo,
    exampleRepo,
    patternRepo,
    stockpileRepo,
    farmAttemptRepo,
  });

  const hasAugmentation = profileContext || userContext || tweetMode;
  if (hasAugmentation && !memory) {
    memory = { fireExamples: [] };
  }
  if (memory) {
    if (profileContext) memory = { ...memory, profileContext };
    if (userContext) memory = { ...memory, userContext };
    if (tweetMode !== undefined) memory = { ...memory, tweetMode };
  }

  const result = await engine.generateRoastFast(
    targetName,
    'telegram',
    memory,
    imagePaths,
    tweetMode,
  );

  // Record variants as farm_attempts
  if (farmAttemptRepo) {
    for (const variant of result.variants) {
      try {
        farmAttemptRepo.insert({
          targetName,
          targetType: 'project',
          tweetText: variant.text,
          angle: variant.angle,
          strategy: 'fast-gen',
          llmSelfScore: variant.selfScore,
          researchNotes: result.researchNotes ?? undefined,
          factCheckPassed: true,
        });
      } catch (err) {
        logger.warn({ err, target: targetName }, 'Failed to record fast farm attempt');
      }
    }
  }

  return result;
}

export async function generateRoastsLightning(
  targetName: string,
  provider: ProviderManager,
  logger: Logger,
  feedbackRepo?: FeedbackRepository,
  configRepo?: ConfigRepository,
  exampleRepo?: ExternalExampleRepository,
  patternRepo?: RoastPatternRepository,
  stockpileRepo?: StockpileRepository,
  farmAttemptRepo?: FarmAttemptRepository,
  imagePaths?: string[],
  profileContext?: string,
  tweetMode?: boolean,
  userContext?: string,
  useResearch?: boolean,
): Promise<LightningRoastResult> {
  const engine = getEngine(provider, logger, 'none');

  let memory = buildCreativeMemory({
    targetName,
    logger,
    feedbackRepo,
    configRepo,
    exampleRepo,
    patternRepo,
    stockpileRepo,
    farmAttemptRepo,
  });

  const hasAugmentation = profileContext || userContext || tweetMode;
  if (hasAugmentation && !memory) {
    memory = { fireExamples: [] };
  }
  if (memory) {
    if (profileContext) memory = { ...memory, profileContext };
    if (userContext) memory = { ...memory, userContext };
    if (tweetMode !== undefined) memory = { ...memory, tweetMode };
  }

  const result = await engine.generateRoastLightning(
    targetName,
    'telegram',
    memory,
    useResearch ?? false,
    imagePaths,
  );

  // Record variants as farm_attempts
  if (farmAttemptRepo) {
    for (const variant of result.variants) {
      try {
        farmAttemptRepo.insert({
          targetName,
          targetType: 'project',
          tweetText: variant.text,
          angle: variant.angle,
          strategy: 'lightning',
          llmSelfScore: variant.score,
          researchNotes: result.researchNotes ?? undefined,
          factCheckPassed: true,
        });
      } catch (err) {
        logger.warn({ err, target: targetName }, 'Failed to record lightning farm attempt');
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Max pipeline — 3 parallel pipelines (Opus + Sonnet+research + Sonnet) → unified ranking
// ---------------------------------------------------------------------------

export type MaxPipeline = 'opus' | 'sonnet-research' | 'sonnet';

export interface MaxRoastVariant {
  text: string;
  angle: string;
  selfScore: number;
  judgeScore: number;
  funny: number;
  impact: number;
  original: number;
  reason: string;
  pipeline: MaxPipeline;
}

export interface MaxRoastResult {
  variants: MaxRoastVariant[];
  researchNotes: string | null;
  stats: {
    totalGenerated: number;
    afterDedup: number;
    ranked: number;
    evaluated: number;
    durationMs: number;
    pipelineResults: Array<{
      pipeline: MaxPipeline;
      status: 'ok' | 'failed' | 'timeout';
      variants: number;
      durationMs: number;
    }>;
  };
}

/** Progress callback — fired as each pipeline completes. */
export type MaxProgressCallback = (pipeline: MaxPipeline, status: 'ok' | 'failed' | 'timeout', variants: number, durationMs: number) => void;

interface MaxCommonOpts {
  targetName: string;
  provider: ProviderManager;
  logger: Logger;
  feedbackRepo?: FeedbackRepository;
  configRepo?: ConfigRepository;
  exampleRepo?: ExternalExampleRepository;
  patternRepo?: RoastPatternRepository;
  stockpileRepo?: StockpileRepository;
  farmAttemptRepo?: FarmAttemptRepository;
  imagePaths?: string[];
  profileContext?: string;
  tweetMode?: boolean;
  userContext?: string;
  /** Opus timeout cap in ms. Default: 420_000 (7 min). */
  opusTimeoutMs?: number;
  /** Skip serious eval, use rankBatch only. */
  quick?: boolean;
  onProgress?: MaxProgressCallback;
}

function raceTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${String(Math.round(ms / 1000))}s`)), ms);
    }),
  ]);
}

export async function generateRoastsMax(opts: MaxCommonOpts): Promise<MaxRoastResult> {
  const {
    targetName, provider, logger,
    feedbackRepo, configRepo, exampleRepo, patternRepo,
    stockpileRepo, farmAttemptRepo,
    imagePaths, profileContext, tweetMode, userContext,
    opusTimeoutMs = 420_000,
    quick = false,
    onProgress,
  } = opts;

  const startMs = Date.now();
  const pipelineResults: MaxRoastResult['stats']['pipelineResults'] = [];

  // Shared repos for all 3 pipelines
  const repoArgs = { feedbackRepo, configRepo, exampleRepo, patternRepo, stockpileRepo, farmAttemptRepo };

  // --- Launch 3 pipelines in parallel ---

  const opusPromise = raceTimeout(
    generateRoasts(
      targetName, provider, logger,
      repoArgs.feedbackRepo, 'farm-generate', 3,
      repoArgs.configRepo, repoArgs.exampleRepo, repoArgs.patternRepo,
      imagePaths, profileContext,
      undefined, // evaluationMode = none
      repoArgs.stockpileRepo, undefined, // no mutations
      repoArgs.farmAttemptRepo, undefined,
      undefined, 'person', tweetMode,
      userContext,
    ),
    opusTimeoutMs,
    'Opus pipeline',
  );

  const sonnetResearchPromise = generateRoastsLightning(
    targetName, provider, logger,
    repoArgs.feedbackRepo, repoArgs.configRepo,
    repoArgs.exampleRepo, repoArgs.patternRepo,
    repoArgs.stockpileRepo, repoArgs.farmAttemptRepo,
    imagePaths, profileContext,
    tweetMode, userContext,
    true, // useResearch
  );

  const sonnetPromise = generateRoastsLightning(
    targetName, provider, logger,
    repoArgs.feedbackRepo, repoArgs.configRepo,
    repoArgs.exampleRepo, repoArgs.patternRepo,
    repoArgs.stockpileRepo, repoArgs.farmAttemptRepo,
    imagePaths, profileContext,
    tweetMode, userContext,
    false, // no research
  );

  // --- Track individual completions for progress ---

  interface TaggedVariant {
    text: string;
    angle: string;
    selfScore: number;
    pipeline: MaxPipeline;
  }

  const allVariants: TaggedVariant[] = [];
  let researchNotes: string | null = null;

  const trackPipeline = async <T>(
    promise: Promise<T>,
    pipeline: MaxPipeline,
    extract: (result: T) => { variants: TaggedVariant[]; researchNotes?: string | null },
  ): Promise<void> => {
    const pipelineStart = Date.now();
    try {
      const result = await promise;
      const extracted = extract(result);
      allVariants.push(...extracted.variants);
      if (extracted.researchNotes && !researchNotes) {
        researchNotes = extracted.researchNotes;
      }
      const durationMs = Date.now() - pipelineStart;
      pipelineResults.push({ pipeline, status: 'ok', variants: extracted.variants.length, durationMs });
      onProgress?.(pipeline, 'ok', extracted.variants.length, durationMs);
      logger.info({ pipeline, variants: extracted.variants.length, durationMs }, 'Max pipeline leg completed');
    } catch (err) {
      const durationMs = Date.now() - pipelineStart;
      const isTimeout = getErrorMessage(err).includes('timed out');
      const status = isTimeout ? 'timeout' as const : 'failed' as const;
      pipelineResults.push({ pipeline, status, variants: 0, durationMs });
      onProgress?.(pipeline, status, 0, durationMs);
      logger.warn({ pipeline, err, durationMs }, `Max pipeline leg ${status}`);
    }
  };

  await Promise.all([
    trackPipeline(opusPromise, 'opus', (r) => ({
      variants: r.variants.map((v) => ({ text: v.text, angle: v.angle, selfScore: v.score, pipeline: 'opus' as const })),
      researchNotes: r.researchNotes,
    })),
    trackPipeline(sonnetResearchPromise, 'sonnet-research', (r) => ({
      variants: r.variants.map((v) => ({ text: v.text, angle: v.angle, selfScore: v.score, pipeline: 'sonnet-research' as const })),
      researchNotes: r.researchNotes,
    })),
    trackPipeline(sonnetPromise, 'sonnet', (r) => ({
      variants: r.variants.map((v) => ({ text: v.text, angle: v.angle, selfScore: v.score, pipeline: 'sonnet' as const })),
    })),
  ]);

  const totalGenerated = allVariants.length;

  if (totalGenerated === 0) {
    throw new Error(`All 3 max pipelines failed for "${targetName}"`);
  }

  // --- Cross-pipeline filter + dedup ---
  // Lightning pipelines already filter internally, but Opus variants may not have gone
  // through preFilter. Run both filters on the merged pool for consistency.
  const filtered: TaggedVariant[] = [];
  for (const v of allVariants) {
    const contentResult = filterRoast(v.text);
    if (!contentResult.passed) {
      logger.debug({ text: v.text, reasons: contentResult.reasons, pipeline: v.pipeline }, 'Max content filter reject');
      continue;
    }
    const preResult = preFilter(v.text, targetName);
    if (!preResult.pass) {
      logger.debug({ text: v.text, reason: preResult.reason, pipeline: v.pipeline }, 'Max pre-filter reject');
      continue;
    }
    filtered.push(v);
  }

  if (filtered.length === 0) {
    throw new Error(`All ${String(totalGenerated)} max variants filtered out for "${targetName}"`);
  }

  // Sort by self-score desc before dedup (higher-scored variant kept)
  filtered.sort((a, b) => b.selfScore - a.selfScore);
  const deduped = jaccardDedup(filtered, 0.6);

  logger.info(
    { totalGenerated, filtered: filtered.length, afterDedup: deduped.length },
    'Max pipeline merge + filter + dedup complete',
  );

  // --- Stage 1: Batch ranking (comparative, 1 LLM call) ---
  const rankInputs: RankInput[] = deduped.map((v, idx) => ({
    index: idx,
    text: v.text,
    angle: v.angle,
    selfScore: v.selfScore,
  }));

  const evaluator = new RoastEvaluator({ provider, logger, mode: 'quick' });

  let ranked: MaxRoastVariant[];
  try {
    const rankingOutput = await evaluator.rankBatch(rankInputs);

    ranked = [];
    for (const r of rankingOutput.rankings) {
      if (r.index < 0 || r.index >= deduped.length) continue;
      const v = deduped[r.index]!;
      ranked.push({
        text: v.text,
        angle: v.angle,
        selfScore: v.selfScore,
        judgeScore: r.score,
        funny: r.funny,
        impact: r.impact,
        original: r.original,
        reason: r.reason,
        pipeline: v.pipeline,
      });
    }
  } catch (err) {
    logger.warn({ err }, 'Max batch ranking failed, using self-score order');
    ranked = deduped.map((v) => ({
      text: v.text,
      angle: v.angle,
      selfScore: v.selfScore,
      judgeScore: v.selfScore,
      funny: 0,
      impact: 0,
      original: 0,
      reason: 'self-score fallback',
      pipeline: v.pipeline,
    }));
  }

  if (ranked.length === 0) {
    ranked = deduped.map((v) => ({
      text: v.text,
      angle: v.angle,
      selfScore: v.selfScore,
      judgeScore: v.selfScore,
      funny: 0,
      impact: 0,
      original: 0,
      reason: 'ranking produced no valid entries',
      pipeline: v.pipeline,
    }));
  }

  const rankedCount = ranked.length;

  // --- Stage 2: Serious eval on top 5 (optional) ---
  let evaluated = 0;
  if (!quick && ranked.length > 0) {
    const top5 = ranked.slice(0, 5);
    const seriousEvaluator = new RoastEvaluator({ provider, logger, mode: 'serious' });

    const evalInputs = top5.map((v, i) => ({
      id: `max-eval-${String(i)}`,
      targetName,
      tweetText: v.text,
      researchNotes,
    }));

    try {
      const evalResults = await seriousEvaluator.evaluateBatch(evalInputs, 3);
      evaluated = evalResults.length;

      // Replace judgeScore with serious composite for evaluated variants
      for (let i = 0; i < evalResults.length; i++) {
        const evalResult = evalResults[i]!;
        const variant = top5[i]!;
        variant.judgeScore = evalResult.compositeScore;
        // Mark discarded variants by zeroing their score
        if (evalResult.verdict === 'discard') {
          variant.judgeScore = 0;
          variant.reason = evalResult.vetoReasons?.[0] ?? evalResult.preFilterReason ?? 'vetoed';
        }
      }

      // Merge serious-eval'd variants back, then re-sort entire array
      // so vetoed variants (score=0) sink below rankBatch-scored ones
      top5.sort((a, b) => b.judgeScore - a.judgeScore);
      ranked.splice(0, top5.length, ...top5);
      ranked.sort((a, b) => b.judgeScore - a.judgeScore);
    } catch (err) {
      logger.warn({ err }, 'Max serious evaluation failed, keeping rankBatch scores');
    }
  }

  const durationMs = Date.now() - startMs;

  logger.info(
    {
      targetName,
      totalGenerated,
      afterDedup: deduped.length,
      ranked: rankedCount,
      evaluated,
      durationMs,
      top3: ranked.slice(0, 3).map((v) => ({
        score: v.judgeScore,
        angle: v.angle,
        pipeline: v.pipeline,
      })),
      pipelineResults,
    },
    'Max roast pipeline complete',
  );

  return {
    variants: ranked,
    researchNotes,
    stats: {
      totalGenerated,
      afterDedup: deduped.length,
      ranked: rankedCount,
      evaluated,
      durationMs,
      pipelineResults,
    },
  };
}

export function generateRoastsSync(
  targetName: string,
  provider: ProviderManager,
  logger: Logger,
  feedbackRepo?: FeedbackRepository,
): { promise: Promise<AgentRoastOutput>; abort: () => void } {
  let aborted = false;
  const promise = generateRoasts(targetName, provider, logger, feedbackRepo).then((result) => {
    if (aborted) throw new Error('Generation aborted');
    return result;
  });
  return {
    promise,
    abort: () => {
      aborted = true;
    },
  };
}

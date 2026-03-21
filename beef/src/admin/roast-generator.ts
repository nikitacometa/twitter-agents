import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { AgentRoastOutput, TaskProfile } from '@agent/agent.types.js';
import type { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import type { ConfigRepository } from '@storage/repositories/config.repository.js';
import type { ExternalExampleRepository } from '@storage/repositories/external-example.repository.js';
import type { RoastPatternRepository } from '@storage/repositories/roast-pattern.repository.js';
import type { StockpileRepository } from '@storage/repositories/stockpile.repository.js';
import { RoastEngine } from '@roast/roast-engine.js';
import type { EvaluationMode } from '@roast/roast-engine.js';
import { buildCreativeMemory } from '@roast/creative-memory.js';
import type { EvaluationOutput } from '@evaluation/evaluator.js';

let cachedEngine: RoastEngine | null = null;
let cachedEvaluationMode: EvaluationMode = 'none';

function getEngine(provider: ProviderManager, logger: Logger, evaluationMode: EvaluationMode = 'none'): RoastEngine {
  if (!cachedEngine || cachedEvaluationMode !== evaluationMode) {
    cachedEngine = new RoastEngine({ provider, logger, evaluationMode });
    cachedEvaluationMode = evaluationMode;
  }
  return cachedEngine;
}

// buildCreativeMemory is imported from @roast/creative-memory.js

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
): Promise<GenerateRoastsResult> {
  const engine = getEngine(provider, logger, evaluationMode);

  let memory = buildCreativeMemory({
    targetName,
    logger,
    feedbackRepo,
    configRepo,
    exampleRepo,
    patternRepo,
    stockpileRepo,
  });
  if (profileContext && memory) {
    memory = { ...memory, profileContext };
  } else if (profileContext) {
    memory = { fireExamples: [], profileContext };
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

  return {
    variants: result.draft.variants,
    bestIndex: result.draft.bestIndex,
    researchNotes: result.draft.researchNotes,
    factCheckPassed: result.draft.factCheckPassed,
    evaluation: result.evaluation,
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

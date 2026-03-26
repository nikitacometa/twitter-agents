import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { AgentRoastOutput, TaskProfile } from '@agent/agent.types.js';
import type { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import type { ConfigRepository } from '@storage/repositories/config.repository.js';
import type { ExternalExampleRepository } from '@storage/repositories/external-example.repository.js';
import type { RoastPatternRepository } from '@storage/repositories/roast-pattern.repository.js';
import type { StockpileRepository } from '@storage/repositories/stockpile.repository.js';
import type { FarmAttemptRepository } from '@storage/repositories/farm-attempt.repository.js';
import { RoastEngine } from '@roast/roast-engine.js';
import type { EvaluationMode } from '@roast/roast-engine.js';
import { buildCreativeMemory } from '@roast/creative-memory.js';
import type { EvaluationOutput } from '@evaluation/evaluator.js';

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
          strategy: 'rubric',
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

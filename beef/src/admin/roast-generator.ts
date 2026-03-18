import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { AgentRoastOutput, TaskProfile } from '@agent/agent.types.js';
import type { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import type { ConfigRepository } from '@storage/repositories/config.repository.js';
import type { AngleWeight, CreativeMemory } from '@common/types/index.js';
import { RoastEngine } from '@roast/roast-engine.js';

let cachedEngine: RoastEngine | null = null;

function getEngine(provider: ProviderManager, logger: Logger): RoastEngine {
  if (!cachedEngine) {
    cachedEngine = new RoastEngine({ provider, logger });
  }
  return cachedEngine;
}

function buildCreativeMemory(
  targetName: string,
  feedbackRepo: FeedbackRepository,
  configRepo?: ConfigRepository,
): CreativeMemory {
  // 1. Try to get a fire example from this specific target
  const targetFire = feedbackRepo.getFireExamplesForTarget(targetName, 1);

  // 2. Get fire examples from other targets to fill up to 2
  const otherFire = feedbackRepo
    .getFireExamples(5)
    .filter((ex) => ex.target.toLowerCase() !== targetName.toLowerCase())
    .slice(0, 2 - targetFire.length);

  const fireExamples = [...targetFire, ...otherFire];

  // 3. Build target history (only useful if 3+ sessions)
  const roastCount = feedbackRepo.getTargetSessionCount(targetName);
  const targetHistory =
    roastCount >= 3
      ? { roastCount, angles: feedbackRepo.getTargetAngleHistory(targetName) }
      : undefined;

  // 4. Reject examples for anti-pattern injection (need ≥5 total rejects)
  const allRejects = feedbackRepo.getRejectExamples(5);
  const rejectExamples = allRejects.length >= 5 ? allRejects.slice(0, 3) : undefined;

  // 5. Angle weights from performance data
  const anglePerf = feedbackRepo.getAnglePerformance();
  const angleWeights: AngleWeight[] = anglePerf
    .filter((a) => a.total >= 3)
    .map((a) => ({
      angle: a.angle,
      weight: Math.max(0.3, Math.min(2.0, a.fireCount / a.total)),
    }));

  // 6. Style supplement from config (computed by /analyze)
  const styleSupplement = configRepo?.getStyleSupplement()?.text;

  return {
    fireExamples,
    targetHistory,
    rejectExamples,
    angleWeights: angleWeights.length > 0 ? angleWeights : undefined,
    styleSupplement,
  };
}

export async function generateRoasts(
  targetName: string,
  provider: ProviderManager,
  logger: Logger,
  feedbackRepo?: FeedbackRepository,
  profile?: TaskProfile,
  variantCount?: number,
  configRepo?: ConfigRepository,
): Promise<AgentRoastOutput> {
  const engine = getEngine(provider, logger);

  const memory = feedbackRepo ? buildCreativeMemory(targetName, feedbackRepo, configRepo) : undefined;

  if (memory && (memory.fireExamples.length > 0 || memory.angleWeights || memory.rejectExamples)) {
    logger.info(
      {
        target: targetName,
        fireExamples: memory.fireExamples.length,
        hasHistory: !!memory.targetHistory,
        rejectExamples: memory.rejectExamples?.length ?? 0,
        angleWeights: memory.angleWeights?.length ?? 0,
        hasStyleSupplement: !!memory.styleSupplement,
      },
      'Creative memory loaded',
    );
  }

  const result = await engine.generateRoast(targetName, 'telegram', memory, profile, variantCount);

  return {
    variants: result.draft.variants,
    bestIndex: result.draft.bestIndex,
    researchNotes: result.draft.researchNotes,
    factCheckPassed: result.draft.factCheckPassed,
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

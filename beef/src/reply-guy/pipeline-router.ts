import type { EvaluatedCandidate } from './types.js';
import type { PipelineType } from './types.js';

export interface RoutingDecision {
  candidate: EvaluatedCandidate;
  pipeline: PipelineType;
}

/**
 * Route all evaluated candidates to the Max pipeline.
 * Max produces significantly higher quality roasts (3 parallel pipelines + judge ranking)
 * and the ~5 min extra generation time is negligible for reply-guy (tweets stay relevant for hours).
 * Lightning is only used as a fallback when Max fails — handled in the pipeline, not here.
 */
export function routeCandidates(
  winners: EvaluatedCandidate[],
): RoutingDecision[] {
  return winners.map((w) => ({
    candidate: w,
    pipeline: 'max' as const,
  }));
}

import type { EvaluatedCandidate } from './types.js';
import type { PipelineType } from './types.js';

export interface RouterConfig {
  maxDailyBudget: number;
  todayMaxCount: number;
}

export interface RoutingDecision {
  candidate: EvaluatedCandidate;
  pipeline: PipelineType;
}

const MAX_AGE_MINUTES = 15;
const S_TIER_MIN_ROASTABILITY = 7;
const A_TIER_MIN_ROASTABILITY = 8;

function isMaxEligible(candidate: EvaluatedCandidate): boolean {
  const { tier } = candidate.tweet;
  const { roastability } = candidate;

  if (candidate.tweet.ageMinutes > MAX_AGE_MINUTES) return false;
  if (tier === 'S' && roastability >= S_TIER_MIN_ROASTABILITY) return true;
  if (tier === 'A' && roastability >= A_TIER_MIN_ROASTABILITY) return true;
  return false;
}

function tierPriority(tier: string): number {
  return tier === 'S' ? 1 : 0;
}

/**
 * Route evaluated candidates to Lightning or Max pipeline.
 * At most one candidate gets Max per cycle; the rest get Lightning.
 */
export function routeCandidates(
  winners: EvaluatedCandidate[],
  config: RouterConfig,
): RoutingDecision[] {
  const maxAvailable = config.todayMaxCount < config.maxDailyBudget;

  let maxCandidate: EvaluatedCandidate | null = null;

  if (maxAvailable) {
    for (const w of winners) {
      if (!isMaxEligible(w)) continue;
      if (!maxCandidate) {
        maxCandidate = w;
        continue;
      }
      const isBetter =
        tierPriority(w.tweet.tier) > tierPriority(maxCandidate.tweet.tier) ||
        (w.tweet.tier === maxCandidate.tweet.tier && w.roastability > maxCandidate.roastability);
      if (isBetter) maxCandidate = w;
    }
  }

  return winners.map((w) => ({
    candidate: w,
    pipeline: w === maxCandidate ? 'max' as const : 'lightning' as const,
  }));
}

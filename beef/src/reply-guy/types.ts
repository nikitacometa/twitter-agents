import type { ScoredTweet } from '../monitor/tweet-scorer.js';

export type PipelineType = 'lightning' | 'max';

export interface EvaluatedCandidate {
  tweet: ScoredTweet;
  roastability: number;
  reasoning: string;
  suggestedAngle: string | null;
}

export interface CycleResult {
  candidates: number;
  evaluated: number;
  winners: number;
  generated: number;
  notified: number;
  errors: number;
}

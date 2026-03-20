// Farm pipeline domain types — isolated from production roast types.

import type { TargetType } from '@common/types/index.js';

// --- Farm target (discovered by pipeline) ---

export type FarmTargetSource = 'dexscreener' | 'coingecko' | 'perplexity' | 'manual';

export type FarmTargetStatus = 'pending' | 'generating' | 'completed' | 'skipped';

export interface FarmTarget {
  id: number;
  name: string;
  type: TargetType;
  source: FarmTargetSource;
  priorityScore: number;
  reason: string | null;
  status: FarmTargetStatus;
  createdAt: string;
}

export interface InsertFarmTarget {
  name: string;
  type: TargetType;
  source: FarmTargetSource;
  priorityScore: number;
  reason?: string;
}

// --- Farm attempt (raw generation output) ---

export type PromptStrategy = 'rubric' | 'persona' | 'adversarial';

export interface FarmAttempt {
  id: number;
  targetName: string;
  targetType: string;
  tweetText: string;
  angle: string | null;
  strategy: PromptStrategy | null;
  mutationSeed: string | null;
  llmSelfScore: number | null;
  evaluatorScore: number | null;
  evaluatorOutput: string | null;
  researchNotes: string | null;
  factCheckPassed: boolean;
  agentOutput: string | null;
  promoted: boolean;
  createdAt: string;
}

export interface InsertFarmAttempt {
  targetName: string;
  targetType: string;
  tweetText: string;
  angle?: string;
  strategy?: PromptStrategy;
  mutationSeed?: string;
  llmSelfScore?: number;
  researchNotes?: string;
  factCheckPassed?: boolean;
  agentOutput?: string;
}

// --- Stockpile (curated, served to bot/landing) ---

export type FreshnessType = 'evergreen' | 'data_dependent';

export type StockpileStatus = 'available' | 'served_bot' | 'served_landing' | 'promoted' | 'expired';

export interface StockpiledRoast {
  id: number;
  attemptId: number | null;
  targetName: string;
  targetType: string;
  tweetText: string;
  angle: string | null;
  qualityScore: number;
  evaluatorOutput: string | null;
  researchNotes: string | null;
  freshnessType: FreshnessType;
  expiresAt: string | null;
  status: StockpileStatus;
  servedAt: string | null;
  createdAt: string;
}

export interface InsertStockpileRoast {
  attemptId?: number;
  targetName: string;
  targetType: string;
  tweetText: string;
  angle?: string;
  qualityScore: number;
  evaluatorOutput?: string;
  researchNotes?: string;
  freshnessType: FreshnessType;
  expiresAt?: string;
}

// --- Evaluation ---

export type JudgePersona = 'ct_degen' | 'comedy_writer' | 'data_hawk' | 'brand_guardian';

export interface EvaluationScores {
  savage: number;
  factual: number;
  funny: number;
  original: number;
  shareable: number;
  crypto_native: number;
  degen: number;
  timely: number;
}

export interface EvaluationResult {
  reasoning: string;
  scores: EvaluationScores;
  composite: number;
  verdict: 'stockpile' | 'discard';
  one_line_why: string;
}

export interface JudgeEvaluation {
  persona: JudgePersona;
  result: EvaluationResult;
}

// --- Mutation ---

export type MutationType = 'constraint' | 'voice' | 'perspective' | 'wildcard';

export interface Mutation {
  id: string;
  type: MutationType;
  text: string;
}

// --- Stats ---

export interface FarmStats {
  targets: { total: number; pending: number; completed: number };
  attempts: { total: number; evaluated: number; promoted: number; avgScore: number | null };
  stockpile: { total: number; available: number; served: number; expired: number; avgScore: number | null };
  topTargets: Array<{ name: string; stockpileCount: number; avgScore: number }>;
}

// --- Sync (NDJSON) ---

export interface StockpileExportRow {
  target_name: string;
  target_type: string;
  tweet_text: string;
  angle: string | null;
  quality_score: number;
  evaluator_output: string | null;
  research_notes: string | null;
  freshness_type: FreshnessType;
  expires_at: string | null;
}

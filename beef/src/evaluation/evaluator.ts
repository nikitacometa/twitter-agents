import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { EvaluationResult, EvaluationScores, JudgeEvaluation } from './types.js';
import {
  pickJudges,
  buildEvaluationPrompt,
  parseEvaluationOutput,
} from './judge-personas.js';
import type { JudgePersonaConfig } from './judge-personas.js';
import { getErrorMessage } from '@common/utils/error.util.js';

// ---------------------------------------------------------------------------
// Weighted scoring — FUNNY is king, TIMELY is tiebreaker
// ---------------------------------------------------------------------------

// Weights recalibrated from human review (March 2026, 33 rated roasts).
// Key finding: humans rate primarily on humor impact and shareability.
// AI was overweighting factual/analytical quality vs. comedy.
export const DIMENSION_WEIGHTS: Record<keyof EvaluationScores, number> = {
  funny: 0.30,
  shareable: 0.20,
  savage: 0.15,
  original: 0.10,
  degen: 0.10,
  timely: 0.05,
  factual: 0.05,
  crypto_native: 0.05,
};

export function calculateWeightedComposite(scores: EvaluationScores): number {
  let sum = 0;
  for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS)) {
    sum += (scores[dim as keyof EvaluationScores] ?? 0) * weight;
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Hard vetoes — FUNNY uses majority-based consensus, not single-judge
// ---------------------------------------------------------------------------

/**
 * Per-judge safety checks. Returns a veto reason string or null.
 *
 * FUNNY < 2 is intentionally excluded here — it uses majority-based consensus
 * instead (see checkFunnyConsensusVeto). Single-judge FUNNY veto was producing
 * false positives on deadpan roasts that other judges scored high.
 */
export function checkHardVetoes(scores: EvaluationScores): string | null {
  if (scores.factual < 2) return 'FACTUAL < 2 (invented claims)';
  if (scores.original < 2) return 'ORIGINAL < 2 (completely generic)';
  if (scores.degen < 1) return 'DEGEN < 1 (zero brand voice)';
  return null;
}

/**
 * Consensus FUNNY veto: fires when a majority of judges score FUNNY < 2.
 * In 5-judge mode: 3+ judges. In 3-judge mode: 2+ judges.
 */
export function checkFunnyConsensusVeto(
  results: JudgeEvaluation[],
): string | null {
  const lowFunnyCount = results.filter((r) => r.result.scores.funny < 2).length;
  const majorityThreshold = Math.ceil(results.length / 2) + 1;
  if (lowFunnyCount >= majorityThreshold) {
    return `FUNNY_CONSENSUS: ${String(lowFunnyCount)}/${String(results.length)} judges scored FUNNY < 2`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pre-filter — reject before expensive LLM calls
// ---------------------------------------------------------------------------

export interface PreFilterResult {
  pass: boolean;
  reason?: string;
}

const GENERIC_PATTERNS = [
  /this is fine/i,
  /probably nothing/i,
  /few understand/i,
  /most .+ could never/i,
  /that's not .+, that's .+/i,
];

const TELEGRAPHED_PATTERNS = [
  /i want to frame this/i,
  /you have to respect the/i,
  /i have nothing to add/i,
  /genuinely impressive/i,
  /^it's 20\d\d\b/i,
  /genuinely the most/i,
];

// Patterns that signal "too technical" — human reviewers consistently reject these
const TOO_TECHY_PATTERNS = [
  /\bERC-\d+\b.*\bfunctions?\b/i,
  /\bsetLawEnforcement/i,
  /\bwipeFrozen/i,
  /\bterms of service say\b.*\bcontractual IOU\b/i,
];

export function preFilter(tweetText: string): PreFilterResult {
  // 1. Sentence count > 3 → auto-reject (setup → context → punchline is fine)
  const sentences = tweetText.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length > 3) {
    return { pass: false, reason: `exceeds 3 sentences (${String(sentences.length)} found)` };
  }

  // 2. Character count > 280 → auto-reject
  if (tweetText.length > 280) {
    return { pass: false, reason: `exceeds 280 chars (${String(tweetText.length)})` };
  }

  // 3. Generic punchline patterns → auto-reject
  for (const p of GENERIC_PATTERNS) {
    if (p.test(tweetText)) {
      return { pass: false, reason: `generic pattern: ${p.source}` };
    }
  }

  // 4. Telegraphed punchline patterns → auto-reject
  for (const p of TELEGRAPHED_PATTERNS) {
    if (p.test(tweetText)) {
      return { pass: false, reason: `telegraphed pattern: ${p.source}` };
    }
  }

  // 5. Too technical — human reviewers reject legalistic/contract-level detail
  for (const p of TOO_TECHY_PATTERNS) {
    if (p.test(tweetText)) {
      return { pass: false, reason: `too technical for CT audience: ${p.source}` };
    }
  }

  // 6. Truncation detection — catch sentences cut off mid-thought
  // Only flag obvious mid-sentence breaks, not missing final punctuation (CT style)
  const trimmed = tweetText.trim();
  if (/\b(the|a|an|of|in|for|to|and|but|or|with|that|is|was|are|were)\s*$/i.test(trimmed)) {
    return { pass: false, reason: 'truncated: ends mid-sentence on a function word' };
  }

  return { pass: true };
}

// ---------------------------------------------------------------------------
// EvaluateInput / EvaluationOutput
// ---------------------------------------------------------------------------

export interface EvaluateInput {
  id: number | string;
  targetName: string;
  tweetText: string;
  researchNotes: string | null;
}

export interface EvaluationOutput {
  id: number | string;
  compositeScore: number;
  judgeVariance: number;
  evaluations: JudgeEvaluation[];
  verdict: 'stockpile' | 'discard';
  vetoReasons?: string[];
  preFilterReason?: string;
}

// ---------------------------------------------------------------------------
// RoastEvaluator — shared evaluator for farm pipeline and RoastEngine
// ---------------------------------------------------------------------------

export class RoastEvaluator {
  private readonly provider: ProviderManager;
  private readonly logger: Logger;
  private readonly threshold: number;
  private readonly mode: 'quick' | 'serious';

  constructor(opts: {
    provider: ProviderManager;
    logger: Logger;
    threshold?: number;
    mode?: 'quick' | 'serious';
  }) {
    this.provider = opts.provider;
    this.logger = opts.logger;
    this.threshold = opts.threshold ?? 3.5;
    this.mode = opts.mode ?? 'serious';
  }

  async evaluate(input: EvaluateInput): Promise<EvaluationOutput> {
    // Pre-filter: reject before expensive LLM calls
    const preCheck = preFilter(input.tweetText);
    if (!preCheck.pass) {
      this.logger.info(
        { id: input.id, reason: preCheck.reason, target: input.targetName },
        'Pre-filtered: skipping LLM evaluation',
      );
      return {
        id: input.id,
        compositeScore: 0,
        judgeVariance: 0,
        evaluations: [],
        verdict: 'discard',
        preFilterReason: preCheck.reason,
      };
    }

    // Mode: 'quick' uses only deflation_hawk; 'serious' uses all 5 judges
    const allJudges = pickJudges();
    const judges = this.mode === 'quick'
      ? allJudges.filter((j) => j.id === 'deflation_hawk')
      : allJudges;

    this.logger.info(
      { id: input.id, mode: this.mode, judges: judges.map((j) => j.id), target: input.targetName },
      'Evaluating roast with judge panel',
    );

    const settled = await Promise.allSettled(
      judges.map((judge) => this.runSingleJudge(judge, input)),
    );

    const results: JudgeEvaluation[] = [];
    for (let i = 0; i < settled.length; i++) {
      const evaluation = settled[i]!;
      const judge = judges[i]!;
      if (evaluation.status === 'fulfilled') {
        results.push({ persona: judge.id, result: evaluation.value });
      } else {
        this.logger.warn(
          { id: input.id, judge: judge.id, err: evaluation.reason },
          'Judge evaluation failed',
        );
      }
    }

    if (results.length === 0) {
      throw new Error(`All judges failed for roast ${String(input.id)}`);
    }

    // Weighted composite per judge, then average across judges
    const composites = results.map((r) => calculateWeightedComposite(r.result.scores));
    const avgComposite = composites.reduce((a, b) => a + b, 0) / composites.length;
    const roundedScore = Math.round(avgComposite * 10) / 10;

    // Inter-judge variance (standard deviation of composites)
    const variance = composites.length > 1
      ? Math.sqrt(composites.reduce((sum, c) => sum + (c - avgComposite) ** 2, 0) / composites.length)
      : 0;
    const roundedVariance = Math.round(variance * 100) / 100;

    // Hard vetoes: per-judge safety checks (FACTUAL, ORIGINAL, DEGEN)
    const vetoReasons: string[] = [];
    for (const r of results) {
      const veto = checkHardVetoes(r.result.scores);
      if (veto) vetoReasons.push(`${r.persona}: ${veto}`);
    }

    // FUNNY consensus veto: majority of judges score FUNNY < 2
    const funnyVeto = checkFunnyConsensusVeto(results);
    if (funnyVeto) vetoReasons.push(funnyVeto);

    // Composite consensus veto: majority of judges score composite < 3.0
    const lowJudgeCount = composites.filter((c) => Math.round(c * 10) / 10 < 3.0).length;
    const majorityThreshold = Math.ceil(results.length / 2);
    if (lowJudgeCount >= majorityThreshold) {
      vetoReasons.push(`CONSENSUS: ${String(lowJudgeCount)}/${String(results.length)} judges scored < 3.0`);
    }

    const verdict = vetoReasons.length > 0
      ? 'discard'
      : roundedScore >= this.threshold
        ? 'stockpile'
        : 'discard';

    if (vetoReasons.length > 0) {
      this.logger.info(
        { id: input.id, target: input.targetName, vetoReasons },
        'Hard veto triggered',
      );
    }

    this.logger.info(
      {
        id: input.id,
        target: input.targetName,
        compositeScore: roundedScore,
        judgeVariance: roundedVariance,
        verdict,
        judgeScores: results.map((r) => ({
          judge: r.persona,
          weighted: Math.round(calculateWeightedComposite(r.result.scores) * 10) / 10,
          scores: r.result.scores,
        })),
      },
      'Evaluation complete',
    );

    return {
      id: input.id,
      compositeScore: roundedScore,
      judgeVariance: roundedVariance,
      evaluations: results,
      verdict,
      vetoReasons: vetoReasons.length > 0 ? vetoReasons : undefined,
    };
  }

  async evaluateBatch(
    inputs: EvaluateInput[],
    concurrency = 3,
  ): Promise<EvaluationOutput[]> {
    const results: EvaluationOutput[] = [];

    for (let i = 0; i < inputs.length; i += concurrency) {
      const chunk = inputs.slice(i, i + concurrency);
      const chunkResults = await Promise.allSettled(
        chunk.map((input) => this.evaluate(input)),
      );

      for (let j = 0; j < chunkResults.length; j++) {
        const result = chunkResults[j]!;
        const input = chunk[j]!;
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          this.logger.error(
            { id: input.id, err: result.reason },
            'Failed to evaluate roast',
          );
        }
      }
    }

    return results;
  }

  private async runSingleJudge(
    judge: JudgePersonaConfig,
    input: EvaluateInput,
  ): Promise<EvaluationResult> {
    const prompt = buildEvaluationPrompt(
      judge,
      input.targetName,
      input.tweetText,
      input.researchNotes,
    );

    const taskId = `eval-${String(input.id)}-${judge.id}`;

    try {
      const result = await this.provider.run<{ text: string }>(taskId, {
        prompt,
        profile: 'farm-evaluate',
        requiresResearch: false,
      });

      // Provider returns the raw LLM text — extract JSON from it
      const rawText = typeof result.data === 'string'
        ? result.data
        : (result.data as Record<string, unknown>)['text'] as string
          ?? JSON.stringify(result.data);

      return parseEvaluationOutput(rawText);
    } catch (error) {
      this.logger.error(
        { taskId, judge: judge.id, id: input.id, err: error },
        `Judge ${judge.name} failed: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }
}

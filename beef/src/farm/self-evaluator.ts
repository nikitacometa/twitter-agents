import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { FarmAttempt, EvaluationResult, EvaluationScores, JudgeEvaluation } from './types.js';
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

const DIMENSION_WEIGHTS: Record<keyof EvaluationScores, number> = {
  funny: 0.20,
  savage: 0.15,
  shareable: 0.15,
  original: 0.15,
  degen: 0.15,
  factual: 0.10,
  crypto_native: 0.05,
  timely: 0.05,
};

export function calculateWeightedComposite(scores: EvaluationScores): number {
  let sum = 0;
  for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS)) {
    sum += (scores[dim as keyof EvaluationScores] ?? 0) * weight;
  }
  return sum;
}

function checkHardVetoes(scores: EvaluationScores): string | null {
  if (scores.factual < 2) return 'FACTUAL < 2 (invented claims)';
  if (scores.funny < 2) return 'FUNNY < 2 (not a roast, just commentary)';
  if (scores.original < 2) return 'ORIGINAL < 2 (completely generic)';
  if (scores.degen < 1) return 'DEGEN < 1 (zero brand voice)';
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

  return { pass: true };
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export interface EvaluationOutput {
  attemptId: number;
  compositeScore: number;
  judgeVariance: number;
  evaluations: JudgeEvaluation[];
  verdict: 'stockpile' | 'discard';
  vetoReasons?: string[];
  preFilterReason?: string;
}

export class SelfEvaluator {
  private readonly provider: ProviderManager;
  private readonly logger: Logger;
  private readonly threshold: number;

  constructor(opts: {
    provider: ProviderManager;
    logger: Logger;
    threshold?: number;
  }) {
    this.provider = opts.provider;
    this.logger = opts.logger;
    this.threshold = opts.threshold ?? 3.5;
  }

  async evaluate(attempt: FarmAttempt): Promise<EvaluationOutput> {
    // Pre-filter: reject before expensive LLM calls
    const preCheck = preFilter(attempt.tweetText);
    if (!preCheck.pass) {
      this.logger.info(
        { attemptId: attempt.id, reason: preCheck.reason, target: attempt.targetName },
        'Pre-filtered: skipping LLM evaluation',
      );
      return {
        attemptId: attempt.id,
        compositeScore: 0,
        judgeVariance: 0,
        evaluations: [],
        verdict: 'discard',
        preFilterReason: preCheck.reason,
      };
    }

    // Use all 5 judges to eliminate complementary bias
    const judges = pickJudges();
    this.logger.info(
      { attemptId: attempt.id, judges: judges.map((j) => j.id), target: attempt.targetName },
      'Evaluating attempt with judge panel',
    );

    const evaluations = await Promise.allSettled(
      judges.map((judge) => this.runSingleJudge(judge, attempt)),
    );

    const results: JudgeEvaluation[] = [];
    for (let i = 0; i < evaluations.length; i++) {
      const evaluation = evaluations[i]!;
      const judge = judges[i]!;
      if (evaluation.status === 'fulfilled') {
        results.push({ persona: judge.id, result: evaluation.value });
      } else {
        this.logger.warn(
          { attemptId: attempt.id, judge: judge.id, err: evaluation.reason },
          'Judge evaluation failed',
        );
      }
    }

    if (results.length === 0) {
      throw new Error(`All judges failed for attempt ${String(attempt.id)}`);
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

    // Hard vetoes: if ANY judge flags a critical dimension, auto-discard
    const vetoReasons: string[] = [];
    for (const r of results) {
      const veto = checkHardVetoes(r.result.scores);
      if (veto) vetoReasons.push(`${r.persona}: ${veto}`);
    }

    // Consensus veto: if majority of judges give composite < 3.0, auto-discard
    const lowJudgeCount = composites.filter((c) => c < 3.0).length;
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
        { attemptId: attempt.id, target: attempt.targetName, vetoReasons },
        'Hard veto triggered',
      );
    }

    this.logger.info(
      {
        attemptId: attempt.id,
        target: attempt.targetName,
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
      attemptId: attempt.id,
      compositeScore: roundedScore,
      judgeVariance: roundedVariance,
      evaluations: results,
      verdict,
      vetoReasons: vetoReasons.length > 0 ? vetoReasons : undefined,
    };
  }

  async evaluateBatch(
    attempts: FarmAttempt[],
    concurrency = 3,
  ): Promise<EvaluationOutput[]> {
    const results: EvaluationOutput[] = [];

    // Process in chunks to respect concurrency
    for (let i = 0; i < attempts.length; i += concurrency) {
      const chunk = attempts.slice(i, i + concurrency);
      const chunkResults = await Promise.allSettled(
        chunk.map((attempt) => this.evaluate(attempt)),
      );

      for (let j = 0; j < chunkResults.length; j++) {
        const result = chunkResults[j]!;
        const attempt = chunk[j]!;
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          this.logger.error(
            { attemptId: attempt.id, err: result.reason },
            'Failed to evaluate attempt',
          );
        }
      }
    }

    return results;
  }

  private async runSingleJudge(
    judge: JudgePersonaConfig,
    attempt: FarmAttempt,
  ): Promise<EvaluationResult> {
    const prompt = buildEvaluationPrompt(
      judge,
      attempt.targetName,
      attempt.tweetText,
      attempt.researchNotes,
    );

    const taskId = `farm-eval-${String(attempt.id)}-${judge.id}`;

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
        { taskId, judge: judge.id, attemptId: attempt.id, err: error },
        `Judge ${judge.name} failed: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }
}

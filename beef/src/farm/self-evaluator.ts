import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { FarmAttempt, EvaluationResult, EvaluationScores, JudgeEvaluation } from './types.js';
import {
  pickJudges,
  buildEvaluationPrompt,
  parseEvaluationOutput,
} from './judge-personas.js';
import type { JudgePersonaConfig } from './judge-personas.js';
import {
  calculateWeightedComposite,
  preFilter,
} from '@evaluation/evaluator.js';
import { getErrorMessage } from '@common/utils/error.util.js';

export { calculateWeightedComposite, preFilter };
export type { PreFilterResult } from '@evaluation/evaluator.js';

// ---------------------------------------------------------------------------
// Hard vetoes — original single-judge logic preserved for backward compatibility.
// New code should use RoastEvaluator from @evaluation/evaluator.js which has
// majority-based FUNNY veto (fixes false positives on deadpan roasts).
// ---------------------------------------------------------------------------

function checkHardVetoes(scores: EvaluationScores): string | null {
  if (scores.factual < 2) return 'FACTUAL < 2 (invented claims)';
  if (scores.funny < 2) return 'FUNNY < 2 (not a roast, just commentary)';
  if (scores.original < 2) return 'ORIGINAL < 2 (completely generic)';
  if (scores.degen < 1) return 'DEGEN < 1 (zero brand voice)';
  return null;
}

// ---------------------------------------------------------------------------
// EvaluationOutput — farm-specific shape with attemptId
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

// ---------------------------------------------------------------------------
// SelfEvaluator — farm pipeline evaluator, wraps shared utilities
// ---------------------------------------------------------------------------

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
    // Round to 1 decimal first to avoid floating-point edge cases (e.g. 2.9999... < 3.0)
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

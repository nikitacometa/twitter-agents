import type { Logger } from 'pino';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { FarmAttempt, EvaluationResult, JudgeEvaluation } from './types.js';
import {
  pickJudgePair,
  buildEvaluationPrompt,
  parseEvaluationOutput,
} from './judge-personas.js';
import type { JudgePersonaConfig } from './judge-personas.js';
import { getErrorMessage } from '@common/utils/error.util.js';

export interface EvaluationOutput {
  attemptId: number;
  compositeScore: number;
  evaluations: JudgeEvaluation[];
  verdict: 'stockpile' | 'discard';
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
    this.threshold = opts.threshold ?? 4.0;
  }

  async evaluate(attempt: FarmAttempt): Promise<EvaluationOutput> {
    const [judge1, judge2] = pickJudgePair();
    this.logger.info(
      { attemptId: attempt.id, judges: [judge1.id, judge2.id], target: attempt.targetName },
      'Evaluating attempt with judge pair',
    );

    const evaluations = await Promise.allSettled([
      this.runSingleJudge(judge1, attempt),
      this.runSingleJudge(judge2, attempt),
    ]);

    const results: JudgeEvaluation[] = [];
    for (let i = 0; i < evaluations.length; i++) {
      const evaluation = evaluations[i]!;
      const judge = i === 0 ? judge1 : judge2;
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

    const compositeScore = results.reduce((sum, r) => sum + r.result.composite, 0) / results.length;
    const roundedScore = Math.round(compositeScore * 10) / 10;
    const verdict = roundedScore >= this.threshold ? 'stockpile' : 'discard';

    this.logger.info(
      {
        attemptId: attempt.id,
        target: attempt.targetName,
        compositeScore: roundedScore,
        verdict,
        judgeScores: results.map((r) => ({ judge: r.persona, score: r.result.composite })),
      },
      'Evaluation complete',
    );

    return {
      attemptId: attempt.id,
      compositeScore: roundedScore,
      evaluations: results,
      verdict,
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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelfEvaluator } from './self-evaluator.js';
import type { FarmAttempt } from './types.js';
import type { ProviderManager } from '@agent/provider-manager.js';
import type { Logger } from 'pino';

function makeAttempt(overrides: Partial<FarmAttempt> = {}): FarmAttempt {
  return {
    id: 1,
    targetName: 'Uniswap',
    targetType: 'project',
    tweetText: 'uniswap governance spent $11M to watch bots frontrun every swap',
    angle: 'DATA_BOMB',
    strategy: 'rubric',
    mutationSeed: null,
    llmSelfScore: null,
    evaluatorScore: null,
    evaluatorOutput: null,
    researchNotes: 'TVL data from DefiLlama',
    factCheckPassed: true,
    agentOutput: null,
    promoted: false,
    createdAt: '2026-03-19T00:00:00Z',
    ...overrides,
  };
}

function makeValidEvalJson(composite: number, verdict: 'stockpile' | 'discard'): string {
  return JSON.stringify({
    reasoning: 'Test evaluation',
    scores: { savage: 4, factual: 4, funny: 4, original: 4, shareable: 4, crypto_native: 4 },
    composite,
    verdict,
    one_line_why: 'Test reason',
  });
}

function createMockProvider(responses: Array<{ text: string } | Error>): ProviderManager {
  let callIndex = 0;
  return {
    run: vi.fn().mockImplementation(() => {
      const response = responses[callIndex++];
      if (response instanceof Error) {
        return Promise.reject(response);
      }
      return Promise.resolve({
        data: response,
        durationMs: 100,
        provider: 'claude-code' as const,
      });
    }),
  } as unknown as ProviderManager;
}

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

describe('SelfEvaluator', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('evaluate', () => {
    it('returns composite score averaged from two judges', async () => {
      const provider = createMockProvider([
        { text: makeValidEvalJson(4.5, 'stockpile') },
        { text: makeValidEvalJson(3.5, 'discard') },
      ]);

      const evaluator = new SelfEvaluator({ provider, logger });
      const result = await evaluator.evaluate(makeAttempt());

      expect(result.compositeScore).toBe(4.0);
      expect(result.evaluations).toHaveLength(2);
    });

    it('returns stockpile verdict when composite >= threshold', async () => {
      const provider = createMockProvider([
        { text: makeValidEvalJson(4.5, 'stockpile') },
        { text: makeValidEvalJson(4.0, 'stockpile') },
      ]);

      const evaluator = new SelfEvaluator({ provider, logger, threshold: 4.0 });
      const result = await evaluator.evaluate(makeAttempt());

      expect(result.verdict).toBe('stockpile');
      expect(result.compositeScore).toBeGreaterThanOrEqual(4.0);
    });

    it('returns discard verdict when composite < threshold', async () => {
      const provider = createMockProvider([
        { text: makeValidEvalJson(3.0, 'discard') },
        { text: makeValidEvalJson(3.5, 'discard') },
      ]);

      const evaluator = new SelfEvaluator({ provider, logger, threshold: 4.0 });
      const result = await evaluator.evaluate(makeAttempt());

      expect(result.verdict).toBe('discard');
    });

    it('uses custom threshold', async () => {
      const provider = createMockProvider([
        { text: makeValidEvalJson(3.5, 'discard') },
        { text: makeValidEvalJson(3.5, 'discard') },
      ]);

      const evaluator = new SelfEvaluator({ provider, logger, threshold: 3.0 });
      const result = await evaluator.evaluate(makeAttempt());

      // 3.5 >= 3.0 → stockpile (evaluator uses its own threshold, not the LLM's verdict)
      expect(result.verdict).toBe('stockpile');
    });

    it('succeeds when one judge fails and one succeeds', async () => {
      const provider = createMockProvider([
        { text: makeValidEvalJson(4.2, 'stockpile') },
        new Error('Judge 2 timeout'),
      ]);

      const evaluator = new SelfEvaluator({ provider, logger });
      const result = await evaluator.evaluate(makeAttempt());

      expect(result.evaluations).toHaveLength(1);
      expect(result.compositeScore).toBe(4.2);
    });

    it('throws when all judges fail', async () => {
      const provider = createMockProvider([
        new Error('Judge 1 timeout'),
        new Error('Judge 2 timeout'),
      ]);

      const evaluator = new SelfEvaluator({ provider, logger });
      await expect(evaluator.evaluate(makeAttempt())).rejects.toThrow('All judges failed');
    });

    it('calls provider with farm-evaluate profile', async () => {
      const provider = createMockProvider([
        { text: makeValidEvalJson(4.0, 'stockpile') },
        { text: makeValidEvalJson(4.0, 'stockpile') },
      ]);

      const evaluator = new SelfEvaluator({ provider, logger });
      await evaluator.evaluate(makeAttempt());

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const runMock = vi.mocked(provider.run);
      expect(runMock).toHaveBeenCalledTimes(2);
      const firstCall = runMock.mock.calls[0]!;
      expect(firstCall[0]).toMatch(/^farm-eval-1-/);
      expect(firstCall[1]).toMatchObject({
        profile: 'farm-evaluate',
        requiresResearch: false,
      });
    });

    it('sets correct attemptId in output', async () => {
      const provider = createMockProvider([
        { text: makeValidEvalJson(4.0, 'stockpile') },
        { text: makeValidEvalJson(4.0, 'stockpile') },
      ]);

      const evaluator = new SelfEvaluator({ provider, logger });
      const result = await evaluator.evaluate(makeAttempt({ id: 42 }));

      expect(result.attemptId).toBe(42);
    });

    it('rounds composite score to 1 decimal', async () => {
      const provider = createMockProvider([
        { text: makeValidEvalJson(4.33, 'stockpile') },
        { text: makeValidEvalJson(4.17, 'stockpile') },
      ]);

      const evaluator = new SelfEvaluator({ provider, logger });
      const result = await evaluator.evaluate(makeAttempt());

      // (4.33 + 4.17) / 2 = 4.25 → rounded to 4.3
      expect(result.compositeScore).toBe(4.3);
    });

    it('handles provider returning raw string data', async () => {
      // Provider might return a plain string instead of { text: string }
      const provider = {
        run: vi.fn()
          .mockResolvedValueOnce({
            data: makeValidEvalJson(4.0, 'stockpile'),
            durationMs: 100,
            provider: 'claude-code',
          })
          .mockResolvedValueOnce({
            data: makeValidEvalJson(4.0, 'stockpile'),
            durationMs: 100,
            provider: 'claude-code',
          }),
      } as unknown as ProviderManager;

      const evaluator = new SelfEvaluator({ provider, logger });
      const result = await evaluator.evaluate(makeAttempt());

      expect(result.compositeScore).toBe(4.0);
    });
  });

  describe('evaluateBatch', () => {
    it('evaluates all attempts in batch', async () => {
      const provider = createMockProvider([
        { text: makeValidEvalJson(4.0, 'stockpile') },
        { text: makeValidEvalJson(4.0, 'stockpile') },
        { text: makeValidEvalJson(3.0, 'discard') },
        { text: makeValidEvalJson(3.0, 'discard') },
      ]);

      const evaluator = new SelfEvaluator({ provider, logger });
      const results = await evaluator.evaluateBatch([
        makeAttempt({ id: 1 }),
        makeAttempt({ id: 2 }),
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]!.attemptId).toBe(1);
      expect(results[1]!.attemptId).toBe(2);
    });

    it('respects concurrency limit', async () => {
      let maxConcurrent = 0;
      let current = 0;

      const provider = {
        run: vi.fn().mockImplementation(async () => {
          current++;
          maxConcurrent = Math.max(maxConcurrent, current);
          await new Promise((r) => setTimeout(r, 10));
          current--;
          return {
            data: { text: makeValidEvalJson(4.0, 'stockpile') },
            durationMs: 100,
            provider: 'claude-code',
          };
        }),
      } as unknown as ProviderManager;

      const evaluator = new SelfEvaluator({ provider, logger });
      const attempts = Array.from({ length: 6 }, (_, i) => makeAttempt({ id: i + 1 }));
      await evaluator.evaluateBatch(attempts, 2);

      // With concurrency=2 and 2 judge calls each, we expect chunks of 2 attempts
      // Each attempt spawns 2 parallel judge calls = max 4 concurrent provider.run calls
      expect(maxConcurrent).toBeLessThanOrEqual(4);
    });

    it('continues batch when individual evaluation fails', async () => {
      let callCount = 0;
      const provider = {
        run: vi.fn().mockImplementation(() => {
          callCount++;
          // First attempt's judges both fail, second attempt succeeds
          if (callCount <= 2) {
            return Promise.reject(new Error('timeout'));
          }
          return Promise.resolve({
            data: { text: makeValidEvalJson(4.0, 'stockpile') },
            durationMs: 100,
            provider: 'claude-code',
          });
        }),
      } as unknown as ProviderManager;

      const evaluator = new SelfEvaluator({ provider, logger });
      const results = await evaluator.evaluateBatch([
        makeAttempt({ id: 1 }),
        makeAttempt({ id: 2 }),
      ], 1);

      // First attempt fails (all judges error), second succeeds
      expect(results).toHaveLength(1);
      expect(results[0]!.attemptId).toBe(2);
    });

    it('returns empty array when all attempts fail', async () => {
      const provider = createMockProvider([
        new Error('fail 1'),
        new Error('fail 2'),
        new Error('fail 3'),
        new Error('fail 4'),
      ]);

      const evaluator = new SelfEvaluator({ provider, logger });
      const results = await evaluator.evaluateBatch([
        makeAttempt({ id: 1 }),
        makeAttempt({ id: 2 }),
      ]);

      expect(results).toHaveLength(0);
    });

    it('returns empty array for empty input', async () => {
      const provider = createMockProvider([]);
      const evaluator = new SelfEvaluator({ provider, logger });
      const results = await evaluator.evaluateBatch([]);
      expect(results).toHaveLength(0);
    });
  });
});

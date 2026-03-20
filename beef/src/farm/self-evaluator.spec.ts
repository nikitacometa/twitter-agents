import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelfEvaluator, preFilter, calculateWeightedComposite } from './self-evaluator.js';
import type { FarmAttempt, EvaluationScores } from './types.js';
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

function makeEvalJson(scoreOverrides?: Partial<EvaluationScores>): string {
  return JSON.stringify({
    reasoning: 'Test evaluation',
    scores: {
      savage: 4, factual: 4, funny: 4, original: 4,
      shareable: 4, crypto_native: 4, degen: 4, timely: 4,
      ...scoreOverrides,
    },
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
    it('returns weighted composite averaged from three judges', async () => {
      // Judge 1 & 2: all 4s → weighted 4.0 each
      // Judge 3: funny=5, savage=5 → weighted 4.35
      // Average = (4.0 + 4.0 + 4.35) / 3 = 4.1166... → rounded 4.1
      const provider = createMockProvider([
        { text: makeEvalJson() },
        { text: makeEvalJson() },
        { text: makeEvalJson({ funny: 5, savage: 5 }) },
      ]);

      const evaluator = new SelfEvaluator({ provider, logger });
      const result = await evaluator.evaluate(makeAttempt());

      expect(result.compositeScore).toBe(4.1);
      expect(result.evaluations).toHaveLength(3);
    });

    it('returns stockpile verdict when composite >= threshold', async () => {
      // All judges: funny=5, rest 4 → weighted 4.2 each → avg 4.2 >= 4.0
      const provider = createMockProvider([
        { text: makeEvalJson({ funny: 5 }) },
        { text: makeEvalJson({ funny: 5 }) },
        { text: makeEvalJson({ funny: 5 }) },
      ]);

      const evaluator = new SelfEvaluator({ provider, logger, threshold: 4.0 });
      const result = await evaluator.evaluate(makeAttempt());

      expect(result.verdict).toBe('stockpile');
      expect(result.compositeScore).toBeGreaterThanOrEqual(4.0);
    });

    it('returns discard verdict when composite < threshold', async () => {
      // All judges: funny=2, savage=2, original=2, rest 4 → weighted 3.0 < 4.0
      const provider = createMockProvider([
        { text: makeEvalJson({ funny: 2, savage: 2, original: 2 }) },
        { text: makeEvalJson({ funny: 2, savage: 2, original: 2 }) },
        { text: makeEvalJson({ funny: 2, savage: 2, original: 2 }) },
      ]);

      const evaluator = new SelfEvaluator({ provider, logger, threshold: 4.0 });
      const result = await evaluator.evaluate(makeAttempt());

      expect(result.verdict).toBe('discard');
    });

    it('uses custom threshold', async () => {
      // All scores 3 → weighted 3.0 >= 2.5 → stockpile
      const allThrees = { savage: 3, factual: 3, funny: 3, original: 3, shareable: 3, crypto_native: 3, degen: 3, timely: 3 } as const;
      const provider = createMockProvider([
        { text: makeEvalJson(allThrees) },
        { text: makeEvalJson(allThrees) },
        { text: makeEvalJson(allThrees) },
      ]);

      const evaluator = new SelfEvaluator({ provider, logger, threshold: 2.5 });
      const result = await evaluator.evaluate(makeAttempt());

      expect(result.verdict).toBe('stockpile');
    });

    it('succeeds when one judge fails and two succeed', async () => {
      const provider = createMockProvider([
        { text: makeEvalJson() },
        new Error('Judge 2 timeout'),
        { text: makeEvalJson() },
      ]);

      const evaluator = new SelfEvaluator({ provider, logger });
      const result = await evaluator.evaluate(makeAttempt());

      expect(result.evaluations).toHaveLength(2);
      expect(result.compositeScore).toBe(4.0);
    });

    it('throws when all judges fail', async () => {
      const provider = createMockProvider([
        new Error('Judge 1 timeout'),
        new Error('Judge 2 timeout'),
        new Error('Judge 3 timeout'),
      ]);

      const evaluator = new SelfEvaluator({ provider, logger });
      await expect(evaluator.evaluate(makeAttempt())).rejects.toThrow('All judges failed');
    });

    it('calls provider with farm-evaluate profile for all 3 judges', async () => {
      const provider = createMockProvider([
        { text: makeEvalJson() },
        { text: makeEvalJson() },
        { text: makeEvalJson() },
      ]);

      const evaluator = new SelfEvaluator({ provider, logger });
      await evaluator.evaluate(makeAttempt());

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const runMock = vi.mocked(provider.run);
      expect(runMock).toHaveBeenCalledTimes(3);
      const firstCall = runMock.mock.calls[0]!;
      expect(firstCall[0]).toMatch(/^farm-eval-1-/);
      expect(firstCall[1]).toMatchObject({
        profile: 'farm-evaluate',
        requiresResearch: false,
      });
    });

    it('sets correct attemptId in output', async () => {
      const provider = createMockProvider([
        { text: makeEvalJson() },
        { text: makeEvalJson() },
        { text: makeEvalJson() },
      ]);

      const evaluator = new SelfEvaluator({ provider, logger });
      const result = await evaluator.evaluate(makeAttempt({ id: 42 }));

      expect(result.attemptId).toBe(42);
    });

    it('rounds composite score to 1 decimal', async () => {
      // Judge 1: funny=5, savage=5 → 4.35; Judges 2-3: all 4 → 4.0
      // Average = (4.35 + 4.0 + 4.0) / 3 = 4.1166... → 4.1
      const provider = createMockProvider([
        { text: makeEvalJson({ funny: 5, savage: 5 }) },
        { text: makeEvalJson() },
        { text: makeEvalJson() },
      ]);

      const evaluator = new SelfEvaluator({ provider, logger });
      const result = await evaluator.evaluate(makeAttempt());

      expect(result.compositeScore).toBe(4.1);
    });

    it('handles provider returning raw string data', async () => {
      const provider = {
        run: vi.fn()
          .mockResolvedValueOnce({
            data: makeEvalJson(),
            durationMs: 100,
            provider: 'claude-code',
          })
          .mockResolvedValueOnce({
            data: makeEvalJson(),
            durationMs: 100,
            provider: 'claude-code',
          })
          .mockResolvedValueOnce({
            data: makeEvalJson(),
            durationMs: 100,
            provider: 'claude-code',
          }),
      } as unknown as ProviderManager;

      const evaluator = new SelfEvaluator({ provider, logger });
      const result = await evaluator.evaluate(makeAttempt());

      expect(result.compositeScore).toBe(4.0);
    });

    it('triggers hard veto when factual < 2', async () => {
      const provider = createMockProvider([
        { text: makeEvalJson({ factual: 1 }) },
        { text: makeEvalJson() },
        { text: makeEvalJson() },
      ]);

      const evaluator = new SelfEvaluator({ provider, logger });
      const result = await evaluator.evaluate(makeAttempt());

      expect(result.verdict).toBe('discard');
      expect(result.vetoReasons).toBeDefined();
      expect(result.vetoReasons![0]).toContain('FACTUAL < 2');
    });

    it('triggers hard veto when funny < 2', async () => {
      const provider = createMockProvider([
        { text: makeEvalJson({ funny: 1 }) },
        { text: makeEvalJson() },
        { text: makeEvalJson() },
      ]);

      const evaluator = new SelfEvaluator({ provider, logger });
      const result = await evaluator.evaluate(makeAttempt());

      expect(result.verdict).toBe('discard');
      expect(result.vetoReasons).toBeDefined();
      expect(result.vetoReasons![0]).toContain('FUNNY < 2');
    });

    it('skips LLM evaluation when pre-filter rejects', async () => {
      const provider = createMockProvider([]);
      const evaluator = new SelfEvaluator({ provider, logger });
      const result = await evaluator.evaluate(makeAttempt({
        tweetText: 'First sentence. Second sentence. Third sentence. Fourth sentence.',
      }));

      expect(result.verdict).toBe('discard');
      expect(result.compositeScore).toBe(0);
      expect(result.evaluations).toHaveLength(0);
      expect(result.preFilterReason).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(vi.mocked(provider.run)).not.toHaveBeenCalled();
    });
  });

  describe('evaluateBatch', () => {
    it('evaluates all attempts in batch', async () => {
      const provider = createMockProvider([
        // Attempt 1: 3 judges
        { text: makeEvalJson() },
        { text: makeEvalJson() },
        { text: makeEvalJson() },
        // Attempt 2: 3 judges
        { text: makeEvalJson({ savage: 2, funny: 2 }) },
        { text: makeEvalJson({ savage: 2, funny: 2 }) },
        { text: makeEvalJson({ savage: 2, funny: 2 }) },
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
            data: { text: makeEvalJson() },
            durationMs: 100,
            provider: 'claude-code',
          };
        }),
      } as unknown as ProviderManager;

      const evaluator = new SelfEvaluator({ provider, logger });
      const attempts = Array.from({ length: 6 }, (_, i) => makeAttempt({ id: i + 1 }));
      await evaluator.evaluateBatch(attempts, 2);

      // With concurrency=2 and 3 judge calls each, max 6 concurrent provider.run calls
      expect(maxConcurrent).toBeLessThanOrEqual(6);
    });

    it('continues batch when individual evaluation fails', async () => {
      let callCount = 0;
      const provider = {
        run: vi.fn().mockImplementation(() => {
          callCount++;
          // First attempt's 3 judges all fail, second attempt's 3 succeed
          if (callCount <= 3) {
            return Promise.reject(new Error('timeout'));
          }
          return Promise.resolve({
            data: { text: makeEvalJson() },
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
        new Error('fail 1'), new Error('fail 2'), new Error('fail 3'),
        new Error('fail 4'), new Error('fail 5'), new Error('fail 6'),
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

describe('preFilter', () => {
  it('rejects tweets with more than 2 sentences', () => {
    const result = preFilter('First sentence. Second sentence. Third sentence.');
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('exceeds 2 sentences');
  });

  it('passes tweets with 2 or fewer sentences', () => {
    const result = preFilter('First sentence. Second sentence.');
    expect(result.pass).toBe(true);
  });

  it('rejects tweets over 280 characters', () => {
    const result = preFilter('a'.repeat(281));
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('exceeds 280 chars');
  });

  it.each([
    'this is fine for crypto',
    'probably nothing happening here',
    'few understand the implications',
    'most traders could never handle this',
    "that's not a bug, that's a feature",
  ])('rejects generic pattern: %s', (text) => {
    const result = preFilter(text);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('generic pattern');
  });

  it.each([
    'i want to frame this achievement',
    'you have to respect the hustle',
    'i have nothing to add here',
  ])('rejects telegraphed pattern: %s', (text) => {
    const result = preFilter(text);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('telegraphed pattern');
  });

  it('passes clean short tweets', () => {
    const result = preFilter('uniswap governance spent $11M watching bots frontrun swaps');
    expect(result.pass).toBe(true);
  });
});

describe('calculateWeightedComposite', () => {
  it('returns uniform score when all dimensions equal', () => {
    const scores: EvaluationScores = {
      savage: 4, factual: 4, funny: 4, original: 4,
      shareable: 4, crypto_native: 4, degen: 4, timely: 4,
    };
    expect(calculateWeightedComposite(scores)).toBe(4.0);
  });

  it('weights funny highest', () => {
    const base: EvaluationScores = {
      savage: 3, factual: 3, funny: 3, original: 3,
      shareable: 3, crypto_native: 3, degen: 3, timely: 3,
    };
    const withHighFunny = { ...base, funny: 5 };
    const withHighTimely = { ...base, timely: 5 };

    // funny weight 0.20 vs timely weight 0.05
    expect(calculateWeightedComposite(withHighFunny)).toBeGreaterThan(
      calculateWeightedComposite(withHighTimely),
    );
  });

  it('returns correct weighted value for mixed scores', () => {
    const scores: EvaluationScores = {
      funny: 5,         // 0.20 * 5 = 1.00
      savage: 4,        // 0.15 * 4 = 0.60
      shareable: 4,     // 0.15 * 4 = 0.60
      original: 3,      // 0.15 * 3 = 0.45
      factual: 3,       // 0.10 * 3 = 0.30
      crypto_native: 3, // 0.10 * 3 = 0.30
      degen: 2,         // 0.10 * 2 = 0.20
      timely: 1,        // 0.05 * 1 = 0.05
    };
    // Total = 3.50
    expect(calculateWeightedComposite(scores)).toBeCloseTo(3.5, 5);
  });
});

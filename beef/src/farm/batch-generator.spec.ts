import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase } from '@storage/database.js';
import { FarmAttemptRepository } from '@storage/repositories/farm-attempt.repository.js';
import { BatchGenerator } from './batch-generator.js';
import { StockpileRepository } from '@storage/repositories/stockpile.repository.js';
import type { ProviderManager } from '@agent/provider-manager.js';
import { logger } from '@common/utils/logger.js';

function makeMockProvider(
  variantTexts: string[] = ['test roast one', 'test roast two', 'test roast three'],
): ProviderManager {
  return {
    run: vi.fn().mockResolvedValue({
      data: {
        variants: variantTexts.map((text, i) => ({
          text,
          score: 4.0 - i * 0.3,
          angle: 'DATA_BOMB',
        })),
        bestIndex: 0,
        researchNotes: 'Some research notes',
        factCheckPassed: true,
      },
      durationMs: 100,
      provider: 'claude-code' as const,
    }),
  } as unknown as ProviderManager;
}

describe('BatchGenerator', () => {
  let tmpDir: string;
  let db: Database.Database;
  let farmAttempt: FarmAttemptRepository;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'beef-batch-gen-'));
    db = createDatabase(join(tmpDir, 'test.db'), logger);
    farmAttempt = new FarmAttemptRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates and stores attempts for a single target (all strategies)', async () => {
    const provider = makeMockProvider();
    const generator = new BatchGenerator({
      provider,
      farmAttempt,
      logger,
      variantsPerTarget: 3,
      mutationCount: 1,
    });

    const results = await generator.generateBatch([
      { name: 'TestProject', type: 'project' },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]!.targetName).toBe('TestProject');
    // 3 strategies × 3 variants = 9 stored
    expect(results[0]!.attempts).toBe(9);
    expect(results[0]!.filtered).toBe(0);
    expect(results[0]!.errors).toHaveLength(0);
    expect(results[0]!.strategies).toHaveLength(3);

    const stats = farmAttempt.getStats();
    expect(stats.total).toBe(9);
  });

  it('runs all 3 strategies per target', async () => {
    const provider = makeMockProvider(['strategy test']);
    const generator = new BatchGenerator({
      provider,
      farmAttempt,
      logger,
      variantsPerTarget: 1,
      mutationCount: 0,
    });

    const results = await generator.generateBatch([
      { name: 'T1', type: 'project' },
    ]);

    expect(results[0]!.strategies).toEqual(
      expect.arrayContaining(['rubric', 'persona', 'adversarial']),
    );
    expect(results[0]!.strategies).toHaveLength(3);

    // Provider called 3 times (once per strategy)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const runMock = vi.mocked(provider.run);
    expect(runMock).toHaveBeenCalledTimes(3);
  });

  it('applies mutations to each target', async () => {
    const provider = makeMockProvider();
    const generator = new BatchGenerator({
      provider,
      farmAttempt,
      logger,
      variantsPerTarget: 1,
      mutationCount: 2,
    });

    const results = await generator.generateBatch([
      { name: 'Mutated', type: 'token' },
    ]);

    // 3 strategies × 2 mutations each = 6 total
    expect(results[0]!.mutations).toHaveLength(6);

    // Check the prompt included mutation text
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const runMock = vi.mocked(provider.run);
    const promptArg = runMock.mock.calls[0]![1].prompt;
    expect(promptArg).toContain('FARM MUTATION');
  });

  it('filters content that fails content filter', async () => {
    const provider = makeMockProvider([
      'valid roast here',
      'kill yourself lmao', // banned word
      'another valid roast',
    ]);

    const generator = new BatchGenerator({
      provider,
      farmAttempt,
      logger,
      variantsPerTarget: 3,
      mutationCount: 0,
    });

    const results = await generator.generateBatch([
      { name: 'Filtered', type: 'project' },
    ]);

    // 3 strategies × (2 passed + 1 filtered) = 6 stored, 3 filtered
    expect(results[0]!.attempts).toBe(6);
    expect(results[0]!.filtered).toBe(3);
  });

  it('stores mutation seed in attempt', async () => {
    const provider = makeMockProvider(['stored mutation seed test']);
    const generator = new BatchGenerator({
      provider,
      farmAttempt,
      logger,
      variantsPerTarget: 1,
      mutationCount: 2,
    });

    await generator.generateBatch([{ name: 'Seeded', type: 'token' }]);

    const attempts = farmAttempt.getUnevaluated(10);
    // 3 strategies × 1 variant = 3 attempts
    expect(attempts).toHaveLength(3);
    expect(attempts[0]!.mutationSeed).toBeTruthy();
    expect(attempts[0]!.mutationSeed!.split(',').length).toBe(2);
  });

  it('stores freshness classification in agent output', async () => {
    const provider = makeMockProvider(['tvl dropped 94% since launch ser']);
    const generator = new BatchGenerator({
      provider,
      farmAttempt,
      logger,
      variantsPerTarget: 1,
      mutationCount: 0,
    });

    await generator.generateBatch([{ name: 'DataRoast', type: 'project' }]);

    const attempts = farmAttempt.getUnevaluated(10);
    // 3 strategies × 1 variant
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    expect(attempts[0]!.agentOutput).toBeTruthy();
    const meta = JSON.parse(attempts[0]!.agentOutput!) as { freshness: string };
    expect(meta.freshness).toBe('data_dependent');
  });

  it('handles provider failure gracefully', async () => {
    const provider = {
      run: vi.fn().mockRejectedValue(new Error('Provider timeout')),
    } as unknown as ProviderManager;

    const generator = new BatchGenerator({
      provider,
      farmAttempt,
      logger,
      variantsPerTarget: 1,
      mutationCount: 0,
    });

    const results = await generator.generateBatch([
      { name: 'Failing', type: 'project' },
    ]);

    expect(results).toHaveLength(1);
    // All 3 strategies fail → 3 error messages
    expect(results[0]!.errors).toHaveLength(3);
    expect(results[0]!.attempts).toBe(0);
  });

  it('continues other strategies when one fails for a target', async () => {
    let callCount = 0;
    const provider = {
      run: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('timeout'));
        return Promise.resolve({
          data: {
            variants: [{ text: 'success roast', score: 4.0, angle: 'DATA_BOMB' }],
            bestIndex: 0,
            researchNotes: null,
            factCheckPassed: true,
          },
          durationMs: 100,
          provider: 'claude-code',
        });
      }),
    } as unknown as ProviderManager;

    const generator = new BatchGenerator({
      provider,
      farmAttempt,
      logger,
      variantsPerTarget: 1,
      mutationCount: 0,
    });

    const results = await generator.generateBatch([
      { name: 'Partial', type: 'project' },
      { name: 'Success', type: 'project' },
    ], 1);

    expect(results).toHaveLength(2);
    // First target: 1 strategy fails, 2 succeed → 2 attempts, 1 error
    expect(results[0]!.errors.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.attempts).toBe(2);
    expect(results[0]!.strategies).toHaveLength(2);
    // Second target: all 3 strategies succeed → 3 attempts
    expect(results[1]!.attempts).toBe(3);
    expect(results[1]!.strategies).toHaveLength(3);
  });

  it('uses farm-generate profile', async () => {
    const provider = makeMockProvider(['profile test']);
    const generator = new BatchGenerator({
      provider,
      farmAttempt,
      logger,
      variantsPerTarget: 1,
      mutationCount: 0,
    });

    await generator.generateBatch([{ name: 'ProfileTest', type: 'project' }]);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const runMock = vi.mocked(provider.run);
    expect(runMock.mock.calls[0]![1].profile).toBe('farm-generate');
    expect(runMock.mock.calls[0]![1].requiresResearch).toBe(true);
  });

  it('parses string output from provider', async () => {
    const provider = {
      run: vi.fn().mockResolvedValue({
        data: JSON.stringify({
          variants: [{ text: 'string output test', score: 4.0, angle: 'DATA_BOMB' }],
          bestIndex: 0,
          researchNotes: null,
          factCheckPassed: true,
        }),
        durationMs: 100,
        provider: 'claude-code',
      }),
    } as unknown as ProviderManager;

    const generator = new BatchGenerator({
      provider,
      farmAttempt,
      logger,
      variantsPerTarget: 1,
      mutationCount: 0,
    });

    const results = await generator.generateBatch([{ name: 'StringParse', type: 'project' }]);
    // 3 strategies × 1 variant
    expect(results[0]!.attempts).toBe(3);
  });

  it('passes creative memory to prompts when stockpile has data', async () => {
    const stockpile = new StockpileRepository(db);

    // Insert a high-scoring roast as fire example
    stockpile.insert({
      targetName: 'OldTarget',
      targetType: 'project',
      tweetText: 'ser your TVL is a rounding error on Aave deposits',
      angle: 'DATA_BOMB',
      qualityScore: 4.5,
      freshnessType: 'evergreen',
    });

    // Insert a low-scored attempt as reject example
    const attemptId = farmAttempt.insert({
      targetName: 'OldTarget',
      targetType: 'project',
      tweetText: 'lol this project is bad',
      angle: 'FAKE_COMPLIMENT',
      strategy: 'rubric',
      llmSelfScore: 2.0,
      factCheckPassed: true,
    });
    farmAttempt.updateScore(attemptId, 1.5, 'generic and boring');

    const provider = makeMockProvider(['creative memory roast']);
    const generator = new BatchGenerator({
      provider,
      farmAttempt,
      stockpile,
      logger,
      variantsPerTarget: 1,
      mutationCount: 0,
    });

    await generator.generateBatch([{ name: 'NewTarget', type: 'project' }]);

    // The prompt should contain fire example text from stockpile
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const runMock = vi.mocked(provider.run);
    const firstPrompt = runMock.mock.calls[0]![1].prompt;
    expect(firstPrompt).toContain('rounding error on Aave');
  });

  it('works without stockpile (creative memory is undefined)', async () => {
    const provider = makeMockProvider(['no memory roast']);
    const generator = new BatchGenerator({
      provider,
      farmAttempt,
      logger,
      variantsPerTarget: 1,
      mutationCount: 0,
    });

    const results = await generator.generateBatch([{ name: 'NoMem', type: 'project' }]);
    // Should still work, just no creative memory in prompt
    expect(results[0]!.attempts).toBe(3);
    expect(results[0]!.errors).toHaveLength(0);
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase } from '@storage/database.js';
import { FarmAttemptRepository } from '@storage/repositories/farm-attempt.repository.js';
import { BatchGenerator } from './batch-generator.js';
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

  it('generates and stores attempts for a single target', async () => {
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
    expect(results[0]!.attempts).toBe(3);
    expect(results[0]!.filtered).toBe(0);
    expect(results[0]!.errors).toHaveLength(0);

    const stats = farmAttempt.getStats();
    expect(stats.total).toBe(3);
  });

  it('rotates strategies across batch targets', async () => {
    const provider = makeMockProvider();
    const generator = new BatchGenerator({
      provider,
      farmAttempt,
      logger,
      variantsPerTarget: 1,
      mutationCount: 0,
    });

    const results = await generator.generateBatch([
      { name: 'T1', type: 'project' },
      { name: 'T2', type: 'project' },
      { name: 'T3', type: 'project' },
    ], 3);

    const strategies = results.map((r) => r.strategy);
    expect(strategies).toEqual(['rubric', 'persona', 'adversarial']);
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

    expect(results[0]!.mutations).toHaveLength(2);

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

    expect(results[0]!.attempts).toBe(2);
    expect(results[0]!.filtered).toBe(1);
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
    expect(attempts).toHaveLength(1);
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
    expect(results[0]!.errors).toHaveLength(1);
    expect(results[0]!.attempts).toBe(0);
  });

  it('continues batch when one target fails', async () => {
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
      { name: 'Fail', type: 'project' },
      { name: 'Success', type: 'project' },
    ], 1);

    expect(results).toHaveLength(2);
    expect(results[0]!.errors).toHaveLength(1);
    expect(results[1]!.attempts).toBe(1);
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
    expect(results[0]!.attempts).toBe(1);
  });
});

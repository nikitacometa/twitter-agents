import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../database.js';
import { FeedbackRepository } from './feedback.repository.js';
import type { InsertFeedback } from './feedback.repository.js';
import { logger } from '@common/utils/logger.js';

function makeFeedback(overrides: Partial<InsertFeedback> = {}): InsertFeedback {
  return {
    sessionId: 'sess-1',
    variantIndex: 0,
    roastText: 'your TVL dropped 94%',
    targetName: 'Solana',
    angle: 'DATA_BOMB',
    llmSelfScore: 4,
    evaluatorTelegramId: 100,
    evaluatorName: 'alice',
    verdict: 'post',
    ...overrides,
  };
}

describe('FeedbackRepository', () => {
  let tmpDir: string;
  let db: Database.Database;
  let repo: FeedbackRepository;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'beef-test-'));
    db = createDatabase(join(tmpDir, 'test.db'), logger);
    repo = new FeedbackRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- Basic CRUD ---

  it('inserts and retrieves feedback', () => {
    const id = repo.insert(makeFeedback());
    expect(id).toBeGreaterThan(0);

    const rows = repo.getBySession('sess-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.roastText).toBe('your TVL dropped 94%');
    expect(rows[0]!.verdict).toBe('post');
  });

  it('returns empty array for unknown session', () => {
    expect(repo.getBySession('nonexistent')).toHaveLength(0);
  });

  it('gets recent feedback ordered by creation', () => {
    repo.insert(makeFeedback({ sessionId: 'a', roastText: 'first' }));
    repo.insert(makeFeedback({ sessionId: 'b', roastText: 'second' }));
    repo.insert(makeFeedback({ sessionId: 'c', roastText: 'third' }));

    const recent = repo.getRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0]!.roastText).toBe('third');
    expect(recent[1]!.roastText).toBe('second');
  });

  // --- Stats ---

  it('computes stats with verdict breakdown', () => {
    repo.insert(makeFeedback({ verdict: 'fire' }));
    repo.insert(makeFeedback({ verdict: 'fire', roastText: 'second fire' }));
    repo.insert(makeFeedback({ verdict: 'post', roastText: 'a post' }));
    repo.insert(makeFeedback({ verdict: 'reject', roastText: 'rejected' }));

    const stats = repo.getStats();
    expect(stats.total).toBe(4);
    expect(stats.byVerdict['fire']).toBe(2);
    expect(stats.byVerdict['post']).toBe(1);
    expect(stats.byVerdict['reject']).toBe(1);
  });

  it('returns zero stats on empty table', () => {
    const stats = repo.getStats();
    expect(stats.total).toBe(0);
    expect(stats.byVerdict).toEqual({});
    expect(stats.topTargets).toHaveLength(0);
  });

  // --- Creative memory: getFireExamples ---

  it('returns fire examples grouped by roast text', () => {
    // Same roast rated fire by two evaluators — should appear once
    repo.insert(makeFeedback({ verdict: 'fire', roastText: 'great roast', angle: 'DATA_BOMB', targetName: 'Solana' }));
    repo.insert(makeFeedback({ verdict: 'fire', roastText: 'great roast', angle: 'DATA_BOMB', targetName: 'Solana', evaluatorTelegramId: 200 }));

    // Different roast also fire
    repo.insert(makeFeedback({ verdict: 'fire', roastText: 'another banger', angle: 'TIMELINE', targetName: 'ETH' }));

    const examples = repo.getFireExamples(10);
    expect(examples).toHaveLength(2);
    // Verify fields
    const texts = examples.map((e) => e.text);
    expect(texts).toContain('great roast');
    expect(texts).toContain('another banger');
  });

  it('excludes manual angle from fire examples', () => {
    repo.insert(makeFeedback({ verdict: 'fire', angle: 'manual', roastText: 'manual roast' }));
    repo.insert(makeFeedback({ verdict: 'fire', angle: 'DATA_BOMB', roastText: 'generated roast' }));

    const examples = repo.getFireExamples(10);
    expect(examples).toHaveLength(1);
    expect(examples[0]!.text).toBe('generated roast');
  });

  it('excludes null angle from fire examples', () => {
    repo.insert(makeFeedback({ verdict: 'fire', angle: undefined, roastText: 'no angle' }));
    repo.insert(makeFeedback({ verdict: 'fire', angle: 'COMPARISON', roastText: 'has angle' }));

    const examples = repo.getFireExamples(10);
    expect(examples).toHaveLength(1);
    expect(examples[0]!.text).toBe('has angle');
  });

  it('excludes non-fire verdicts from fire examples', () => {
    repo.insert(makeFeedback({ verdict: 'post', angle: 'DATA_BOMB', roastText: 'just a post' }));
    repo.insert(makeFeedback({ verdict: 'iterate', angle: 'TIMELINE', roastText: 'needs work' }));
    repo.insert(makeFeedback({ verdict: 'fire', angle: 'COMPARISON', roastText: 'actual fire' }));

    const examples = repo.getFireExamples(10);
    expect(examples).toHaveLength(1);
    expect(examples[0]!.text).toBe('actual fire');
  });

  it('respects limit on fire examples', () => {
    for (let i = 0; i < 5; i++) {
      repo.insert(makeFeedback({
        verdict: 'fire',
        angle: 'DATA_BOMB',
        roastText: `fire roast ${String(i)}`,
        sessionId: `sess-${String(i)}`,
      }));
    }

    const examples = repo.getFireExamples(2);
    expect(examples).toHaveLength(2);
  });

  it('returns empty array when no fire examples exist', () => {
    repo.insert(makeFeedback({ verdict: 'post' }));
    expect(repo.getFireExamples(10)).toHaveLength(0);
  });

  // --- Creative memory: getFireExamplesForTarget ---

  it('returns fire examples for specific target', () => {
    repo.insert(makeFeedback({ verdict: 'fire', targetName: 'Solana', angle: 'DATA_BOMB', roastText: 'sol roast' }));
    repo.insert(makeFeedback({ verdict: 'fire', targetName: 'ETH', angle: 'TIMELINE', roastText: 'eth roast' }));

    const solExamples = repo.getFireExamplesForTarget('Solana', 10);
    expect(solExamples).toHaveLength(1);
    expect(solExamples[0]!.text).toBe('sol roast');
    expect(solExamples[0]!.target).toBe('Solana');
  });

  it('target fire examples are case-insensitive', () => {
    repo.insert(makeFeedback({ verdict: 'fire', targetName: 'Hyperliquid', angle: 'DATA_BOMB', roastText: 'hl roast' }));

    // Query with different casing
    const examples = repo.getFireExamplesForTarget('hyperliquid', 10);
    expect(examples).toHaveLength(1);
    expect(examples[0]!.text).toBe('hl roast');
  });

  // --- Creative memory: getTargetSessionCount ---

  it('counts distinct sessions for target', () => {
    // Session 1: two variants, two evaluators
    repo.insert(makeFeedback({ sessionId: 'sess-1', variantIndex: 0, targetName: 'Solana' }));
    repo.insert(makeFeedback({ sessionId: 'sess-1', variantIndex: 1, targetName: 'Solana' }));
    repo.insert(makeFeedback({ sessionId: 'sess-1', variantIndex: 0, targetName: 'Solana', evaluatorTelegramId: 200 }));

    // Session 2
    repo.insert(makeFeedback({ sessionId: 'sess-2', variantIndex: 0, targetName: 'Solana' }));

    // Different target — should not count
    repo.insert(makeFeedback({ sessionId: 'sess-3', variantIndex: 0, targetName: 'ETH' }));

    expect(repo.getTargetSessionCount('Solana')).toBe(2);
  });

  it('excludes manual sessions from target count', () => {
    repo.insert(makeFeedback({ sessionId: 'gen-1', targetName: 'Solana', angle: 'DATA_BOMB' }));
    repo.insert(makeFeedback({ sessionId: 'man-1', targetName: 'Solana', angle: 'manual' }));

    expect(repo.getTargetSessionCount('Solana')).toBe(1);
  });

  it('target session count is case-insensitive', () => {
    repo.insert(makeFeedback({ sessionId: 'sess-1', targetName: 'Hyperliquid', angle: 'DATA_BOMB' }));
    repo.insert(makeFeedback({ sessionId: 'sess-2', targetName: 'hyperliquid', angle: 'TIMELINE' }));

    expect(repo.getTargetSessionCount('HYPERLIQUID')).toBe(2);
  });

  it('returns zero for unknown target', () => {
    expect(repo.getTargetSessionCount('NonExistent')).toBe(0);
  });

  // --- Creative memory: getTargetAngleHistory ---

  it('returns angle usage counts for target', () => {
    // Session 1: DATA_BOMB + TIMELINE
    repo.insert(makeFeedback({ sessionId: 's1', variantIndex: 0, angle: 'DATA_BOMB', targetName: 'Solana' }));
    repo.insert(makeFeedback({ sessionId: 's1', variantIndex: 1, angle: 'TIMELINE', targetName: 'Solana' }));

    // Session 2: DATA_BOMB + COMPARISON
    repo.insert(makeFeedback({ sessionId: 's2', variantIndex: 0, angle: 'DATA_BOMB', targetName: 'Solana' }));
    repo.insert(makeFeedback({ sessionId: 's2', variantIndex: 1, angle: 'COMPARISON', targetName: 'Solana' }));

    const history = repo.getTargetAngleHistory('Solana');
    expect(history).toHaveLength(3);

    // DATA_BOMB used in 2 sessions → count 2, should be first (ORDER BY count DESC)
    expect(history[0]!.angle).toBe('DATA_BOMB');
    expect(history[0]!.count).toBe(2);

    // TIMELINE and COMPARISON each used once
    const singleUse = history.filter((h) => h.count === 1);
    expect(singleUse).toHaveLength(2);
  });

  it('deduplicates multiple ratings of same variant in angle history', () => {
    // Two evaluators rate the same variant — should count as 1 angle use
    repo.insert(makeFeedback({ sessionId: 's1', variantIndex: 0, angle: 'DATA_BOMB', targetName: 'Solana', evaluatorTelegramId: 100 }));
    repo.insert(makeFeedback({ sessionId: 's1', variantIndex: 0, angle: 'DATA_BOMB', targetName: 'Solana', evaluatorTelegramId: 200 }));

    const history = repo.getTargetAngleHistory('Solana');
    expect(history).toHaveLength(1);
    expect(history[0]!.count).toBe(1);
  });

  it('excludes manual and null angles from history', () => {
    repo.insert(makeFeedback({ sessionId: 's1', variantIndex: 0, angle: 'manual', targetName: 'Solana' }));
    repo.insert(makeFeedback({ sessionId: 's1', variantIndex: 1, angle: undefined, targetName: 'Solana' }));
    repo.insert(makeFeedback({ sessionId: 's1', variantIndex: 2, angle: 'DATA_BOMB', targetName: 'Solana' }));

    const history = repo.getTargetAngleHistory('Solana');
    expect(history).toHaveLength(1);
    expect(history[0]!.angle).toBe('DATA_BOMB');
  });

  it('angle history is case-insensitive on target name', () => {
    repo.insert(makeFeedback({ sessionId: 's1', variantIndex: 0, angle: 'DATA_BOMB', targetName: 'Hyperliquid' }));
    repo.insert(makeFeedback({ sessionId: 's2', variantIndex: 0, angle: 'TIMELINE', targetName: 'hyperliquid' }));

    const history = repo.getTargetAngleHistory('HYPERLIQUID');
    expect(history).toHaveLength(2);
  });

  it('returns empty array for target with no history', () => {
    expect(repo.getTargetAngleHistory('NonExistent')).toHaveLength(0);
  });
});

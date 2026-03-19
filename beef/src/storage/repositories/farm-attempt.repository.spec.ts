import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../database.js';
import { FarmAttemptRepository } from './farm-attempt.repository.js';
import { logger } from '@common/utils/logger.js';

describe('FarmAttemptRepository', () => {
  let tmpDir: string;
  let db: Database.Database;
  let repo: FarmAttemptRepository;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'beef-farm-attempt-'));
    db = createDatabase(join(tmpDir, 'test.db'), logger);
    repo = new FarmAttemptRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inserts and retrieves an attempt', () => {
    const id = repo.insert({
      targetName: 'Solana',
      targetType: 'project',
      tweetText: 'ser your chain went down more than my portfolio',
      angle: 'OUTAGE_KING',
      strategy: 'rubric',
      mutationSeed: JSON.stringify(['ice-cold']),
      llmSelfScore: 4.2,
      researchNotes: 'Solana had 5 outages in 2025',
      factCheckPassed: true,
    });

    expect(id).toBeGreaterThan(0);

    const attempt = repo.getById(id);
    expect(attempt).toBeDefined();
    expect(attempt!.targetName).toBe('Solana');
    expect(attempt!.tweetText).toContain('chain went down');
    expect(attempt!.angle).toBe('OUTAGE_KING');
    expect(attempt!.strategy).toBe('rubric');
    expect(attempt!.llmSelfScore).toBe(4.2);
    expect(attempt!.factCheckPassed).toBe(true);
    expect(attempt!.evaluatorScore).toBeNull();
    expect(attempt!.promoted).toBe(false);
  });

  it('returns undefined for non-existent id', () => {
    expect(repo.getById(999)).toBeUndefined();
  });

  it('getUnevaluated returns only unscored attempts', () => {
    const id1 = repo.insert({ targetName: 'A', targetType: 'token', tweetText: 'roast A' });
    repo.insert({ targetName: 'B', targetType: 'token', tweetText: 'roast B' });
    repo.updateScore(id1, 4.5, '{"verdict":"stockpile"}');

    const unevaluated = repo.getUnevaluated(10);
    expect(unevaluated).toHaveLength(1);
    expect(unevaluated[0]!.targetName).toBe('B');
  });

  it('updateScore sets evaluator fields', () => {
    const id = repo.insert({ targetName: 'Test', targetType: 'project', tweetText: 'test roast' });
    repo.updateScore(id, 3.8, '{"verdict":"discard","reasoning":"too mild"}');

    const attempt = repo.getById(id);
    expect(attempt!.evaluatorScore).toBe(3.8);
    expect(attempt!.evaluatorOutput).toContain('too mild');
  });

  it('markPromoted sets promoted flag', () => {
    const id = repo.insert({ targetName: 'Test', targetType: 'project', tweetText: 'test' });
    repo.markPromoted(id);

    const attempt = repo.getById(id);
    expect(attempt!.promoted).toBe(true);
  });

  it('pruneOld removes unpromoted attempts older than TTL', () => {
    // Insert directly with old date to simulate age
    db.prepare(`
      INSERT INTO farm_attempts (target_name, target_type, tweet_text, promoted, created_at)
      VALUES ('Old', 'token', 'old roast', 0, datetime('now', '-60 days'))
    `).run();

    db.prepare(`
      INSERT INTO farm_attempts (target_name, target_type, tweet_text, promoted, created_at)
      VALUES ('OldPromoted', 'token', 'old promoted', 1, datetime('now', '-60 days'))
    `).run();

    repo.insert({ targetName: 'Recent', targetType: 'token', tweetText: 'recent roast' });

    const pruned = repo.pruneOld(30);
    expect(pruned).toBe(1); // only unpromoted old one

    const stats = repo.getStats();
    expect(stats.total).toBe(2); // promoted + recent survive
  });

  it('getStats returns correct aggregates', () => {
    const id1 = repo.insert({ targetName: 'A', targetType: 'token', tweetText: 'r1' });
    const id2 = repo.insert({ targetName: 'B', targetType: 'token', tweetText: 'r2' });
    repo.insert({ targetName: 'C', targetType: 'token', tweetText: 'r3' });

    repo.updateScore(id1, 4.5, '{}');
    repo.updateScore(id2, 3.5, '{}');
    repo.markPromoted(id1);

    const stats = repo.getStats();
    expect(stats.total).toBe(3);
    expect(stats.evaluated).toBe(2);
    expect(stats.promoted).toBe(1);
    expect(stats.avgScore).toBe(4.0);
  });

  it('inserts with minimal fields', () => {
    const id = repo.insert({ targetName: 'Min', targetType: 'token', tweetText: 'bare minimum' });
    const attempt = repo.getById(id);
    expect(attempt).toBeDefined();
    expect(attempt!.angle).toBeNull();
    expect(attempt!.strategy).toBeNull();
    expect(attempt!.mutationSeed).toBeNull();
    expect(attempt!.llmSelfScore).toBeNull();
    expect(attempt!.factCheckPassed).toBe(false);
  });
});

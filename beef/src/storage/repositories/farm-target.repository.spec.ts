import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../database.js';
import { FarmTargetRepository } from './farm-target.repository.js';
import { logger } from '@common/utils/logger.js';

describe('FarmTargetRepository', () => {
  let tmpDir: string;
  let db: Database.Database;
  let repo: FarmTargetRepository;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'beef-farm-target-'));
    db = createDatabase(join(tmpDir, 'test.db'), logger);
    repo = new FarmTargetRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inserts and retrieves a target', () => {
    const id = repo.insert({
      name: 'Uniswap',
      type: 'project',
      source: 'dexscreener',
      priorityScore: 7.5,
      reason: 'High volume on Base',
    });

    expect(id).toBeGreaterThan(0);

    const target = repo.findByName('Uniswap');
    expect(target).toBeDefined();
    expect(target!.name).toBe('Uniswap');
    expect(target!.type).toBe('project');
    expect(target!.source).toBe('dexscreener');
    expect(target!.priorityScore).toBe(7.5);
    expect(target!.reason).toBe('High volume on Base');
    expect(target!.status).toBe('pending');
  });

  it('findByName is case-insensitive', () => {
    repo.insert({ name: 'Aave', type: 'project', source: 'coingecko', priorityScore: 5 });
    expect(repo.findByName('aave')).toBeDefined();
    expect(repo.findByName('AAVE')).toBeDefined();
  });

  it('returns undefined for non-existent target', () => {
    expect(repo.findByName('NonExistent')).toBeUndefined();
  });

  it('getPending returns targets ordered by priority', () => {
    repo.insert({ name: 'Low', type: 'token', source: 'manual', priorityScore: 2 });
    repo.insert({ name: 'High', type: 'token', source: 'manual', priorityScore: 9 });
    repo.insert({ name: 'Mid', type: 'token', source: 'manual', priorityScore: 5 });

    const pending = repo.getPending(10);
    expect(pending).toHaveLength(3);
    expect(pending[0]!.name).toBe('High');
    expect(pending[1]!.name).toBe('Mid');
    expect(pending[2]!.name).toBe('Low');
  });

  it('getPending respects limit', () => {
    repo.insert({ name: 'A', type: 'token', source: 'manual', priorityScore: 1 });
    repo.insert({ name: 'B', type: 'token', source: 'manual', priorityScore: 2 });
    repo.insert({ name: 'C', type: 'token', source: 'manual', priorityScore: 3 });

    expect(repo.getPending(2)).toHaveLength(2);
  });

  it('updateStatus changes target status', () => {
    const id = repo.insert({ name: 'Test', type: 'project', source: 'manual', priorityScore: 5 });
    repo.updateStatus(id, 'generating');

    const target = repo.findByName('Test');
    expect(target!.status).toBe('generating');
  });

  it('getPending excludes non-pending targets', () => {
    const id = repo.insert({ name: 'Done', type: 'project', source: 'manual', priorityScore: 10 });
    repo.updateStatus(id, 'completed');
    repo.insert({ name: 'Pending', type: 'project', source: 'manual', priorityScore: 1 });

    const pending = repo.getPending(10);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.name).toBe('Pending');
  });

  it('getCountByStatus returns correct counts', () => {
    const id1 = repo.insert({ name: 'A', type: 'token', source: 'manual', priorityScore: 1 });
    repo.insert({ name: 'B', type: 'token', source: 'manual', priorityScore: 2 });
    const id3 = repo.insert({ name: 'C', type: 'token', source: 'manual', priorityScore: 3 });
    repo.updateStatus(id1, 'completed');
    repo.updateStatus(id3, 'skipped');

    const counts = repo.getCountByStatus();
    expect(counts.pending).toBe(1);
    expect(counts.completed).toBe(1);
    expect(counts.skipped).toBe(1);
    expect(counts.generating).toBe(0);
  });
});

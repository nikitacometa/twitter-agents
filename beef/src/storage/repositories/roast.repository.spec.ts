import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../database.js';
import { RoastRepository } from './roast.repository.js';
import { logger } from '@common/utils/logger.js';

describe('RoastRepository', () => {
  let tmpDir: string;
  let db: Database.Database;
  let repo: RoastRepository;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'beef-test-'));
    db = createDatabase(join(tmpDir, 'test.db'), logger);
    repo = new RoastRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inserts and retrieves a roast', () => {
    const id = repo.insert({
      targetName: 'Solana',
      targetType: 'project',
      tweetText: 'ser your chain went down again',
      source: 'autonomous',
    });

    expect(id).toBeGreaterThan(0);

    const roast = repo.getById(id);
    expect(roast).toBeDefined();
    expect(roast!.targetName).toBe('Solana');
    expect(roast!.tweetText).toBe('ser your chain went down again');
    expect(roast!.source).toBe('autonomous');
    expect(roast!.status).toBe('posted');
    expect(roast!.factChecked).toBe(false);
  });

  it('returns undefined for non-existent id', () => {
    expect(repo.getById(999)).toBeUndefined();
  });

  it('gets recent roasts ordered by creation', () => {
    repo.insert({ targetName: 'A', targetType: 'token', tweetText: 'first', source: 'autonomous' });
    repo.insert({ targetName: 'B', targetType: 'token', tweetText: 'second', source: 'mention' });
    repo.insert({ targetName: 'C', targetType: 'token', tweetText: 'third', source: 'autonomous' });

    const recent = repo.getRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0]!.targetName).toBe('C');
    expect(recent[1]!.targetName).toBe('B');
  });

  it('counts today roasts by source', () => {
    repo.insert({ targetName: 'A', targetType: 'token', tweetText: 't', source: 'autonomous' });
    repo.insert({ targetName: 'B', targetType: 'token', tweetText: 't', source: 'autonomous' });
    repo.insert({ targetName: 'C', targetType: 'token', tweetText: 't', source: 'mention' });

    expect(repo.getTodayCount('autonomous')).toBe(2);
    expect(repo.getTodayCount('mention')).toBe(1);
    expect(repo.getTodayCount('burn_request')).toBe(0);
  });

  it('updates engagement metrics', () => {
    const id = repo.insert({ targetName: 'X', targetType: 'project', tweetText: 't', source: 'autonomous' });
    repo.updateEngagement(id, { likes: 42, retweets: 7, replies: 3, impressions: 1200 });

    const roast = repo.getById(id);
    expect(roast!.likes).toBe(42);
    expect(roast!.retweets).toBe(7);
    expect(roast!.impressions).toBe(1200);
  });

  it('updates status and tweet id', () => {
    const id = repo.insert({
      targetName: 'Y',
      targetType: 'token',
      tweetText: 't',
      source: 'autonomous',
      status: 'dry_run',
    });

    repo.updateStatus(id, 'posted', '1234567890');
    const roast = repo.getById(id);
    expect(roast!.status).toBe('posted');
    expect(roast!.tweetId).toBe('1234567890');
  });

  it('searches by full-text', () => {
    repo.insert({ targetName: 'Solana', targetType: 'project', tweetText: 'your chain crashed again ser', source: 'autonomous' });
    repo.insert({ targetName: 'ETH', targetType: 'token', tweetText: 'gas fees touching the moon', source: 'autonomous' });

    const results = repo.searchByText('chain crashed');
    expect(results).toHaveLength(1);
    expect(results[0]!.targetName).toBe('Solana');
  });
});

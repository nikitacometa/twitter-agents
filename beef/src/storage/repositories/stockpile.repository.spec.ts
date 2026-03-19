import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../database.js';
import { StockpileRepository } from './stockpile.repository.js';
import { logger } from '@common/utils/logger.js';

describe('StockpileRepository', () => {
  let tmpDir: string;
  let db: Database.Database;
  let repo: StockpileRepository;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'beef-stockpile-'));
    db = createDatabase(join(tmpDir, 'test.db'), logger);
    repo = new StockpileRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inserts and retrieves a stockpile roast', () => {
    const id = repo.insert({
      targetName: 'Uniswap',
      targetType: 'project',
      tweetText: 'uniswap spent $11M on governance just to let bots frontrun your swaps ser',
      angle: 'DATA_BOMB',
      qualityScore: 4.5,
      freshnessType: 'evergreen',
    });

    expect(id).toBeGreaterThan(0);

    const roast = repo.getById(id);
    expect(roast).toBeDefined();
    expect(roast!.targetName).toBe('Uniswap');
    expect(roast!.qualityScore).toBe(4.5);
    expect(roast!.status).toBe('available');
    expect(roast!.freshnessType).toBe('evergreen');
    expect(roast!.expiresAt).toBeNull();
  });

  it('getAvailable returns only available, non-expired roasts', () => {
    repo.insert({
      targetName: 'Aave',
      targetType: 'project',
      tweetText: 'aave roast 1',
      qualityScore: 4.0,
      freshnessType: 'evergreen',
    });

    const servedId = repo.insert({
      targetName: 'Aave',
      targetType: 'project',
      tweetText: 'aave roast 2',
      qualityScore: 4.2,
      freshnessType: 'evergreen',
    });
    repo.markServed(servedId, 'bot');

    const available = repo.getAvailable('Aave');
    expect(available).toHaveLength(1);
    expect(available[0]!.tweetText).toBe('aave roast 1');
  });

  it('getAvailable is case-insensitive', () => {
    repo.insert({
      targetName: 'Solana',
      targetType: 'project',
      tweetText: 'sol roast',
      qualityScore: 4.0,
      freshnessType: 'evergreen',
    });

    expect(repo.getAvailable('solana')).toHaveLength(1);
    expect(repo.getAvailable('SOLANA')).toHaveLength(1);
  });

  it('getAvailable orders by quality_score DESC', () => {
    repo.insert({ targetName: 'X', targetType: 'token', tweetText: 'low', qualityScore: 3.5, freshnessType: 'evergreen' });
    repo.insert({ targetName: 'X', targetType: 'token', tweetText: 'high', qualityScore: 4.8, freshnessType: 'evergreen' });
    repo.insert({ targetName: 'X', targetType: 'token', tweetText: 'mid', qualityScore: 4.1, freshnessType: 'evergreen' });

    const available = repo.getAvailable('X');
    expect(available[0]!.tweetText).toBe('high');
    expect(available[1]!.tweetText).toBe('mid');
    expect(available[2]!.tweetText).toBe('low');
  });

  it('markServed sets status and served_at', () => {
    const id = repo.insert({
      targetName: 'Test',
      targetType: 'project',
      tweetText: 'test roast',
      qualityScore: 4.0,
      freshnessType: 'evergreen',
    });

    repo.markServed(id, 'landing');
    const roast = repo.getById(id);
    expect(roast!.status).toBe('served_landing');
    expect(roast!.servedAt).not.toBeNull();
  });

  it('updateStatus changes roast status', () => {
    const id = repo.insert({
      targetName: 'Test',
      targetType: 'project',
      tweetText: 'test',
      qualityScore: 4.0,
      freshnessType: 'evergreen',
    });

    repo.updateStatus(id, 'promoted');
    expect(repo.getById(id)!.status).toBe('promoted');
  });

  it('pruneExpired marks data-dependent roasts as expired', () => {
    // Insert an already-expired data-dependent roast
    db.prepare(`
      INSERT INTO roast_stockpile
        (target_name, target_type, tweet_text, quality_score, freshness_type, expires_at, status)
      VALUES ('Expired', 'token', 'expired roast', 4.0, 'data_dependent', datetime('now', '-1 day'), 'available')
    `).run();
    // Trigger FTS manually since the trigger fires on SQL INSERT
    // (already handled by trigger, but FTS isn't needed for prune)

    repo.insert({
      targetName: 'Fresh',
      targetType: 'token',
      tweetText: 'fresh roast',
      qualityScore: 4.0,
      freshnessType: 'evergreen',
    });

    const pruned = repo.pruneExpired();
    expect(pruned).toBe(1);

    // Verify the expired one changed status
    const all = repo.getStats();
    expect(all.byStatus['expired']).toBe(1);
    expect(all.byStatus['available']).toBe(1);
  });

  it('getCountForTarget counts only available roasts', () => {
    repo.insert({ targetName: 'T', targetType: 'token', tweetText: 'r1', qualityScore: 4.0, freshnessType: 'evergreen' });
    repo.insert({ targetName: 'T', targetType: 'token', tweetText: 'r2', qualityScore: 4.2, freshnessType: 'evergreen' });
    const id3 = repo.insert({ targetName: 'T', targetType: 'token', tweetText: 'r3', qualityScore: 4.5, freshnessType: 'evergreen' });
    repo.markServed(id3, 'bot');

    expect(repo.getCountForTarget('T')).toBe(2);
  });

  describe('isDuplicate', () => {
    it('detects near-duplicate text', () => {
      repo.insert({
        targetName: 'Solana',
        targetType: 'project',
        tweetText: 'solana went down five times this year and the community still calls it high performance blockchain',
        qualityScore: 4.0,
        freshnessType: 'evergreen',
      });

      const isDupe = repo.isDuplicate(
        'solana went down five times this year and their community still calls it a high performance blockchain ser',
        'Solana',
      );
      expect(isDupe).toBe(true);
    });

    it('does not flag different roasts as duplicates', () => {
      repo.insert({
        targetName: 'Solana',
        targetType: 'project',
        tweetText: 'solana went down five times this year',
        qualityScore: 4.0,
        freshnessType: 'evergreen',
      });

      const isDupe = repo.isDuplicate(
        'uniswap governance spent eleven million dollars to watch bots frontrun every single swap',
        'Solana',
      );
      expect(isDupe).toBe(false);
    });

    it('scopes deduplication to target name', () => {
      repo.insert({
        targetName: 'Aave',
        targetType: 'project',
        tweetText: 'your lending protocol has more governance proposals than actual users',
        qualityScore: 4.0,
        freshnessType: 'evergreen',
      });

      // Same text but different target — should not be duplicate
      const isDupe = repo.isDuplicate(
        'your lending protocol has more governance proposals than actual users',
        'Compound',
      );
      expect(isDupe).toBe(false);
    });

    it('returns false for empty text', () => {
      expect(repo.isDuplicate('', 'Solana')).toBe(false);
    });

    it('returns false for very short text', () => {
      expect(repo.isDuplicate('hi ok', 'Solana')).toBe(false);
    });
  });

  describe('findBest selection distribution', () => {
    it('returns undefined when no roasts available', () => {
      expect(repo.findBest('NonExistent')).toBeUndefined();
    });

    it('returns the only roast when 1 available', () => {
      repo.insert({ targetName: 'Solo', targetType: 'token', tweetText: 'only one', qualityScore: 4.0, freshnessType: 'evergreen' });
      const result = repo.findBest('Solo');
      expect(result).toBeDefined();
      expect(result!.tweetText).toBe('only one');
    });

    it('distributes selection roughly 70/30 over many calls', () => {
      // Insert 5 roasts with different scores
      repo.insert({ targetName: 'D', targetType: 'token', tweetText: 'best', qualityScore: 4.9, freshnessType: 'evergreen' });
      repo.insert({ targetName: 'D', targetType: 'token', tweetText: 'good', qualityScore: 4.5, freshnessType: 'evergreen' });
      repo.insert({ targetName: 'D', targetType: 'token', tweetText: 'ok', qualityScore: 4.2, freshnessType: 'evergreen' });
      repo.insert({ targetName: 'D', targetType: 'token', tweetText: 'decent', qualityScore: 4.1, freshnessType: 'evergreen' });
      repo.insert({ targetName: 'D', targetType: 'token', tweetText: 'low', qualityScore: 4.0, freshnessType: 'evergreen' });

      let topCount = 0;
      const iterations = 200;

      for (let i = 0; i < iterations; i++) {
        const result = repo.findBest('D');
        if (result!.tweetText === 'best') topCount++;
      }

      // With 70/30 split: top gets picked ~70% directly + ~20% via random (1/5 of 30%)
      // Expected: ~76%. Allow wide margin: 55-95%
      const topRate = topCount / iterations;
      expect(topRate).toBeGreaterThan(0.5);
      expect(topRate).toBeLessThan(0.95);
    });
  });

  it('getTopTargets returns ranked targets', () => {
    repo.insert({ targetName: 'Popular', targetType: 'project', tweetText: 'r1', qualityScore: 4.5, freshnessType: 'evergreen' });
    repo.insert({ targetName: 'Popular', targetType: 'project', tweetText: 'r2', qualityScore: 4.0, freshnessType: 'evergreen' });
    repo.insert({ targetName: 'Unpopular', targetType: 'token', tweetText: 'r3', qualityScore: 3.5, freshnessType: 'evergreen' });

    const top = repo.getTopTargets(5);
    expect(top).toHaveLength(2);
    expect(top[0]!.name).toBe('Popular');
    expect(top[0]!.stockpileCount).toBe(2);
    expect(top[0]!.avgScore).toBeCloseTo(4.25, 1);
  });

  it('getExportable returns available, non-expired roasts by score', () => {
    repo.insert({ targetName: 'A', targetType: 'project', tweetText: 'high', qualityScore: 4.8, freshnessType: 'evergreen' });
    repo.insert({ targetName: 'B', targetType: 'project', tweetText: 'low', qualityScore: 4.0, freshnessType: 'evergreen' });
    const servedId = repo.insert({ targetName: 'C', targetType: 'project', tweetText: 'served', qualityScore: 4.9, freshnessType: 'evergreen' });
    repo.markServed(servedId, 'bot');

    const exportable = repo.getExportable(10);
    expect(exportable).toHaveLength(2);
    expect(exportable[0]!.tweetText).toBe('high');
  });

  it('getStats returns correct aggregates', () => {
    repo.insert({ targetName: 'A', targetType: 'token', tweetText: 'r1', qualityScore: 4.0, freshnessType: 'evergreen' });
    const id2 = repo.insert({ targetName: 'B', targetType: 'token', tweetText: 'r2', qualityScore: 4.5, freshnessType: 'evergreen' });
    repo.markServed(id2, 'bot');

    const stats = repo.getStats();
    expect(stats.total).toBe(2);
    expect(stats.byStatus['available']).toBe(1);
    expect(stats.byStatus['served_bot']).toBe(1);
    // avgScore is only for available
    expect(stats.avgScore).toBe(4.0);
  });
});

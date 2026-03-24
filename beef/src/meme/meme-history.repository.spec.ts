import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '@storage/database.js';
import { logger } from '@common/utils/logger.js';
import { MemeHistoryRepository } from './meme-history.repository.js';

describe('MemeHistoryRepository', () => {
  let tmpDir: string;
  let db: Database.Database;
  let repo: MemeHistoryRepository;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'beef-meme-history-'));
    db = createDatabase(join(tmpDir, 'test.db'), logger);
    repo = new MemeHistoryRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inserts and counts entries', () => {
    expect(repo.getCount()).toBe(0);

    const id = repo.insert({
      templateId: '181913649',
      templateName: 'Drake Hotline Bling',
      target: 'Solana',
      boxes: ['selling at the top', 'buying more at ath'],
      format: 'meme_only',
      imageUrl: 'https://imgflip.com/test.jpg',
      rationale: 'perfect for comparison',
    });

    expect(id).toBeGreaterThan(0);
    expect(repo.getCount()).toBe(1);
  });

  it('returns recent template names in recency order', () => {
    // Use explicit timestamps to ensure deterministic ordering
    const insertWithTime = db.prepare(`
      INSERT INTO meme_history (template_id, template_name, target, boxes, format, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertWithTime.run('87743020', 'Two Buttons', 'Ethereum', '["a","b"]', 'meme_plus_text', '2026-01-01 10:00:00');
    insertWithTime.run('181913649', 'Drake Hotline Bling', 'Solana', '["a","b"]', 'meme_only', '2026-01-01 11:00:00');
    insertWithTime.run('181913649', 'Drake Hotline Bling', 'Bitcoin', '["c","d"]', 'meme_only', '2026-01-01 12:00:00');

    const names = repo.getRecentTemplateNames(5);
    expect(names).toHaveLength(2);
    // Drake last used at 12:00, Two Buttons at 10:00
    expect(names[0]).toBe('Drake Hotline Bling');
    expect(names[1]).toBe('Two Buttons');
  });

  it('respects limit on getRecentTemplateNames', () => {
    for (let i = 0; i < 5; i++) {
      repo.insert({
        templateId: String(i),
        templateName: `Template ${String(i)}`,
        target: 'test',
        boxes: ['a'],
        format: 'meme_only',
      });
    }

    const names = repo.getRecentTemplateNames(3);
    expect(names).toHaveLength(3);
  });

  it('getByTarget filters by target (case-insensitive)', () => {
    repo.insert({
      templateId: '1',
      templateName: 'Drake',
      target: 'Solana',
      boxes: ['a', 'b'],
      format: 'meme_only',
    });

    repo.insert({
      templateId: '2',
      templateName: 'This Is Fine',
      target: 'Ethereum',
      boxes: ['x'],
      format: 'meme_plus_text',
    });

    const solana = repo.getByTarget('solana');
    expect(solana).toHaveLength(1);
    expect(solana[0]!.templateName).toBe('Drake');
    expect(solana[0]!.boxes).toEqual(['a', 'b']);

    const eth = repo.getByTarget('ETHEREUM');
    expect(eth).toHaveLength(1);
    expect(eth[0]!.format).toBe('meme_plus_text');
  });

  it('stores and parses boxes as JSON', () => {
    repo.insert({
      templateId: '1',
      templateName: 'Test',
      target: 'test',
      boxes: ['first box', 'second box', 'third box'],
      format: 'meme_only',
    });

    const entries = repo.getByTarget('test');
    expect(entries[0]!.boxes).toEqual(['first box', 'second box', 'third box']);
  });

  it('handles optional fields as null', () => {
    repo.insert({
      templateId: '1',
      templateName: 'Test',
      target: 'test',
      boxes: ['a'],
      format: 'text_only',
    });

    const entries = repo.getByTarget('test');
    expect(entries[0]!.imageUrl).toBeNull();
    expect(entries[0]!.rationale).toBeNull();
    expect(entries[0]!.stockpileId).toBeNull();
  });

  it('stores and retrieves stockpileId', () => {
    // Insert a stockpile entry to satisfy FK constraint
    db.prepare(`INSERT INTO roast_stockpile (id, target_name, target_type, tweet_text, quality_score) VALUES (?, ?, ?, ?, ?)`)
      .run(42, 'test', 'project', 'test tweet', 4.0);

    repo.insert({
      templateId: '1',
      templateName: 'Drake',
      target: 'test',
      boxes: ['a', 'b'],
      format: 'meme_only',
      stockpileId: 42,
    });

    const entries = repo.getByTarget('test');
    expect(entries[0]!.stockpileId).toBe(42);
  });
});

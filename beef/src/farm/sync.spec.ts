import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDatabase } from '@storage/database.js';
import { StockpileRepository } from '@storage/repositories/stockpile.repository.js';
import { exportNdjson, importNdjson, exportLandingJson } from './sync.js';
import type { StockpileExportRow } from './types.js';
import type { Logger } from 'pino';
import type Database from 'better-sqlite3';

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

function makeRow(overrides: Partial<StockpileExportRow> = {}): StockpileExportRow {
  return {
    target_name: 'Uniswap',
    target_type: 'project',
    tweet_text: 'uniswap governance spent $11M on nothing',
    angle: 'DATA_BOMB',
    quality_score: 4.5,
    evaluator_output: null,
    research_notes: null,
    freshness_type: 'evergreen',
    expires_at: null,
    ...overrides,
  };
}

function seedStockpile(stockpile: StockpileRepository, count: number): void {
  for (let i = 0; i < count; i++) {
    stockpile.insert({
      targetName: `Target${String(i)}`,
      targetType: 'project',
      tweetText: `Roast text #${String(i)}`,
      qualityScore: 4.0 + i * 0.1,
      freshnessType: 'evergreen',
    });
  }
}

describe('sync', () => {
  let tmpDir: string;
  let db: Database.Database;
  let stockpile: StockpileRepository;
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
    tmpDir = mkdtempSync(join(tmpdir(), 'beef-sync-'));
    db = createDatabase(join(tmpDir, 'test.db'), logger);
    stockpile = new StockpileRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- exportNdjson ---

  describe('exportNdjson', () => {
    it('exports stockpile rows as NDJSON', async () => {
      seedStockpile(stockpile, 3);
      const outPath = join(tmpDir, 'export.ndjson');

      const count = await exportNdjson(stockpile, outPath, 100, logger);

      expect(count).toBe(3);

      const lines = readFileSync(outPath, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(3);

      const parsed = JSON.parse(lines[0]!) as StockpileExportRow;
      // getExportable orders by quality_score DESC — highest score first
      expect(parsed.target_name).toBe('Target2');
      expect(parsed.tweet_text).toBe('Roast text #2');
      expect(parsed.freshness_type).toBe('evergreen');
    });

    it('respects limit parameter', async () => {
      seedStockpile(stockpile, 10);
      const outPath = join(tmpDir, 'limited.ndjson');

      const count = await exportNdjson(stockpile, outPath, 3, logger);

      expect(count).toBe(3);
      const lines = readFileSync(outPath, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(3);
    });

    it('writes empty file for empty stockpile', async () => {
      const outPath = join(tmpDir, 'empty.ndjson');

      const count = await exportNdjson(stockpile, outPath, 100, logger);

      expect(count).toBe(0);
      const content = readFileSync(outPath, 'utf-8');
      expect(content).toBe('');
    });

    it('includes all fields in export row', async () => {
      const futureDate = new Date(Date.now() + 86_400_000).toISOString();
      stockpile.insert({
        targetName: 'TestToken',
        targetType: 'token',
        tweetText: 'Test roast',
        angle: 'CALLBACK',
        qualityScore: 5.2,
        evaluatorOutput: '{"test": true}',
        researchNotes: 'Some notes',
        freshnessType: 'data_dependent',
        expiresAt: futureDate,
      });

      const outPath = join(tmpDir, 'full.ndjson');
      await exportNdjson(stockpile, outPath, 10, logger);

      const parsed = JSON.parse(readFileSync(outPath, 'utf-8').trim()) as StockpileExportRow;
      expect(parsed).toEqual({
        target_name: 'TestToken',
        target_type: 'token',
        tweet_text: 'Test roast',
        angle: 'CALLBACK',
        quality_score: 5.2,
        evaluator_output: '{"test": true}',
        research_notes: 'Some notes',
        freshness_type: 'data_dependent',
        expires_at: futureDate,
      });
    });
  });

  // --- importNdjson ---

  describe('importNdjson', () => {
    it('imports valid NDJSON rows into stockpile', async () => {
      const rows = [
        makeRow({ target_name: 'A', tweet_text: 'Roast A' }),
        makeRow({ target_name: 'B', tweet_text: 'Roast B' }),
      ];
      const inputPath = join(tmpDir, 'import.ndjson');
      writeFileSync(inputPath, rows.map((r) => JSON.stringify(r)).join('\n'), 'utf-8');

      const result = await importNdjson(stockpile, inputPath, logger);

      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('skips duplicate rows (idempotent)', async () => {
      // Pre-seed one roast
      stockpile.insert({
        targetName: 'Uniswap',
        targetType: 'project',
        tweetText: 'uniswap governance spent $11M on nothing',
        qualityScore: 4.5,
        freshnessType: 'evergreen',
      });

      const rows = [makeRow()]; // Same target_name + tweet_text as seeded
      const inputPath = join(tmpDir, 'dupes.ndjson');
      writeFileSync(inputPath, JSON.stringify(rows[0]) + '\n', 'utf-8');

      const result = await importNdjson(stockpile, inputPath, logger);

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it('counts invalid JSON as errors', async () => {
      const inputPath = join(tmpDir, 'bad.ndjson');
      writeFileSync(inputPath, 'not json\n{"also": "invalid"}\n', 'utf-8');

      const result = await importNdjson(stockpile, inputPath, logger);

      // First line: JSON parse error. Second line: valid JSON but invalid row format.
      expect(result.errors).toBe(2);
      expect(result.imported).toBe(0);
    });

    it('counts rows missing required fields as errors', async () => {
      const inputPath = join(tmpDir, 'missing.ndjson');
      // Missing quality_score and freshness_type
      writeFileSync(
        inputPath,
        JSON.stringify({ target_name: 'X', target_type: 'token', tweet_text: 'hi' }) + '\n',
        'utf-8',
      );

      const result = await importNdjson(stockpile, inputPath, logger);

      expect(result.errors).toBe(1);
      expect(result.imported).toBe(0);
    });

    it('skips empty lines', async () => {
      const row = makeRow({ target_name: 'Solo', tweet_text: 'Only one' });
      const inputPath = join(tmpDir, 'blanks.ndjson');
      writeFileSync(inputPath, '\n' + JSON.stringify(row) + '\n\n', 'utf-8');

      const result = await importNdjson(stockpile, inputPath, logger);

      expect(result.imported).toBe(1);
      expect(result.errors).toBe(0);
    });

    it('handles mixed valid/invalid/duplicate rows', async () => {
      // Pre-seed a duplicate
      stockpile.insert({
        targetName: 'Existing',
        targetType: 'project',
        tweetText: 'Already here',
        qualityScore: 3.0,
        freshnessType: 'evergreen',
      });

      const lines = [
        JSON.stringify(makeRow({ target_name: 'New', tweet_text: 'Fresh roast' })),
        'bad json line',
        JSON.stringify(makeRow({ target_name: 'Existing', tweet_text: 'Already here' })),
        JSON.stringify(makeRow({ target_name: 'Another', tweet_text: 'Also new' })),
      ];
      const inputPath = join(tmpDir, 'mixed.ndjson');
      writeFileSync(inputPath, lines.join('\n') + '\n', 'utf-8');

      const result = await importNdjson(stockpile, inputPath, logger);

      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(1);
      expect(result.errors).toBe(1);
    });
  });

  // --- Round-trip ---

  describe('round-trip', () => {
    it('export → import preserves data', async () => {
      seedStockpile(stockpile, 5);

      // Export
      const ndjsonPath = join(tmpDir, 'roundtrip.ndjson');
      const exportCount = await exportNdjson(stockpile, ndjsonPath, 100, logger);
      expect(exportCount).toBe(5);

      // Import into a fresh DB
      const db2 = createDatabase(join(tmpDir, 'test2.db'), logger);
      const stockpile2 = new StockpileRepository(db2);

      const result = await importNdjson(stockpile2, ndjsonPath, logger);
      expect(result.imported).toBe(5);
      expect(result.skipped).toBe(0);

      // Verify data matches
      const reExported = stockpile2.getExportable(100);
      expect(reExported).toHaveLength(5);
      // getExportable orders by quality_score DESC
      expect(reExported[0]!.targetName).toBe('Target4');

      db2.close();
    });

    it('re-import is idempotent (all skipped)', async () => {
      seedStockpile(stockpile, 3);

      const ndjsonPath = join(tmpDir, 'idem.ndjson');
      await exportNdjson(stockpile, ndjsonPath, 100, logger);

      // Import into same DB
      const result = await importNdjson(stockpile, ndjsonPath, logger);
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(3);
    });
  });

  // --- exportLandingJson ---

  describe('exportLandingJson', () => {
    it('returns landing page format with correct fields', () => {
      stockpile.insert({
        targetName: 'Aave',
        targetType: 'project',
        tweetText: 'aave lending pool got rekt',
        angle: 'IRONY',
        qualityScore: 4.8,
        freshnessType: 'evergreen',
      });

      const result = exportLandingJson(stockpile, 10);

      expect(result.total).toBe(1);
      expect(result.generated_at).toBeDefined();
      expect(result.roasts).toHaveLength(1);
      expect(result.roasts[0]).toEqual({
        target: 'Aave',
        type: 'project',
        text: 'aave lending pool got rekt',
        angle: 'IRONY',
        score: 4.8,
        freshness: 'evergreen',
      });
    });

    it('respects limit', () => {
      seedStockpile(stockpile, 10);

      const result = exportLandingJson(stockpile, 3);

      expect(result.total).toBe(3);
      expect(result.roasts).toHaveLength(3);
    });

    it('returns empty array for empty stockpile', () => {
      const result = exportLandingJson(stockpile, 50);

      expect(result.total).toBe(0);
      expect(result.roasts).toEqual([]);
    });

    it('generated_at is valid ISO timestamp', () => {
      const result = exportLandingJson(stockpile, 10);

      const date = new Date(result.generated_at);
      expect(date.getTime()).not.toBeNaN();
    });
  });
});

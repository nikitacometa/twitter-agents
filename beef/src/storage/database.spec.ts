import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from './database.js';
import { logger } from '@common/utils/logger.js';

describe('createDatabase', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'beef-test-'));
    dbPath = join(tmpDir, 'test.db');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates database with WAL mode', () => {
    const db = createDatabase(dbPath, logger);
    const mode = db.pragma('journal_mode', { simple: true }) as string;
    expect(mode).toBe('wal');
    db.close();
  });

  it('applies all migrations', () => {
    const db = createDatabase(dbPath, logger);
    const migrations = db.prepare('SELECT name FROM _migrations ORDER BY id').all() as Array<{ name: string }>;
    expect(migrations).toHaveLength(12);
    expect(migrations[0]!.name).toBe('001-initial.sql');
    expect(migrations[1]!.name).toBe('002-extended.sql');
    expect(migrations[2]!.name).toBe('003-human-feedback.sql');
    expect(migrations[3]!.name).toBe('004-external-examples.sql');
    expect(migrations[4]!.name).toBe('005-roast-farm.sql');
    expect(migrations[5]!.name).toBe('006-human-review.sql');
    expect(migrations[6]!.name).toBe('007-roast-rejected-status.sql');
    expect(migrations[7]!.name).toBe('008-roast-reply-to-id.sql');
    expect(migrations[8]!.name).toBe('009-roast-casual-reply-source.sql');
    expect(migrations[9]!.name).toBe('010-stockpile-remove-rejected.sql');
    expect(migrations[10]!.name).toBe('011-meme-history.sql');
    expect(migrations[11]!.name).toBe('012-conversation-id.sql');
    db.close();
  });

  it('creates all expected tables', () => {
    const db = createDatabase(dbPath, logger);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('roasts');
    expect(tableNames).toContain('mentions');
    expect(tableNames).toContain('queue');
    expect(tableNames).toContain('config');
    expect(tableNames).toContain('tweets_observed');
    expect(tableNames).toContain('target_profiles');
    expect(tableNames).toContain('llm_log');
    expect(tableNames).toContain('engagement_snapshots');
    expect(tableNames).toContain('news_items');
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('human_feedback');
    expect(tableNames).toContain('external_examples');
    expect(tableNames).toContain('roast_patterns');
    expect(tableNames).toContain('farm_targets');
    expect(tableNames).toContain('farm_attempts');
    expect(tableNames).toContain('roast_stockpile');
    expect(tableNames).toContain('meme_history');
    db.close();
  });

  it('creates FTS5 virtual tables', () => {
    const db = createDatabase(dbPath, logger);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts'")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('tweets_fts');
    expect(tableNames).toContain('roasts_fts');
    expect(tableNames).toContain('stockpile_fts');
    db.close();
  });

  it('is idempotent — running twice does not error', () => {
    const db1 = createDatabase(dbPath, logger);
    db1.close();

    const db2 = createDatabase(dbPath, logger);
    const migrations = db2.prepare('SELECT COUNT(*) as count FROM _migrations').get() as { count: number };
    expect(migrations.count).toBe(12);
    db2.close();
  });

  it('inserts default config values', () => {
    const db = createDatabase(dbPath, logger);
    const paused = db.prepare("SELECT value FROM config WHERE key = 'paused'").get() as { value: string };
    expect(paused.value).toBe('false');
    db.close();
  });
});

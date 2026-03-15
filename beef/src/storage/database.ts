import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from 'pino';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

export function createDatabase(dbPath: string, logger: Logger): Database.Database {
  const db = new Database(dbPath);

  // WAL mode: concurrent reads, crash-safe writes
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  runMigrations(db, logger);

  return db;
}

function runMigrations(db: Database.Database, logger: Logger): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((row) => (row as { name: string }).name),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    logger.info({ migration: file }, 'Applying migration');

    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
    })();

    logger.info({ migration: file }, 'Migration applied');
  }
}

export type { Database };

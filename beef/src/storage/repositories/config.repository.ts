import type Database from 'better-sqlite3';
import type { RuntimeConfig } from '@common/types/index.js';

export class ConfigRepository {
  private readonly getStmt: Database.Statement;
  private readonly setStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.getStmt = db.prepare('SELECT value FROM config WHERE key = ?');
    this.setStmt = db.prepare(`
      INSERT INTO config (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);
  }

  get(key: string): string | undefined {
    const row = this.getStmt.get(key) as { value: string } | undefined;
    return row?.value;
  }

  set(key: string, value: string): void {
    this.setStmt.run(key, value);
  }

  getRuntime(): RuntimeConfig {
    return {
      paused: this.get('paused') === 'true',
      dailyLimit: parseInt(this.get('daily_limit') ?? '10', 10),
      mentionSinceId: this.get('mention_since_id') ?? null,
      moderationMode: this.get('moderation_mode') === 'true',
    };
  }

  setPaused(paused: boolean): void {
    this.set('paused', String(paused));
  }

  setMentionSinceId(sinceId: string): void {
    this.set('mention_since_id', sinceId);
  }
}

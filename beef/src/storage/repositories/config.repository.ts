import type Database from 'better-sqlite3';
import type { RuntimeConfig } from '@common/types/index.js';

export interface StyleSupplement {
  text: string;
  computedAt: string;
  sampleSize: number;
}

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
    const approveMode = this.get('approve_mode') === 'true';
    const approveMentionsRaw = this.get('approve_mentions');
    return {
      paused: this.get('paused') === 'true',
      dailyLimit: parseInt(this.get('daily_limit') ?? '10', 10),
      mentionSinceId: this.get('mention_since_id') ?? null,
      moderationMode: this.get('moderation_mode') === 'true',
      approveMode,
      approveMentions: approveMentionsRaw !== undefined ? approveMentionsRaw === 'true' : approveMode,
    };
  }

  setPaused(paused: boolean): void {
    this.set('paused', String(paused));
  }

  setApproveMode(enabled: boolean): void {
    this.set('approve_mode', String(enabled));
  }

  setApproveMentions(enabled: boolean): void {
    this.set('approve_mentions', String(enabled));
  }

  setMentionSinceId(sinceId: string): void {
    this.set('mention_since_id', sinceId);
  }

  getStyleSupplement(): StyleSupplement | null {
    const raw = this.get('style_supplement');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StyleSupplement;
    } catch {
      return null;
    }
  }

  setStyleSupplement(supplement: StyleSupplement): void {
    this.set('style_supplement', JSON.stringify(supplement));
  }
}

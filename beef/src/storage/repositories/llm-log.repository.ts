import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

export interface LlmLogEntry {
  taskId: string;
  taskType: string;
  prompt: string;
  response: string;
  durationMs: number;
}

export interface LlmLogRow {
  id: number;
  task_id: string;
  task_type: string;
  prompt_hash: string;
  response_text: string;
  duration_ms: number;
  created_at: string;
}

export class LlmLogRepository {
  private readonly insertStmt: Database.Statement;
  private readonly recentStmt: Database.Statement;
  private readonly countByTypeStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO llm_log (task_id, task_type, prompt_hash, response_text, duration_ms)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.recentStmt = db.prepare(`
      SELECT * FROM llm_log ORDER BY created_at DESC LIMIT ?
    `);

    this.countByTypeStmt = db.prepare(`
      SELECT task_type, COUNT(*) as count, AVG(duration_ms) as avg_duration
      FROM llm_log
      WHERE created_at >= datetime('now', ?)
      GROUP BY task_type
    `);
  }

  insert(entry: LlmLogEntry): void {
    const hash = createHash('sha256').update(entry.prompt).digest('hex').slice(0, 16);
    this.insertStmt.run(entry.taskId, entry.taskType, hash, entry.response, entry.durationMs);
  }

  getRecent(limit: number): LlmLogRow[] {
    return this.recentStmt.all(limit) as LlmLogRow[];
  }

  getStatsByType(sinceDays: number): Array<{ task_type: string; count: number; avg_duration: number }> {
    return this.countByTypeStmt.all(`-${String(sinceDays)} days`) as Array<{
      task_type: string;
      count: number;
      avg_duration: number;
    }>;
  }
}

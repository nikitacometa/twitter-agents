import type Database from 'better-sqlite3';
import type {
  NewQueueItem,
  QueueItem,
  QueuePriority,
  QueueStatus,
  RoastSource,
  TargetType,
} from '@common/types/index.js';

interface QueueRow {
  id: number;
  target_name: string;
  target_type: string;
  source: string;
  priority: number;
  status: string;
  context: string | null;
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
}

export class QueueRepository {
  private readonly insertStmt: Database.Statement;
  private readonly dequeueStmt: Database.Statement;
  private readonly updateStatusStmt: Database.Statement;
  private readonly failStmt: Database.Statement;
  private readonly pendingCountStmt: Database.Statement;
  private readonly topStmt: Database.Statement;
  private readonly resetProcessingStmt: Database.Statement;
  private readonly rescueMentionsStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO queue (target_name, target_type, source, priority, context)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.dequeueStmt = db.prepare(`
      UPDATE queue
      SET status = 'processing', updated_at = datetime('now')
      WHERE id = (
        SELECT id FROM queue
        WHERE status = 'pending' AND attempts < max_attempts
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
      )
      RETURNING *
    `);

    this.updateStatusStmt = db.prepare(`
      UPDATE queue SET status = ?, updated_at = datetime('now') WHERE id = ?
    `);

    this.failStmt = db.prepare(`
      UPDATE queue
      SET status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'pending' END,
          attempts = attempts + 1,
          error_message = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `);

    this.pendingCountStmt = db.prepare(
      "SELECT COUNT(*) as count FROM queue WHERE status = 'pending'",
    );

    this.topStmt = db.prepare(`
      SELECT * FROM queue WHERE status IN ('pending', 'processing')
      ORDER BY priority DESC, created_at ASC
      LIMIT ?
    `);

    this.resetProcessingStmt = db.prepare(`
      UPDATE queue SET status = 'pending', updated_at = datetime('now')
      WHERE status = 'processing'
    `);

    this.rescueMentionsStmt = db.prepare(`
      UPDATE queue
      SET status = 'pending', attempts = 0, error_message = NULL, updated_at = datetime('now')
      WHERE status = 'failed' AND source IN ('mention', 'casual_reply')
    `);
  }

  enqueue(item: NewQueueItem): number {
    const result = this.insertStmt.run(
      item.targetName,
      item.targetType,
      item.source,
      item.priority,
      item.context ?? null,
    );
    return Number(result.lastInsertRowid);
  }

  dequeue(): QueueItem | undefined {
    const row = this.dequeueStmt.get() as QueueRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  complete(id: number): void {
    this.updateStatusStmt.run('completed', id);
  }

  fail(id: number, errorMessage: string): void {
    this.failStmt.run(errorMessage, id);
  }

  reject(id: number): void {
    this.updateStatusStmt.run('rejected', id);
  }

  getPendingCount(): number {
    const row = this.pendingCountStmt.get() as { count: number };
    return row.count;
  }

  getTop(limit: number): QueueItem[] {
    return (this.topStmt.all(limit) as QueueRow[]).map(mapRow);
  }

  /**
   * Reset items stuck in 'processing' back to 'pending'.
   * Call at startup to recover from crashes.
   */
  resetProcessing(): number {
    const result = this.resetProcessingStmt.run();
    return result.changes;
  }

  /**
   * Rescue permanently failed mention items back to pending.
   * Mentions must always be answered — transient failures shouldn't kill them.
   */
  rescueFailedMentions(): number {
    const result = this.rescueMentionsStmt.run();
    return result.changes;
  }
}

function mapRow(row: QueueRow): QueueItem {
  return {
    id: row.id,
    targetName: row.target_name,
    targetType: row.target_type as TargetType,
    source: row.source as RoastSource,
    priority: row.priority as QueuePriority,
    status: row.status as QueueStatus,
    context: row.context,
    errorMessage: row.error_message,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

import type Database from 'better-sqlite3';
import type { TargetType } from '@common/types/index.js';
import type { FarmTarget, FarmTargetSource, FarmTargetStatus, InsertFarmTarget } from '@farm/types.js';

interface FarmTargetRow {
  id: number;
  name: string;
  type: string;
  source: string;
  priority_score: number;
  reason: string | null;
  status: string;
  created_at: string;
}

export class FarmTargetRepository {
  private readonly insertStmt: Database.Statement;
  private readonly getPendingStmt: Database.Statement;
  private readonly updateStatusStmt: Database.Statement;
  private readonly countByStatusStmt: Database.Statement;
  private readonly findByNameStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO farm_targets (name, type, source, priority_score, reason)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.getPendingStmt = db.prepare(`
      SELECT * FROM farm_targets
      WHERE status = 'pending'
      ORDER BY priority_score DESC
      LIMIT ?
    `);

    this.updateStatusStmt = db.prepare(`
      UPDATE farm_targets SET status = ? WHERE id = ?
    `);

    this.countByStatusStmt = db.prepare(`
      SELECT status, COUNT(*) as count FROM farm_targets GROUP BY status
    `);

    this.findByNameStmt = db.prepare(`
      SELECT * FROM farm_targets WHERE name = ? COLLATE NOCASE ORDER BY created_at DESC LIMIT 1
    `);
  }

  insert(target: InsertFarmTarget): number {
    const result = this.insertStmt.run(
      target.name,
      target.type,
      target.source,
      target.priorityScore,
      target.reason ?? null,
    );
    return Number(result.lastInsertRowid);
  }

  getPending(limit: number): FarmTarget[] {
    return (this.getPendingStmt.all(limit) as FarmTargetRow[]).map(mapRow);
  }

  updateStatus(id: number, status: FarmTargetStatus): void {
    this.updateStatusStmt.run(status, id);
  }

  findByName(name: string): FarmTarget | undefined {
    const row = this.findByNameStmt.get(name) as FarmTargetRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  getCountByStatus(): Record<FarmTargetStatus, number> {
    const rows = this.countByStatusStmt.all() as Array<{ status: string; count: number }>;
    const result: Record<string, number> = { pending: 0, generating: 0, completed: 0, skipped: 0 };
    for (const row of rows) {
      result[row.status] = row.count;
    }
    return result as Record<FarmTargetStatus, number>;
  }
}

function mapRow(row: FarmTargetRow): FarmTarget {
  return {
    id: row.id,
    name: row.name,
    type: row.type as TargetType,
    source: row.source as FarmTargetSource,
    priorityScore: row.priority_score,
    reason: row.reason,
    status: row.status as FarmTargetStatus,
    createdAt: row.created_at,
  };
}

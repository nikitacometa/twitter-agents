import type Database from 'better-sqlite3';
import type { TargetProfile, TargetType } from '@common/types/index.js';

interface TargetRow {
  id: number;
  name: string;
  type: string;
  data: string;
  roast_count: number;
  last_roasted: string | null;
  last_enriched: string;
  updated_at: string;
}

export class TargetRepository {
  private readonly upsertStmt: Database.Statement;
  private readonly getByNameStmt: Database.Statement;
  private readonly incrementRoastStmt: Database.Statement;
  private readonly staleStmt: Database.Statement;
  private readonly allStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.upsertStmt = db.prepare(`
      INSERT INTO target_profiles (name, type, data)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        data = excluded.data,
        last_enriched = datetime('now'),
        updated_at = datetime('now')
    `);

    this.getByNameStmt = db.prepare('SELECT * FROM target_profiles WHERE name = ?');

    this.incrementRoastStmt = db.prepare(`
      UPDATE target_profiles
      SET roast_count = roast_count + 1, last_roasted = datetime('now'), updated_at = datetime('now')
      WHERE name = ?
    `);

    this.staleStmt = db.prepare(`
      SELECT * FROM target_profiles
      WHERE last_enriched < datetime('now', ?)
      ORDER BY last_enriched ASC
      LIMIT ?
    `);

    this.allStmt = db.prepare('SELECT * FROM target_profiles ORDER BY roast_count DESC LIMIT ?');
  }

  upsert(name: string, type: TargetType, data: Record<string, unknown>): void {
    this.upsertStmt.run(name, type, JSON.stringify(data));
  }

  getByName(name: string): TargetProfile | undefined {
    const row = this.getByNameStmt.get(name) as TargetRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  incrementRoastCount(name: string): void {
    this.incrementRoastStmt.run(name);
  }

  getStale(sinceDays: number, limit: number): TargetProfile[] {
    return (this.staleStmt.all(`-${String(sinceDays)} days`, limit) as TargetRow[]).map(mapRow);
  }

  getAll(limit: number): TargetProfile[] {
    return (this.allStmt.all(limit) as TargetRow[]).map(mapRow);
  }
}

function mapRow(row: TargetRow): TargetProfile {
  return {
    id: row.id,
    name: row.name,
    type: row.type as TargetType,
    data: JSON.parse(row.data) as Record<string, unknown>,
    roastCount: row.roast_count,
    lastRoasted: row.last_roasted,
    lastEnriched: row.last_enriched,
    updatedAt: row.updated_at,
  };
}

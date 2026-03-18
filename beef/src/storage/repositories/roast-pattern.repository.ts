import type Database from 'better-sqlite3';
import type { RoastPattern } from '@common/types/index.js';

export interface InsertRoastPattern {
  patternType: 'structure' | 'technique' | 'angle_variant';
  description: string;
  sourceExampleIds: number[];
  effectiveness?: number;
}

interface RoastPatternRow {
  id: number;
  pattern_type: string;
  description: string;
  source_example_ids: string | null;
  frequency: number;
  effectiveness: number | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: RoastPatternRow): RoastPattern {
  let sourceExampleIds: number[] = [];
  if (row.source_example_ids) {
    try {
      sourceExampleIds = JSON.parse(row.source_example_ids) as number[];
    } catch {
      sourceExampleIds = [];
    }
  }

  return {
    id: row.id,
    patternType: row.pattern_type as RoastPattern['patternType'],
    description: row.description,
    sourceExampleIds,
    frequency: row.frequency,
    effectiveness: row.effectiveness,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class RoastPatternRepository {
  private readonly insertStmt: Database.Statement;
  private readonly findByDescriptionStmt: Database.Statement;
  private readonly incrementFrequencyStmt: Database.Statement;
  private readonly getTopStmt: Database.Statement;
  private readonly getByTypeStmt: Database.Statement;
  private readonly countStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO roast_patterns (pattern_type, description, source_example_ids, effectiveness)
      VALUES (?, ?, ?, ?)
    `);

    this.findByDescriptionStmt = db.prepare(
      'SELECT * FROM roast_patterns WHERE description = ?',
    );

    this.incrementFrequencyStmt = db.prepare(`
      UPDATE roast_patterns
      SET frequency = frequency + 1,
          source_example_ids = ?,
          effectiveness = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `);

    this.getTopStmt = db.prepare(`
      SELECT * FROM roast_patterns
      ORDER BY effectiveness DESC, frequency DESC
      LIMIT ?
    `);

    this.getByTypeStmt = db.prepare(
      'SELECT * FROM roast_patterns WHERE pattern_type = ? ORDER BY effectiveness DESC LIMIT ?',
    );

    this.countStmt = db.prepare('SELECT COUNT(*) as count FROM roast_patterns');
  }

  upsert(pattern: InsertRoastPattern): number {
    const existing = this.findByDescriptionStmt.get(pattern.description) as RoastPatternRow | undefined;

    if (existing) {
      const existingIds: number[] = existing.source_example_ids
        ? (JSON.parse(existing.source_example_ids) as number[])
        : [];
      const mergedIds = [...new Set([...existingIds, ...pattern.sourceExampleIds])];
      const avgEffectiveness =
        existing.effectiveness !== null && pattern.effectiveness !== undefined
          ? (existing.effectiveness * existing.frequency + pattern.effectiveness) / (existing.frequency + 1)
          : pattern.effectiveness ?? existing.effectiveness;

      this.incrementFrequencyStmt.run(
        JSON.stringify(mergedIds),
        avgEffectiveness,
        existing.id,
      );
      return existing.id;
    }

    const result = this.insertStmt.run(
      pattern.patternType,
      pattern.description,
      JSON.stringify(pattern.sourceExampleIds),
      pattern.effectiveness ?? null,
    );
    return Number(result.lastInsertRowid);
  }

  getTop(limit: number): RoastPattern[] {
    return (this.getTopStmt.all(limit) as RoastPatternRow[]).map(mapRow);
  }

  getByType(type: RoastPattern['patternType'], limit: number): RoastPattern[] {
    return (this.getByTypeStmt.all(type, limit) as RoastPatternRow[]).map(mapRow);
  }

  getCount(): number {
    return (this.countStmt.get() as { count: number }).count;
  }
}

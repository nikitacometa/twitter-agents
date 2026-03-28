import type Database from 'better-sqlite3';
import type { MemeFormat } from './meme-generator.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InsertMemeHistory {
  templateId: string;
  templateName: string;
  target: string;
  boxes: string[];
  format: MemeFormat;
  imageUrl?: string;
  rationale?: string;
  stockpileId?: number;
  strategy?: string;
  visionScore?: number;
}

interface MemeHistoryRow {
  id: number;
  template_id: string;
  template_name: string;
  target: string;
  boxes: string;
  format: string;
  image_url: string | null;
  rationale: string | null;
  stockpile_id: number | null;
  strategy: string | null;
  vision_score: number | null;
  created_at: string;
}

export interface MemeHistoryEntry {
  id: number;
  templateId: string;
  templateName: string;
  target: string;
  boxes: string[];
  format: MemeFormat;
  imageUrl: string | null;
  rationale: string | null;
  stockpileId: number | null;
  strategy: string | null;
  visionScore: number | null;
  createdAt: string;
}

// ─── Repository ──────────────────────────────────────────────────────────────

export class MemeHistoryRepository {
  private readonly insertStmt: Database.Statement;
  private readonly recentTemplateNamesStmt: Database.Statement;
  private readonly getByTargetStmt: Database.Statement;
  private readonly countStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO meme_history (template_id, template_name, target, boxes, format, image_url, rationale, stockpile_id, strategy, vision_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.recentTemplateNamesStmt = db.prepare(`
      SELECT template_name, last_used FROM (
        SELECT template_name, MAX(created_at) AS last_used
        FROM meme_history
        GROUP BY template_name
        ORDER BY last_used DESC
        LIMIT ?
      ) ORDER BY last_used DESC
    `);

    this.getByTargetStmt = db.prepare(`
      SELECT * FROM meme_history
      WHERE target = ? COLLATE NOCASE
      ORDER BY created_at DESC
      LIMIT ?
    `);

    this.countStmt = db.prepare('SELECT COUNT(*) as count FROM meme_history');
  }

  insert(entry: InsertMemeHistory): number {
    const result = this.insertStmt.run(
      entry.templateId,
      entry.templateName,
      entry.target,
      JSON.stringify(entry.boxes),
      entry.format,
      entry.imageUrl ?? null,
      entry.rationale ?? null,
      entry.stockpileId ?? null,
      entry.strategy ?? null,
      entry.visionScore ?? null,
    );
    return Number(result.lastInsertRowid);
  }

  getRecentTemplateNames(limit: number): string[] {
    return (this.recentTemplateNamesStmt.all(limit) as Array<{ template_name: string }>)
      .map((r) => r.template_name);
  }

  getByTarget(target: string, limit = 10): MemeHistoryEntry[] {
    return (this.getByTargetStmt.all(target, limit) as MemeHistoryRow[]).map(mapRow);
  }

  getCount(): number {
    return (this.countStmt.get() as { count: number }).count;
  }
}

// ─── Mapper ──────────────────────────────────────────────────────────────────

function mapRow(row: MemeHistoryRow): MemeHistoryEntry {
  return {
    id: row.id,
    templateId: row.template_id,
    templateName: row.template_name,
    target: row.target,
    boxes: JSON.parse(row.boxes) as string[],
    format: row.format as MemeFormat,
    imageUrl: row.image_url,
    rationale: row.rationale,
    stockpileId: row.stockpile_id,
    strategy: row.strategy,
    visionScore: row.vision_score,
    createdAt: row.created_at,
  };
}

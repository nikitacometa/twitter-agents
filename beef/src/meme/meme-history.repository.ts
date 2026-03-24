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
      INSERT INTO meme_history (template_id, template_name, target, boxes, format, image_url, rationale)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.recentTemplateNamesStmt = db.prepare(`
      SELECT DISTINCT template_name FROM meme_history
      ORDER BY created_at DESC
      LIMIT ?
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
    createdAt: row.created_at,
  };
}

import type Database from 'better-sqlite3';
import type { ExternalExample, ExternalExampleType, ExampleAnalysis } from '@common/types/index.js';

export interface InsertExternalExample {
  type: ExternalExampleType;
  originalText: string;
  originalAuthor?: string;
  originalUrl?: string;
  roastText: string;
  roastAuthor?: string;
  roastUrl?: string;
  context?: string;
  submitterTelegramId: number;
  submitterScore?: number;
  submitterNotes?: string;
}

interface ExternalExampleRow {
  id: number;
  type: string;
  original_text: string;
  original_author: string | null;
  original_url: string | null;
  roast_text: string;
  roast_author: string | null;
  roast_url: string | null;
  context: string | null;
  submitter_telegram_id: number;
  submitter_score: number | null;
  submitter_notes: string | null;
  analysis: string | null;
  extracted_pattern: string | null;
  classified_angle: string | null;
  specificity_score: number | null;
  created_at: string;
  used_in_prompts: number;
}

function mapRow(row: ExternalExampleRow): ExternalExample {
  let analysis: ExampleAnalysis | null = null;
  if (row.analysis) {
    try {
      analysis = JSON.parse(row.analysis) as ExampleAnalysis;
    } catch {
      analysis = null;
    }
  }

  return {
    id: row.id,
    type: row.type as ExternalExampleType,
    originalText: row.original_text,
    originalAuthor: row.original_author,
    originalUrl: row.original_url,
    roastText: row.roast_text,
    roastAuthor: row.roast_author,
    roastUrl: row.roast_url,
    context: row.context,
    submitterTelegramId: row.submitter_telegram_id,
    submitterScore: row.submitter_score,
    submitterNotes: row.submitter_notes,
    analysis,
    extractedPattern: row.extracted_pattern,
    classifiedAngle: row.classified_angle,
    specificityScore: row.specificity_score,
    createdAt: row.created_at,
    usedInPrompts: row.used_in_prompts,
  };
}

export class ExternalExampleRepository {
  private readonly insertStmt: Database.Statement;
  private readonly updateAnalysisStmt: Database.Statement;
  private readonly getByIdStmt: Database.Statement;
  private readonly getByTypeStmt: Database.Statement;
  private readonly getTopStmt: Database.Statement;
  private readonly getForPromptStmt: Database.Statement;
  private readonly incrementUsageStmt: Database.Statement;
  private readonly countStmt: Database.Statement;
  private readonly countByTypeStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO external_examples
        (type, original_text, original_author, original_url, roast_text, roast_author, roast_url, context, submitter_telegram_id, submitter_score, submitter_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.updateAnalysisStmt = db.prepare(`
      UPDATE external_examples
      SET analysis = ?, extracted_pattern = ?, classified_angle = ?, specificity_score = ?
      WHERE id = ?
    `);

    this.getByIdStmt = db.prepare('SELECT * FROM external_examples WHERE id = ?');

    this.getByTypeStmt = db.prepare(
      'SELECT * FROM external_examples WHERE type = ? ORDER BY created_at DESC LIMIT ?',
    );

    this.getTopStmt = db.prepare(`
      SELECT * FROM external_examples
      WHERE analysis IS NOT NULL AND submitter_score >= ?
      ORDER BY submitter_score DESC, specificity_score DESC
      LIMIT ?
    `);

    this.getForPromptStmt = db.prepare(`
      SELECT * FROM external_examples
      WHERE analysis IS NOT NULL AND classified_angle IS NOT NULL
      ORDER BY submitter_score DESC, used_in_prompts ASC
      LIMIT ?
    `);

    this.incrementUsageStmt = db.prepare(
      'UPDATE external_examples SET used_in_prompts = used_in_prompts + 1 WHERE id = ?',
    );

    this.countStmt = db.prepare('SELECT COUNT(*) as count FROM external_examples');

    this.countByTypeStmt = db.prepare(
      'SELECT type, COUNT(*) as count FROM external_examples GROUP BY type',
    );
  }

  insert(example: InsertExternalExample): number {
    const result = this.insertStmt.run(
      example.type,
      example.originalText,
      example.originalAuthor ?? null,
      example.originalUrl ?? null,
      example.roastText,
      example.roastAuthor ?? null,
      example.roastUrl ?? null,
      example.context ?? null,
      example.submitterTelegramId,
      example.submitterScore ?? null,
      example.submitterNotes ?? null,
    );
    return Number(result.lastInsertRowid);
  }

  updateAnalysis(
    id: number,
    analysis: ExampleAnalysis,
    extractedPattern: string,
    classifiedAngle: string,
    specificityScore: number,
  ): void {
    this.updateAnalysisStmt.run(
      JSON.stringify(analysis),
      extractedPattern,
      classifiedAngle,
      specificityScore,
      id,
    );
  }

  getById(id: number): ExternalExample | undefined {
    const row = this.getByIdStmt.get(id) as ExternalExampleRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  getByType(type: ExternalExampleType, limit: number): ExternalExample[] {
    return (this.getByTypeStmt.all(type, limit) as ExternalExampleRow[]).map(mapRow);
  }

  getTop(minScore: number, limit: number): ExternalExample[] {
    return (this.getTopStmt.all(minScore, limit) as ExternalExampleRow[]).map(mapRow);
  }

  getForPrompt(limit: number): ExternalExample[] {
    return (this.getForPromptStmt.all(limit) as ExternalExampleRow[]).map(mapRow);
  }

  incrementUsage(id: number): void {
    this.incrementUsageStmt.run(id);
  }

  getCount(): number {
    return (this.countStmt.get() as { count: number }).count;
  }

  getCountByType(): Record<string, number> {
    const rows = this.countByTypeStmt.all() as Array<{ type: string; count: number }>;
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.type] = row.count;
    }
    return result;
  }
}

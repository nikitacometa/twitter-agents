import type Database from 'better-sqlite3';
import type {
  StockpiledRoast,
  InsertStockpileRoast,
  FreshnessType,
  StockpileStatus,
} from '@farm/types.js';

interface StockpileRow {
  id: number;
  attempt_id: number | null;
  target_name: string;
  target_type: string;
  tweet_text: string;
  angle: string | null;
  quality_score: number;
  evaluator_output: string | null;
  research_notes: string | null;
  freshness_type: string;
  expires_at: string | null;
  status: string;
  served_at: string | null;
  created_at: string;
  human_score: number | null;
}

export class StockpileRepository {
  private readonly insertStmt: Database.Statement;
  private readonly getByIdStmt: Database.Statement;
  private readonly getAvailableStmt: Database.Statement;
  private readonly markServedStmt: Database.Statement;
  private readonly updateStatusStmt: Database.Statement;
  private readonly pruneExpiredStmt: Database.Statement;
  private readonly countByStatusStmt: Database.Statement;
  private readonly countByTargetStmt: Database.Statement;
  private readonly totalCountStmt: Database.Statement;
  private readonly avgScoreStmt: Database.Statement;
  private readonly topTargetsStmt: Database.Statement;
  private readonly ftsDupeStmt: Database.Statement;
  private readonly exportStmt: Database.Statement;
  private readonly topScoredStmt: Database.Statement;
  private readonly angleDistStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO roast_stockpile
        (attempt_id, target_name, target_type, tweet_text, angle,
         quality_score, evaluator_output, research_notes, freshness_type, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.getByIdStmt = db.prepare('SELECT * FROM roast_stockpile WHERE id = ?');

    this.getAvailableStmt = db.prepare(`
      SELECT * FROM roast_stockpile
      WHERE target_name = ? COLLATE NOCASE
      AND status = 'available'
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY quality_score DESC
      LIMIT ?
    `);

    this.markServedStmt = db.prepare(`
      UPDATE roast_stockpile
      SET status = ?, served_at = datetime('now')
      WHERE id = ?
    `);

    this.updateStatusStmt = db.prepare(`
      UPDATE roast_stockpile SET status = ? WHERE id = ?
    `);

    this.pruneExpiredStmt = db.prepare(`
      UPDATE roast_stockpile
      SET status = 'expired'
      WHERE freshness_type = 'data_dependent'
      AND expires_at IS NOT NULL
      AND expires_at <= datetime('now')
      AND status = 'available'
    `);

    this.countByStatusStmt = db.prepare(`
      SELECT status, COUNT(*) as count FROM roast_stockpile GROUP BY status
    `);

    this.countByTargetStmt = db.prepare(`
      SELECT COUNT(*) as count FROM roast_stockpile
      WHERE target_name = ? COLLATE NOCASE AND status = 'available'
    `);

    this.totalCountStmt = db.prepare('SELECT COUNT(*) as count FROM roast_stockpile');

    this.avgScoreStmt = db.prepare(
      'SELECT AVG(quality_score) as avg FROM roast_stockpile WHERE status = \'available\'',
    );

    this.topTargetsStmt = db.prepare(`
      SELECT
        target_name,
        COUNT(*) as stockpile_count,
        ROUND(AVG(quality_score), 2) as avg_score
      FROM roast_stockpile
      WHERE status = 'available'
      GROUP BY target_name
      ORDER BY stockpile_count DESC
      LIMIT ?
    `);

    this.ftsDupeStmt = db.prepare(`
      SELECT rs.id, rs.target_name, rs.tweet_text
      FROM roast_stockpile rs
      JOIN stockpile_fts fts ON rs.id = fts.rowid
      WHERE stockpile_fts MATCH ?
      AND rs.target_name = ? COLLATE NOCASE
      AND rs.status = 'available'
      LIMIT 5
    `);

    this.exportStmt = db.prepare(`
      SELECT * FROM roast_stockpile
      WHERE status = 'available'
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY quality_score DESC
      LIMIT ?
    `);

    this.topScoredStmt = db.prepare(`
      SELECT * FROM roast_stockpile
      WHERE quality_score >= ?
      ORDER BY quality_score DESC
      LIMIT ?
    `);

    this.angleDistStmt = db.prepare(`
      SELECT angle, COUNT(*) as count
      FROM roast_stockpile
      WHERE angle IS NOT NULL AND status = 'available'
      GROUP BY angle
    `);
  }

  insert(roast: InsertStockpileRoast): number {
    const result = this.insertStmt.run(
      roast.attemptId ?? null,
      roast.targetName,
      roast.targetType,
      roast.tweetText,
      roast.angle ?? null,
      roast.qualityScore,
      roast.evaluatorOutput ?? null,
      roast.researchNotes ?? null,
      roast.freshnessType,
      roast.expiresAt ?? null,
    );
    return Number(result.lastInsertRowid);
  }

  getById(id: number): StockpiledRoast | undefined {
    const row = this.getByIdStmt.get(id) as StockpileRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  getAvailable(targetName: string, limit = 10): StockpiledRoast[] {
    return (this.getAvailableStmt.all(targetName, limit) as StockpileRow[]).map(mapRow);
  }

  /**
   * Find the best available roast for a target.
   * 70% chance: top-scored. 30% chance: random from top 5.
   * Prevents always serving the "safest" roast.
   */
  findBest(targetName: string): StockpiledRoast | undefined {
    const candidates = this.getAvailable(targetName, 10);
    if (candidates.length === 0) return undefined;

    if (Math.random() < 0.7 || candidates.length <= 2) {
      return candidates[0];
    }
    const pool = candidates.slice(0, Math.min(5, candidates.length));
    return pool[Math.floor(Math.random() * pool.length)];
  }

  markServed(id: number, destination: 'bot' | 'landing'): void {
    const status: StockpileStatus = destination === 'bot' ? 'served_bot' : 'served_landing';
    this.markServedStmt.run(status, id);
  }

  updateStatus(id: number, status: StockpileStatus): void {
    this.updateStatusStmt.run(status, id);
  }

  pruneExpired(): number {
    return this.pruneExpiredStmt.run().changes;
  }

  getCountForTarget(targetName: string): number {
    return (this.countByTargetStmt.get(targetName) as { count: number }).count;
  }

  /**
   * Check if text is a near-duplicate of existing stockpile for this target.
   * Uses FTS5 MATCH — tokenized word overlap, not exact match.
   */
  isDuplicate(text: string, targetName: string): boolean {
    // Extract significant words (skip short common words) for FTS query
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3);

    if (words.length === 0) return false;

    // Use top 5 most distinctive words for matching
    const queryTerms = words.slice(0, 5).join(' ');
    try {
      const matches = this.ftsDupeStmt.all(queryTerms, targetName) as Array<{
        id: number;
        target_name: string;
        tweet_text: string;
      }>;
      // Consider duplicate if any match shares >60% word overlap
      for (const match of matches) {
        const matchWords = new Set(
          match.tweet_text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/),
        );
        const originalWords = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
        const overlap = originalWords.filter((w) => matchWords.has(w)).length;
        const overlapRatio = overlap / Math.max(originalWords.length, 1);
        if (overlapRatio > 0.6) return true;
      }
      return false;
    } catch {
      // FTS query can fail on certain inputs — treat as non-duplicate
      return false;
    }
  }

  getTopScored(minScore: number, limit: number): StockpiledRoast[] {
    return (this.topScoredStmt.all(minScore, limit) as StockpileRow[]).map(mapRow);
  }

  getAngleDistribution(): Array<{ angle: string; count: number }> {
    return this.angleDistStmt.all() as Array<{ angle: string; count: number }>;
  }

  getStats(): {
    total: number;
    byStatus: Record<string, number>;
    avgScore: number | null;
  } {
    const total = (this.totalCountStmt.get() as { count: number }).count;
    const statusRows = this.countByStatusStmt.all() as Array<{ status: string; count: number }>;
    const byStatus: Record<string, number> = {};
    for (const row of statusRows) {
      byStatus[row.status] = row.count;
    }
    const avgRow = this.avgScoreStmt.get() as { avg: number | null };
    return { total, byStatus, avgScore: avgRow.avg };
  }

  getTopTargets(limit: number): Array<{ name: string; stockpileCount: number; avgScore: number }> {
    return (
      this.topTargetsStmt.all(limit) as Array<{
        target_name: string;
        stockpile_count: number;
        avg_score: number;
      }>
    ).map((row) => ({
      name: row.target_name,
      stockpileCount: row.stockpile_count,
      avgScore: row.avg_score,
    }));
  }

  getExportable(limit: number): StockpiledRoast[] {
    return (this.exportStmt.all(limit) as StockpileRow[]).map(mapRow);
  }
}

function mapRow(row: StockpileRow): StockpiledRoast {
  return {
    id: row.id,
    attemptId: row.attempt_id,
    targetName: row.target_name,
    targetType: row.target_type,
    tweetText: row.tweet_text,
    angle: row.angle,
    qualityScore: row.quality_score,
    evaluatorOutput: row.evaluator_output,
    researchNotes: row.research_notes,
    freshnessType: row.freshness_type as FreshnessType,
    expiresAt: row.expires_at,
    status: row.status as StockpileStatus,
    servedAt: row.served_at,
    createdAt: row.created_at,
    humanScore: row.human_score,
  };
}

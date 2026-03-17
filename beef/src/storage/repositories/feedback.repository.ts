import type Database from 'better-sqlite3';
import type { HumanVerdict } from '@common/types/index.js';

export interface InsertFeedback {
  sessionId: string;
  variantIndex: number;
  roastText: string;
  targetName: string;
  promptVariant?: string;
  angle?: string;
  llmSelfScore?: number;
  evaluatorTelegramId: number;
  evaluatorName?: string;
  verdict: HumanVerdict;
  notes?: string;
}

export interface FeedbackRow {
  id: number;
  session_id: string;
  variant_index: number;
  roast_text: string;
  target_name: string;
  prompt_variant: string | null;
  angle: string | null;
  llm_self_score: number | null;
  evaluator_telegram_id: number;
  evaluator_name: string | null;
  verdict: string;
  notes: string | null;
  created_at: string;
}

export interface HumanFeedback {
  id: number;
  sessionId: string;
  variantIndex: number;
  roastText: string;
  targetName: string;
  promptVariant: string | null;
  angle: string | null;
  llmSelfScore: number | null;
  evaluatorTelegramId: number;
  evaluatorName: string | null;
  verdict: HumanVerdict;
  notes: string | null;
  createdAt: string;
}

export class FeedbackRepository {
  private readonly insertStmt: Database.Statement;
  private readonly countByVerdictStmt: Database.Statement;
  private readonly topTargetsStmt: Database.Statement;
  private readonly evaluatorStatsStmt: Database.Statement;
  private readonly totalCountStmt: Database.Statement;
  private readonly recentStmt: Database.Statement;
  private readonly bySessionStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO human_feedback
        (session_id, variant_index, roast_text, target_name, prompt_variant, angle, llm_self_score, evaluator_telegram_id, evaluator_name, verdict, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.countByVerdictStmt = db.prepare(`
      SELECT verdict, COUNT(*) as count
      FROM human_feedback
      GROUP BY verdict
    `);

    this.topTargetsStmt = db.prepare(`
      SELECT
        target_name,
        COUNT(*) as total,
        SUM(CASE WHEN verdict = 'fire' THEN 1 ELSE 0 END) as fire_count
      FROM human_feedback
      GROUP BY target_name
      ORDER BY total DESC
      LIMIT ?
    `);

    this.evaluatorStatsStmt = db.prepare(`
      SELECT
        evaluator_name,
        evaluator_telegram_id,
        COUNT(*) as count
      FROM human_feedback
      GROUP BY evaluator_telegram_id
      ORDER BY count DESC
    `);

    this.totalCountStmt = db.prepare('SELECT COUNT(*) as count FROM human_feedback');

    this.recentStmt = db.prepare(
      'SELECT * FROM human_feedback ORDER BY created_at DESC LIMIT ?',
    );

    this.bySessionStmt = db.prepare(
      'SELECT * FROM human_feedback WHERE session_id = ? ORDER BY variant_index, evaluator_telegram_id',
    );
  }

  insert(feedback: InsertFeedback): number {
    const result = this.insertStmt.run(
      feedback.sessionId,
      feedback.variantIndex,
      feedback.roastText,
      feedback.targetName,
      feedback.promptVariant ?? null,
      feedback.angle ?? null,
      feedback.llmSelfScore ?? null,
      feedback.evaluatorTelegramId,
      feedback.evaluatorName ?? null,
      feedback.verdict,
      feedback.notes ?? null,
    );
    return Number(result.lastInsertRowid);
  }

  getStats(): {
    total: number;
    byVerdict: Record<string, number>;
    topTargets: Array<{ target: string; count: number; fireRate: number }>;
    evaluators: Array<{ name: string; count: number }>;
  } {
    const total = (this.totalCountStmt.get() as { count: number }).count;

    const byVerdict: Record<string, number> = {};
    for (const row of this.countByVerdictStmt.all() as Array<{ verdict: string; count: number }>) {
      byVerdict[row.verdict] = row.count;
    }

    const topTargets = (
      this.topTargetsStmt.all(10) as Array<{
        target_name: string;
        total: number;
        fire_count: number;
      }>
    ).map((row) => ({
      target: row.target_name,
      count: row.total,
      fireRate: row.total > 0 ? row.fire_count / row.total : 0,
    }));

    const evaluators = (
      this.evaluatorStatsStmt.all() as Array<{
        evaluator_name: string | null;
        evaluator_telegram_id: number;
        count: number;
      }>
    ).map((row) => ({
      name: row.evaluator_name ?? String(row.evaluator_telegram_id),
      count: row.count,
    }));

    return { total, byVerdict, topTargets, evaluators };
  }

  getBySession(sessionId: string): HumanFeedback[] {
    return (this.bySessionStmt.all(sessionId) as FeedbackRow[]).map(mapRow);
  }

  getRecent(limit: number): HumanFeedback[] {
    return (this.recentStmt.all(limit) as FeedbackRow[]).map(mapRow);
  }
}

function mapRow(row: FeedbackRow): HumanFeedback {
  return {
    id: row.id,
    sessionId: row.session_id,
    variantIndex: row.variant_index,
    roastText: row.roast_text,
    targetName: row.target_name,
    promptVariant: row.prompt_variant,
    angle: row.angle,
    llmSelfScore: row.llm_self_score,
    evaluatorTelegramId: row.evaluator_telegram_id,
    evaluatorName: row.evaluator_name,
    verdict: row.verdict as HumanVerdict,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

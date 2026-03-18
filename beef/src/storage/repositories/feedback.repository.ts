import type Database from 'better-sqlite3';
import type { HumanVerdict, FireExample, AngleUsage, RejectExample } from '@common/types/index.js';

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
  private readonly fireExamplesStmt: Database.Statement;
  private readonly fireExamplesForTargetStmt: Database.Statement;
  private readonly targetSessionCountStmt: Database.Statement;
  private readonly targetAngleHistoryStmt: Database.Statement;
  private readonly anglePerformanceStmt: Database.Statement;
  private readonly rejectExamplesStmt: Database.Statement;
  private readonly fireCharStatsStmt: Database.Statement;
  private readonly rejectCharStatsStmt: Database.Statement;
  private readonly sessionMetricsStmt: Database.Statement;

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

    this.fireExamplesStmt = db.prepare(`
      SELECT roast_text, angle, target_name, MAX(created_at) as latest
      FROM human_feedback
      WHERE verdict = 'fire' AND angle IS NOT NULL AND angle != 'manual'
      GROUP BY roast_text, angle, target_name
      ORDER BY latest DESC
      LIMIT ?
    `);

    this.fireExamplesForTargetStmt = db.prepare(`
      SELECT roast_text, angle, MAX(created_at) as latest
      FROM human_feedback
      WHERE verdict = 'fire' AND target_name = ? COLLATE NOCASE AND angle IS NOT NULL AND angle != 'manual'
      GROUP BY roast_text, angle
      ORDER BY latest DESC
      LIMIT ?
    `);

    this.targetSessionCountStmt = db.prepare(`
      SELECT COUNT(DISTINCT session_id) as count
      FROM human_feedback
      WHERE target_name = ? COLLATE NOCASE AND angle != 'manual'
    `);

    this.targetAngleHistoryStmt = db.prepare(`
      SELECT angle, COUNT(*) as count FROM (
        SELECT DISTINCT session_id, variant_index, angle
        FROM human_feedback
        WHERE target_name = ? COLLATE NOCASE AND angle IS NOT NULL AND angle != 'manual'
      )
      GROUP BY angle
      ORDER BY count DESC
    `);

    this.anglePerformanceStmt = db.prepare(`
      SELECT
        angle,
        COUNT(*) as total,
        SUM(CASE WHEN verdict = 'fire' THEN 1 ELSE 0 END) as fire_count,
        SUM(CASE WHEN verdict = 'reject' THEN 1 ELSE 0 END) as reject_count
      FROM human_feedback
      WHERE angle IS NOT NULL AND angle != 'manual'
      GROUP BY angle
      ORDER BY total DESC
    `);

    this.rejectExamplesStmt = db.prepare(`
      SELECT roast_text, angle, target_name, MAX(created_at) as latest
      FROM human_feedback
      WHERE verdict = 'reject' AND angle IS NOT NULL AND angle != 'manual'
      GROUP BY roast_text, angle, target_name
      ORDER BY latest DESC
      LIMIT ?
    `);

    this.fireCharStatsStmt = db.prepare(`
      SELECT AVG(LENGTH(roast_text)) as avg_len
      FROM human_feedback
      WHERE verdict = 'fire' AND angle IS NOT NULL AND angle != 'manual'
    `);

    this.rejectCharStatsStmt = db.prepare(`
      SELECT AVG(LENGTH(roast_text)) as avg_len
      FROM human_feedback
      WHERE verdict = 'reject' AND angle IS NOT NULL AND angle != 'manual'
    `);

    this.sessionMetricsStmt = db.prepare(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN verdict = 'fire' THEN 1 ELSE 0 END) as fire_count,
        ROUND(CAST(SUM(CASE WHEN verdict = 'fire' THEN 1 ELSE 0 END) AS REAL) / COUNT(*), 3) as fire_rate,
        ROUND(AVG(CASE WHEN llm_self_score IS NOT NULL THEN llm_self_score END), 2) as avg_llm_score
      FROM human_feedback
      WHERE angle IS NOT NULL AND angle != 'manual'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT ?
    `);
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

  getFireExamples(limit: number): FireExample[] {
    return (
      this.fireExamplesStmt.all(limit) as Array<{
        roast_text: string;
        angle: string;
        target_name: string;
      }>
    ).map((row) => ({ text: row.roast_text, angle: row.angle, target: row.target_name }));
  }

  getFireExamplesForTarget(targetName: string, limit: number): FireExample[] {
    return (
      this.fireExamplesForTargetStmt.all(targetName, limit) as Array<{
        roast_text: string;
        angle: string;
      }>
    ).map((row) => ({ text: row.roast_text, angle: row.angle, target: targetName }));
  }

  getTargetSessionCount(targetName: string): number {
    const row = this.targetSessionCountStmt.get(targetName) as { count: number };
    return row.count;
  }

  getTargetAngleHistory(targetName: string): AngleUsage[] {
    return this.targetAngleHistoryStmt.all(targetName) as AngleUsage[];
  }

  getAnglePerformance(): Array<{ angle: string; total: number; fireCount: number; rejectCount: number }> {
    return (
      this.anglePerformanceStmt.all() as Array<{
        angle: string;
        total: number;
        fire_count: number;
        reject_count: number;
      }>
    ).map((row) => ({
      angle: row.angle,
      total: row.total,
      fireCount: row.fire_count,
      rejectCount: row.reject_count,
    }));
  }

  getRejectExamples(limit: number): RejectExample[] {
    return (
      this.rejectExamplesStmt.all(limit) as Array<{
        roast_text: string;
        angle: string;
        target_name: string;
      }>
    ).map((row) => ({ text: row.roast_text, angle: row.angle, target: row.target_name }));
  }

  getFireCharStats(): number | null {
    const row = this.fireCharStatsStmt.get() as { avg_len: number | null } | undefined;
    return row?.avg_len ?? null;
  }

  getRejectCharStats(): number | null {
    const row = this.rejectCharStatsStmt.get() as { avg_len: number | null } | undefined;
    return row?.avg_len ?? null;
  }

  getSessionMetrics(lastN: number): Array<{
    date: string;
    total: number;
    fireCount: number;
    fireRate: number;
    avgLlmScore: number | null;
  }> {
    return (
      this.sessionMetricsStmt.all(lastN) as Array<{
        date: string;
        total: number;
        fire_count: number;
        fire_rate: number;
        avg_llm_score: number | null;
      }>
    ).map((row) => ({
      date: row.date,
      total: row.total,
      fireCount: row.fire_count,
      fireRate: row.fire_rate,
      avgLlmScore: row.avg_llm_score,
    }));
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

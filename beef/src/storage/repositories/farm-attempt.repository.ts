import type Database from 'better-sqlite3';
import type { FarmAttempt, InsertFarmAttempt, PromptStrategy } from '@farm/types.js';

interface FarmAttemptRow {
  id: number;
  target_name: string;
  target_type: string;
  tweet_text: string;
  angle: string | null;
  strategy: string | null;
  mutation_seed: string | null;
  llm_self_score: number | null;
  evaluator_score: number | null;
  evaluator_output: string | null;
  research_notes: string | null;
  fact_check_passed: number;
  agent_output: string | null;
  promoted: number;
  created_at: string;
}

export class FarmAttemptRepository {
  private readonly insertStmt: Database.Statement;
  private readonly getByIdStmt: Database.Statement;
  private readonly getUnevaluatedStmt: Database.Statement;
  private readonly updateScoreStmt: Database.Statement;
  private readonly markPromotedStmt: Database.Statement;
  private readonly pruneOldStmt: Database.Statement;
  private readonly countStmt: Database.Statement;
  private readonly countEvaluatedStmt: Database.Statement;
  private readonly countPromotedStmt: Database.Statement;
  private readonly avgScoreStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO farm_attempts
        (target_name, target_type, tweet_text, angle, strategy, mutation_seed,
         llm_self_score, research_notes, fact_check_passed, agent_output)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.getByIdStmt = db.prepare('SELECT * FROM farm_attempts WHERE id = ?');

    this.getUnevaluatedStmt = db.prepare(`
      SELECT * FROM farm_attempts
      WHERE evaluator_score IS NULL
      ORDER BY created_at ASC
      LIMIT ?
    `);

    this.updateScoreStmt = db.prepare(`
      UPDATE farm_attempts
      SET evaluator_score = ?, evaluator_output = ?
      WHERE id = ?
    `);

    this.markPromotedStmt = db.prepare(`
      UPDATE farm_attempts SET promoted = 1 WHERE id = ?
    `);

    this.pruneOldStmt = db.prepare(`
      DELETE FROM farm_attempts
      WHERE promoted = 0
      AND created_at < datetime('now', ?)
    `);

    this.countStmt = db.prepare('SELECT COUNT(*) as count FROM farm_attempts');

    this.countEvaluatedStmt = db.prepare(
      'SELECT COUNT(*) as count FROM farm_attempts WHERE evaluator_score IS NOT NULL',
    );

    this.countPromotedStmt = db.prepare(
      'SELECT COUNT(*) as count FROM farm_attempts WHERE promoted = 1',
    );

    this.avgScoreStmt = db.prepare(
      'SELECT AVG(evaluator_score) as avg FROM farm_attempts WHERE evaluator_score IS NOT NULL',
    );
  }

  insert(attempt: InsertFarmAttempt): number {
    const result = this.insertStmt.run(
      attempt.targetName,
      attempt.targetType,
      attempt.tweetText,
      attempt.angle ?? null,
      attempt.strategy ?? null,
      attempt.mutationSeed ?? null,
      attempt.llmSelfScore ?? null,
      attempt.researchNotes ?? null,
      attempt.factCheckPassed ? 1 : 0,
      attempt.agentOutput ?? null,
    );
    return Number(result.lastInsertRowid);
  }

  getById(id: number): FarmAttempt | undefined {
    const row = this.getByIdStmt.get(id) as FarmAttemptRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  getUnevaluated(limit: number): FarmAttempt[] {
    return (this.getUnevaluatedStmt.all(limit) as FarmAttemptRow[]).map(mapRow);
  }

  updateScore(id: number, score: number, evaluatorOutput: string): void {
    this.updateScoreStmt.run(score, evaluatorOutput, id);
  }

  markPromoted(id: number): void {
    this.markPromotedStmt.run(id);
  }

  pruneOld(ttlDays: number): number {
    const result = this.pruneOldStmt.run(`-${String(ttlDays)} days`);
    return result.changes;
  }

  getStats(): { total: number; evaluated: number; promoted: number; avgScore: number | null } {
    const total = (this.countStmt.get() as { count: number }).count;
    const evaluated = (this.countEvaluatedStmt.get() as { count: number }).count;
    const promoted = (this.countPromotedStmt.get() as { count: number }).count;
    const avgRow = this.avgScoreStmt.get() as { avg: number | null };
    return { total, evaluated, promoted, avgScore: avgRow.avg };
  }
}

function mapRow(row: FarmAttemptRow): FarmAttempt {
  return {
    id: row.id,
    targetName: row.target_name,
    targetType: row.target_type,
    tweetText: row.tweet_text,
    angle: row.angle,
    strategy: row.strategy as PromptStrategy | null,
    mutationSeed: row.mutation_seed,
    llmSelfScore: row.llm_self_score,
    evaluatorScore: row.evaluator_score,
    evaluatorOutput: row.evaluator_output,
    researchNotes: row.research_notes,
    factCheckPassed: row.fact_check_passed === 1,
    agentOutput: row.agent_output,
    promoted: row.promoted === 1,
    createdAt: row.created_at,
  };
}

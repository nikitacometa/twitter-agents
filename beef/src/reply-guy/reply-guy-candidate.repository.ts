import type Database from 'better-sqlite3';
import type { ScoredTweet } from '../monitor/tweet-scorer.js';
import type { PipelineType } from './types.js';

export interface GenerationMetadata {
  durationMs: number;
  variantsTotal: number;
  variantsFiltered: number;
  runnerUps: Array<{ text: string; score: number; angle?: string; pipeline?: string }>;
  pipelineStats?: Array<{ pipeline: string; status: string; variants?: number; durationMs?: number }>;
}

export class ReplyGuyCandidateRepository {
  private readonly insertStmt: Database.Statement;
  private readonly hasSeenStmt: Database.Statement;
  private readonly markEvaluatedStmt: Database.Statement;
  private readonly markGeneratedStmt: Database.Statement;
  private readonly markGeneratedWithMetaStmt: Database.Statement;
  private readonly markPostedStmt: Database.Statement;
  private readonly markSkippedStmt: Database.Statement;
  private readonly todayCountStmt: Database.Statement;
  private readonly todayPostedCountStmt: Database.Statement;
  private readonly todayMaxCountStmt: Database.Statement;
  private readonly recentAuthorCountStmt: Database.Statement;
  private readonly pruneStmt: Database.Statement;
  private readonly dailyStatsStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT OR IGNORE INTO reply_guy_candidates
        (tweet_id, author_handle, tweet_text, tweet_url, monitor_score, is_reply, tier)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.hasSeenStmt = db.prepare(
      'SELECT 1 FROM reply_guy_candidates WHERE tweet_id = ?',
    );

    this.markEvaluatedStmt = db.prepare(`
      UPDATE reply_guy_candidates
      SET roastability = ?, reasoning = ?, suggested_angle = ?,
          status = 'evaluated', evaluated_at = datetime('now')
      WHERE tweet_id = ?
    `);

    this.markGeneratedStmt = db.prepare(`
      UPDATE reply_guy_candidates
      SET roast_text = ?, roast_score = ?, pipeline_type = ?,
          status = 'generated', generated_at = datetime('now')
      WHERE tweet_id = ?
    `);

    this.markGeneratedWithMetaStmt = db.prepare(`
      UPDATE reply_guy_candidates
      SET roast_text = ?, roast_score = ?, pipeline_type = ?,
          generation_duration_ms = ?, variants_total = ?, variants_filtered = ?,
          runner_ups = ?, pipeline_stats = ?,
          status = 'generated', generated_at = datetime('now')
      WHERE tweet_id = ?
    `);

    this.markPostedStmt = db.prepare(`
      UPDATE reply_guy_candidates
      SET status = 'posted', posted_at = datetime('now'), posted_tweet_id = ?
      WHERE tweet_id = ?
    `);

    this.markSkippedStmt = db.prepare(`
      UPDATE reply_guy_candidates
      SET roastability = ?, reasoning = ?,
          status = 'skipped', evaluated_at = datetime('now')
      WHERE tweet_id = ?
    `);

    this.todayCountStmt = db.prepare(`
      SELECT COUNT(*) as total FROM reply_guy_candidates
      WHERE posted_at >= datetime('now', 'start of day')
        AND status IN ('generated', 'posted')
    `);

    this.todayPostedCountStmt = db.prepare(`
      SELECT COUNT(*) as total FROM reply_guy_candidates
      WHERE status = 'posted'
        AND posted_at >= datetime('now', 'start of day')
    `);

    this.todayMaxCountStmt = db.prepare(`
      SELECT COUNT(*) as total FROM reply_guy_candidates
      WHERE pipeline_type = 'max'
        AND generated_at >= datetime('now', 'start of day')
        AND status IN ('generated', 'posted')
    `);

    this.recentAuthorCountStmt = db.prepare(`
      SELECT COUNT(*) as cnt FROM reply_guy_candidates
      WHERE author_handle = ?
        AND status IN ('generated', 'posted')
        AND created_at >= datetime('now', 'start of day')
    `);

    this.pruneStmt = db.prepare(
      "DELETE FROM reply_guy_candidates WHERE created_at < datetime('now', '-14 days')",
    );

    this.dailyStatsStmt = db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status IN ('generated', 'posted') THEN 1 END) as generated,
        COUNT(CASE WHEN status = 'posted' THEN 1 END) as posted,
        COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped,
        ROUND(AVG(CASE WHEN roastability IS NOT NULL THEN roastability END), 1) as avg_roastability
      FROM reply_guy_candidates
      WHERE created_at >= datetime('now', 'start of day')
    `);
  }

  insert(tweet: ScoredTweet): boolean {
    const result = this.insertStmt.run(
      tweet.tweetId,
      tweet.authorHandle,
      tweet.text,
      tweet.tweetUrl,
      tweet.score,
      tweet.isReply ? 1 : 0,
      tweet.tier,
    );
    return result.changes > 0;
  }

  hasSeen(tweetId: string): boolean {
    return this.hasSeenStmt.get(tweetId) !== undefined;
  }

  markEvaluated(tweetId: string, roastability: number, reasoning: string, angle: string | null): void {
    this.markEvaluatedStmt.run(roastability, reasoning, angle, tweetId);
  }

  markGenerated(tweetId: string, roastText: string, roastScore: number, pipelineType: PipelineType = 'max'): void {
    this.markGeneratedStmt.run(roastText, roastScore, pipelineType, tweetId);
  }

  markGeneratedWithMetadata(
    tweetId: string,
    roastText: string,
    roastScore: number,
    pipelineType: PipelineType,
    metadata: GenerationMetadata,
  ): void {
    this.markGeneratedWithMetaStmt.run(
      roastText,
      roastScore,
      pipelineType,
      metadata.durationMs,
      metadata.variantsTotal,
      metadata.variantsFiltered,
      JSON.stringify(metadata.runnerUps),
      metadata.pipelineStats ? JSON.stringify(metadata.pipelineStats) : null,
      tweetId,
    );
  }

  markPosted(tweetId: string, postedTweetId: string | null): void {
    this.markPostedStmt.run(postedTweetId, tweetId);
  }

  markSkipped(tweetId: string, roastability: number, reasoning: string): void {
    this.markSkippedStmt.run(roastability, reasoning, tweetId);
  }

  getTodayCount(): number {
    const row = this.todayCountStmt.get() as { total: number };
    return row.total;
  }

  getTodayPostedCount(): number {
    const row = this.todayPostedCountStmt.get() as { total: number };
    return row.total;
  }

  getTodayMaxCount(): number {
    const row = this.todayMaxCountStmt.get() as { total: number };
    return row.total;
  }

  getRecentAuthorCount(authorHandle: string): number {
    const row = this.recentAuthorCountStmt.get(authorHandle) as { cnt: number };
    return row.cnt;
  }

  pruneOld(): number {
    return this.pruneStmt.run().changes;
  }

  getDailyStats(): { total: number; generated: number; posted: number; skipped: number; avgRoastability: number | null } {
    const row = this.dailyStatsStmt.get() as {
      total: number;
      generated: number;
      posted: number;
      skipped: number;
      avg_roastability: number | null;
    };
    return {
      total: row.total,
      generated: row.generated,
      posted: row.posted,
      skipped: row.skipped,
      avgRoastability: row.avg_roastability,
    };
  }
}

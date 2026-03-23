import type Database from 'better-sqlite3';
import type { PostedRoast, RoastSource, RoastStatus, TargetType } from '@common/types/index.js';

export interface InsertRoast {
  targetName: string;
  targetType: TargetType;
  tweetText: string;
  tweetId?: string;
  replyToId?: string;
  source: RoastSource;
  status?: RoastStatus;
  factChecked?: boolean;
  contextData?: string;
  agentOutput?: string;
}

interface RoastRow {
  id: number;
  target_name: string;
  target_type: string;
  tweet_text: string;
  tweet_id: string | null;
  reply_to_id: string | null;
  source: string;
  status: string;
  fact_checked: number;
  context_data: string | null;
  agent_output: string | null;
  created_at: string;
  likes: number;
  retweets: number;
  replies: number;
  impressions: number;
}

export class RoastRepository {
  private readonly insertStmt: Database.Statement;
  private readonly getByIdStmt: Database.Statement;
  private readonly recentStmt: Database.Statement;
  private readonly todayCountStmt: Database.Statement;
  private readonly updateEngagementStmt: Database.Statement;
  private readonly updateStatusStmt: Database.Statement;
  private readonly searchStmt: Database.Statement;
  private readonly findRecentByTargetStmt: Database.Statement;
  private readonly totalCountStmt: Database.Statement;
  private readonly totalLikesStmt: Database.Statement;
  private readonly pendingApprovalStmt: Database.Statement;
  private readonly rejectDuplicatePendingStmt: Database.Statement;
  private readonly existsReplyToStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO roasts (target_name, target_type, tweet_text, tweet_id, reply_to_id, source, status, fact_checked, context_data, agent_output)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.getByIdStmt = db.prepare('SELECT * FROM roasts WHERE id = ?');

    this.recentStmt = db.prepare(
      'SELECT * FROM roasts WHERE status = ? ORDER BY created_at DESC LIMIT ?',
    );

    this.todayCountStmt = db.prepare(`
      SELECT COUNT(*) as count FROM roasts
      WHERE created_at >= datetime('now', 'start of day')
      AND source = ?
      AND status = 'posted'
    `);

    this.updateEngagementStmt = db.prepare(`
      UPDATE roasts SET likes = ?, retweets = ?, replies = ?, impressions = ?
      WHERE id = ?
    `);

    this.updateStatusStmt = db.prepare(`
      UPDATE roasts SET status = ?, tweet_id = ? WHERE id = ?
    `);

    this.searchStmt = db.prepare(`
      SELECT r.* FROM roasts r
      JOIN roasts_fts fts ON r.id = fts.rowid
      WHERE roasts_fts MATCH ?
      ORDER BY r.created_at DESC
      LIMIT ?
    `);

    this.findRecentByTargetStmt = db.prepare(`
      SELECT id, tweet_id, status FROM roasts
      WHERE target_name = ? AND source = ?
      AND created_at >= datetime('now', '-1 hour')
      ORDER BY created_at DESC LIMIT 1
    `);

    this.totalCountStmt = db.prepare(
      "SELECT COUNT(*) as count FROM roasts WHERE status = 'posted'",
    );

    this.totalLikesStmt = db.prepare(
      "SELECT COALESCE(SUM(likes), 0) as total FROM roasts WHERE status = 'posted'",
    );

    this.pendingApprovalStmt = db.prepare(
      "SELECT * FROM roasts WHERE status = 'pending_approval' ORDER BY created_at DESC",
    );

    this.rejectDuplicatePendingStmt = db.prepare(`
      UPDATE roasts SET status = 'rejected'
      WHERE status = 'pending_approval'
      AND id NOT IN (
        SELECT MAX(id) FROM roasts WHERE status = 'pending_approval' GROUP BY target_name
      )
    `);

    this.existsReplyToStmt = db.prepare(`
      SELECT 1 FROM roasts
      WHERE reply_to_id = ? AND status IN ('posted', 'pending_approval')
      LIMIT 1
    `);
  }

  insert(roast: InsertRoast): number {
    const result = this.insertStmt.run(
      roast.targetName,
      roast.targetType,
      roast.tweetText,
      roast.tweetId ?? null,
      roast.replyToId ?? null,
      roast.source,
      roast.status ?? 'posted',
      roast.factChecked ? 1 : 0,
      roast.contextData ?? null,
      roast.agentOutput ?? null,
    );
    return Number(result.lastInsertRowid);
  }

  getById(id: number): PostedRoast | undefined {
    const row = this.getByIdStmt.get(id) as RoastRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  getRecent(limit: number, status: RoastStatus = 'posted'): PostedRoast[] {
    return (this.recentStmt.all(status, limit) as RoastRow[]).map(mapRow);
  }

  getTodayCount(source: RoastSource): number {
    const row = this.todayCountStmt.get(source) as { count: number };
    return row.count;
  }

  updateEngagement(
    id: number,
    engagement: { likes: number; retweets: number; replies: number; impressions: number },
  ): void {
    this.updateEngagementStmt.run(
      engagement.likes,
      engagement.retweets,
      engagement.replies,
      engagement.impressions,
      id,
    );
  }

  updateStatus(id: number, status: RoastStatus, tweetId?: string): void {
    this.updateStatusStmt.run(status, tweetId ?? null, id);
  }

  searchByText(query: string, limit = 10): PostedRoast[] {
    return (this.searchStmt.all(query, limit) as RoastRow[]).map(mapRow);
  }

  findRecentByTarget(
    targetName: string,
    source: string,
  ): { id: number; tweetId: string | null; status: string } | undefined {
    return this.findRecentByTargetStmt.get(targetName, source) as
      | { id: number; tweetId: string | null; status: string }
      | undefined;
  }

  getTotalCount(): number {
    return (this.totalCountStmt.get() as { count: number }).count;
  }

  getTotalLikes(): number {
    return (this.totalLikesStmt.get() as { total: number }).total;
  }

  getPendingApproval(): PostedRoast[] {
    return (this.pendingApprovalStmt.all() as RoastRow[]).map(mapRow);
  }

  /**
   * Check if the bot has already replied to a specific tweet (posted or pending approval).
   * Used to prevent duplicate replies to the same thread.
   */
  existsReplyTo(replyToId: string): boolean {
    return !!this.existsReplyToStmt.get(replyToId);
  }

  /**
   * Reject duplicate pending_approval roasts — keep only the latest per target.
   * Returns count of rejected duplicates.
   */
  rejectDuplicatePending(): number {
    return this.rejectDuplicatePendingStmt.run().changes;
  }
}

function mapRow(row: RoastRow): PostedRoast {
  return {
    id: row.id,
    targetName: row.target_name,
    targetType: row.target_type as TargetType,
    tweetText: row.tweet_text,
    tweetId: row.tweet_id,
    replyToId: row.reply_to_id,
    source: row.source as RoastSource,
    status: row.status as RoastStatus,
    factChecked: row.fact_checked === 1,
    contextData: row.context_data,
    agentOutput: row.agent_output,
    createdAt: row.created_at,
    likes: row.likes,
    retweets: row.retweets,
    replies: row.replies,
    impressions: row.impressions,
  };
}

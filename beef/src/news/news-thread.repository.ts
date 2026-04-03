import type Database from 'better-sqlite3';
import type { NewsThread, InsertNewsThread, ThreadTweet } from './types.js';

interface NewsThreadRow {
  id: number;
  thread_data: string;
  scheduled_at: string;
  status: string;
  posted_at: string | null;
  root_tweet_id: string | null;
  tweet_ids: string | null;
  digest_id: number | null;
  created_at: string;
}

export class NewsThreadRepository {
  private readonly db: Database.Database;
  private readonly insertStmt: Database.Statement;
  private readonly getByIdStmt: Database.Statement;
  private readonly getPendingStmt: Database.Statement;
  private readonly getDraftStmt: Database.Statement;
  private readonly updateStatusStmt: Database.Statement;
  private readonly markPostedStmt: Database.Statement;
  private readonly cancelOldDraftsStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;

    this.insertStmt = db.prepare(`
      INSERT INTO news_threads (thread_data, scheduled_at, status, digest_id)
      VALUES (?, ?, ?, ?)
    `);

    this.getByIdStmt = db.prepare(`
      SELECT * FROM news_threads WHERE id = ?
    `);

    this.getPendingStmt = db.prepare(`
      SELECT * FROM news_threads
      WHERE status = 'pending' AND scheduled_at <= datetime('now')
      ORDER BY scheduled_at ASC
      LIMIT 1
    `);

    this.getDraftStmt = db.prepare(`
      SELECT * FROM news_threads
      WHERE status = 'draft'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    this.updateStatusStmt = db.prepare(`
      UPDATE news_threads SET status = ? WHERE id = ?
    `);

    this.markPostedStmt = db.prepare(`
      UPDATE news_threads
      SET status = 'posted', posted_at = datetime('now'), root_tweet_id = ?, tweet_ids = ?
      WHERE id = ?
    `);

    this.cancelOldDraftsStmt = db.prepare(`
      UPDATE news_threads SET status = 'cancelled'
      WHERE status = 'draft' AND created_at < datetime('now', '-24 hours')
    `);
  }

  insert(thread: InsertNewsThread): number {
    const result = this.insertStmt.run(
      JSON.stringify(thread.tweets),
      thread.scheduledAt,
      thread.status ?? 'draft',
      thread.digestId ?? null,
    );
    return Number(result.lastInsertRowid);
  }

  getById(id: number): NewsThread | undefined {
    const row = this.getByIdStmt.get(id) as NewsThreadRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  /** Get the next thread ready to post (status=pending, scheduled_at <= now). */
  getPendingForNow(): NewsThread | undefined {
    const row = this.getPendingStmt.get() as NewsThreadRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  /** Get the latest draft (for re-presenting to user). */
  getLatestDraft(): NewsThread | undefined {
    const row = this.getDraftStmt.get() as NewsThreadRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  updateStatus(id: number, status: 'pending' | 'cancelled' | 'failed'): void {
    this.updateStatusStmt.run(status, id);
  }

  schedule(id: number, scheduledAt: string): void {
    this.db.prepare(`
      UPDATE news_threads SET status = 'pending', scheduled_at = ? WHERE id = ?
    `).run(scheduledAt, id);
  }

  markPosted(id: number, tweetIds: string[]): void {
    const rootTweetId = tweetIds[0] ?? null;
    this.markPostedStmt.run(rootTweetId, JSON.stringify(tweetIds), id);
  }

  cancelOldDrafts(): number {
    return this.cancelOldDraftsStmt.run().changes;
  }

  /** Check if a thread was already posted today. */
  hasPostedToday(): boolean {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count FROM news_threads
      WHERE status = 'posted' AND posted_at >= datetime('now', '-20 hours')
    `).get() as { count: number };
    return row.count > 0;
  }
}

function mapRow(row: NewsThreadRow): NewsThread {
  return {
    id: row.id,
    tweets: JSON.parse(row.thread_data) as ThreadTweet[],
    scheduledAt: row.scheduled_at,
    status: row.status as NewsThread['status'],
    postedAt: row.posted_at,
    rootTweetId: row.root_tweet_id,
    tweetIds: row.tweet_ids ? (JSON.parse(row.tweet_ids) as string[]) : [],
    digestId: row.digest_id,
    createdAt: row.created_at,
  };
}

import type Database from 'better-sqlite3';
import type { Mention, MentionRequestType } from '@common/types/index.js';

interface MentionRow {
  id: number;
  tweet_id: string;
  author_id: string;
  author_name: string;
  text: string;
  request_type: string | null;
  processed: number;
  response_id: string | null;
  created_at: string;
}

export class MentionRepository {
  private readonly insertStmt: Database.Statement;
  private readonly markProcessedStmt: Database.Statement;
  private readonly unprocessedStmt: Database.Statement;
  private readonly existsStmt: Database.Statement;
  private readonly getByTweetIdStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT OR IGNORE INTO mentions (tweet_id, author_id, author_name, text, request_type)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.markProcessedStmt = db.prepare(`
      UPDATE mentions SET processed = 1, response_id = ? WHERE tweet_id = ?
    `);

    this.unprocessedStmt = db.prepare(`
      SELECT * FROM mentions WHERE processed = 0 ORDER BY created_at ASC LIMIT ?
    `);

    this.existsStmt = db.prepare('SELECT 1 FROM mentions WHERE tweet_id = ?');
    this.getByTweetIdStmt = db.prepare('SELECT * FROM mentions WHERE tweet_id = ?');
  }

  insert(mention: {
    tweetId: string;
    authorId: string;
    authorName: string;
    text: string;
    requestType?: MentionRequestType;
  }): void {
    this.insertStmt.run(
      mention.tweetId,
      mention.authorId,
      mention.authorName,
      mention.text,
      mention.requestType ?? null,
    );
  }

  markProcessed(tweetId: string, responseId?: string): void {
    this.markProcessedStmt.run(responseId ?? null, tweetId);
  }

  getUnprocessed(limit: number): Mention[] {
    return (this.unprocessedStmt.all(limit) as MentionRow[]).map(mapRow);
  }

  exists(tweetId: string): boolean {
    return this.existsStmt.get(tweetId) !== undefined;
  }

  getByTweetId(tweetId: string): Mention | undefined {
    const row = this.getByTweetIdStmt.get(tweetId) as MentionRow | undefined;
    return row ? mapRow(row) : undefined;
  }
}

function mapRow(row: MentionRow): Mention {
  return {
    id: row.id,
    tweetId: row.tweet_id,
    authorId: row.author_id,
    authorName: row.author_name,
    text: row.text,
    requestType: row.request_type as MentionRequestType | null,
    processed: row.processed === 1,
    responseId: row.response_id,
    createdAt: row.created_at,
  };
}

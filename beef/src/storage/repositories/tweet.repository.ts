import type Database from 'better-sqlite3';
import type { ObservedTweet, TweetMetrics, TweetSource } from '@common/types/index.js';

interface TweetRow {
  id: number;
  tweet_id: string;
  author_id: string;
  author_name: string;
  text: string;
  source: string;
  metrics: string | null;
  created_at: string;
  observed_at: string;
}

export class TweetRepository {
  private readonly insertStmt: Database.Statement;
  private readonly existsStmt: Database.Statement;
  private readonly getByTweetIdStmt: Database.Statement;
  private readonly byAuthorStmt: Database.Statement;
  private readonly searchStmt: Database.Statement;
  private readonly recentStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT OR IGNORE INTO tweets_observed (tweet_id, author_id, author_name, text, source, metrics, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.existsStmt = db.prepare('SELECT 1 FROM tweets_observed WHERE tweet_id = ?');
    this.getByTweetIdStmt = db.prepare('SELECT * FROM tweets_observed WHERE tweet_id = ?');

    this.byAuthorStmt = db.prepare(`
      SELECT * FROM tweets_observed WHERE author_id = ? ORDER BY created_at DESC LIMIT ?
    `);

    this.searchStmt = db.prepare(`
      SELECT t.* FROM tweets_observed t
      JOIN tweets_fts fts ON t.id = fts.rowid
      WHERE tweets_fts MATCH ?
      ORDER BY t.created_at DESC
      LIMIT ?
    `);

    this.recentStmt = db.prepare(
      'SELECT * FROM tweets_observed ORDER BY observed_at DESC LIMIT ?',
    );
  }

  insert(tweet: {
    tweetId: string;
    authorId: string;
    authorName: string;
    text: string;
    source: TweetSource;
    metrics?: TweetMetrics;
    createdAt: string;
  }): void {
    this.insertStmt.run(
      tweet.tweetId,
      tweet.authorId,
      tweet.authorName,
      tweet.text,
      tweet.source,
      tweet.metrics ? JSON.stringify(tweet.metrics) : null,
      tweet.createdAt,
    );
  }

  exists(tweetId: string): boolean {
    return this.existsStmt.get(tweetId) !== undefined;
  }

  getByTweetId(tweetId: string): ObservedTweet | undefined {
    const row = this.getByTweetIdStmt.get(tweetId) as TweetRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  getByAuthor(authorId: string, limit: number): ObservedTweet[] {
    return (this.byAuthorStmt.all(authorId, limit) as TweetRow[]).map(mapRow);
  }

  searchByText(query: string, limit = 10): ObservedTweet[] {
    return (this.searchStmt.all(query, limit) as TweetRow[]).map(mapRow);
  }

  getRecent(limit: number): ObservedTweet[] {
    return (this.recentStmt.all(limit) as TweetRow[]).map(mapRow);
  }
}

function mapRow(row: TweetRow): ObservedTweet {
  return {
    id: row.id,
    tweetId: row.tweet_id,
    authorId: row.author_id,
    authorName: row.author_name,
    text: row.text,
    source: row.source as TweetSource,
    metrics: row.metrics ? (JSON.parse(row.metrics) as TweetMetrics) : null,
    createdAt: row.created_at,
    observedAt: row.observed_at,
  };
}

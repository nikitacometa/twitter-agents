import type Database from 'better-sqlite3';
import type { TwitterUser } from '@common/types/index.js';

interface UserRow {
  id: number;
  twitter_id: string;
  username: string;
  display_name: string | null;
  follower_count: number | null;
  bio_summary: string | null;
  interaction_count: number;
  first_seen: string;
  last_seen: string;
  notes: string | null;
}

export class UserRepository {
  private readonly upsertStmt: Database.Statement;
  private readonly getByTwitterIdStmt: Database.Statement;
  private readonly incrementInteractionStmt: Database.Statement;
  private readonly topInteractorsStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.upsertStmt = db.prepare(`
      INSERT INTO users (twitter_id, username, display_name, follower_count, bio_summary)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(twitter_id) DO UPDATE SET
        username = excluded.username,
        display_name = COALESCE(excluded.display_name, users.display_name),
        follower_count = COALESCE(excluded.follower_count, users.follower_count),
        bio_summary = COALESCE(excluded.bio_summary, users.bio_summary),
        last_seen = datetime('now')
    `);

    this.getByTwitterIdStmt = db.prepare('SELECT * FROM users WHERE twitter_id = ?');

    this.incrementInteractionStmt = db.prepare(`
      UPDATE users
      SET interaction_count = interaction_count + 1, last_seen = datetime('now')
      WHERE twitter_id = ?
    `);

    this.topInteractorsStmt = db.prepare(`
      SELECT * FROM users ORDER BY interaction_count DESC LIMIT ?
    `);
  }

  upsert(user: {
    twitterId: string;
    username: string;
    displayName?: string;
    followerCount?: number;
    bioSummary?: string;
  }): void {
    this.upsertStmt.run(
      user.twitterId,
      user.username,
      user.displayName ?? null,
      user.followerCount ?? null,
      user.bioSummary ?? null,
    );
  }

  getByTwitterId(twitterId: string): TwitterUser | undefined {
    const row = this.getByTwitterIdStmt.get(twitterId) as UserRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  incrementInteraction(twitterId: string): void {
    this.incrementInteractionStmt.run(twitterId);
  }

  getTopInteractors(limit: number): TwitterUser[] {
    return (this.topInteractorsStmt.all(limit) as UserRow[]).map(mapRow);
  }
}

function mapRow(row: UserRow): TwitterUser {
  return {
    id: row.id,
    twitterId: row.twitter_id,
    username: row.username,
    displayName: row.display_name,
    followerCount: row.follower_count,
    bioSummary: row.bio_summary,
    interactionCount: row.interaction_count,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    notes: row.notes,
  };
}

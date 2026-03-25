import type Database from 'better-sqlite3';

export class MonitorRepository {
  private readonly hasSeenStmt: Database.Statement;
  private readonly markSeenStmt: Database.Statement;
  private readonly pruneStmt: Database.Statement;
  private readonly insertApiUsageStmt: Database.Statement;
  private readonly monthlyReadsStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.hasSeenStmt = db.prepare(
      'SELECT 1 FROM timeline_monitor_seen WHERE tweet_id = ?',
    );

    this.markSeenStmt = db.prepare(`
      INSERT OR IGNORE INTO timeline_monitor_seen (tweet_id, author_handle, score, notified)
      VALUES (?, ?, ?, ?)
    `);

    this.pruneStmt = db.prepare(
      "DELETE FROM timeline_monitor_seen WHERE seen_at < datetime('now', '-30 days')",
    );

    this.insertApiUsageStmt = db.prepare(
      "INSERT INTO api_usage_log (source, endpoint, reads_used) VALUES ('timeline_monitor', 'search/recent', ?)",
    );

    this.monthlyReadsStmt = db.prepare(
      "SELECT COALESCE(SUM(reads_used), 0) as total FROM api_usage_log WHERE called_at >= datetime('now', 'start of month')",
    );
  }

  hasSeen(tweetId: string): boolean {
    return this.hasSeenStmt.get(tweetId) !== undefined;
  }

  markSeen(tweetId: string, authorHandle: string, score: number, notified: boolean): void {
    this.markSeenStmt.run(tweetId, authorHandle, score, notified ? 1 : 0);
  }

  pruneOld(): number {
    return this.pruneStmt.run().changes;
  }

  logApiUsage(tweetsReturned: number): void {
    this.insertApiUsageStmt.run(tweetsReturned);
  }

  getMonthlyReads(): number {
    const row = this.monthlyReadsStmt.get() as { total: number };
    return row.total;
  }
}

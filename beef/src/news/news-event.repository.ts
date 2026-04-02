import type Database from 'better-sqlite3';
import type { NewsEvent, InsertNewsEvent, NewsDigest, InsertNewsDigest } from './types.js';

interface NewsEventRow {
  id: number;
  tweet_id: string;
  author_handle: string;
  author_tier: string;
  tweet_text: string;
  tweet_url: string;
  monitor_score: number;
  followers_k: number;
  is_reply: number;
  story_id: string | null;
  story_label: string | null;
  roastability: number | null;
  used_in_digest: number;
  created_at: string;
}

interface NewsDigestRow {
  id: number;
  stories_found: number;
  stories_selected: number;
  variants_generated: number;
  variants_filtered: number;
  variants_evaluated: number;
  roasts_sent: number;
  top_story: string | null;
  top_score: number | null;
  research_summary: string | null;
  duration_ms: number;
  created_at: string;
}

export class NewsEventRepository {
  private readonly db: Database.Database;
  private readonly upsertStmt: Database.Statement;
  private readonly getRecentStmt: Database.Statement;
  private readonly getUnusedRecentStmt: Database.Statement;
  private readonly markUsedStmt: Database.Statement;
  private readonly pruneStmt: Database.Statement;
  private readonly countRecentStmt: Database.Statement;
  private readonly insertDigestStmt: Database.Statement;
  private readonly getLastDigestStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.upsertStmt = db.prepare(`
      INSERT INTO news_events
        (tweet_id, author_handle, author_tier, tweet_text, tweet_url, monitor_score, followers_k, is_reply)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tweet_id) DO UPDATE SET
        monitor_score = MAX(news_events.monitor_score, excluded.monitor_score)
    `);

    this.getRecentStmt = db.prepare(`
      SELECT * FROM news_events
      WHERE created_at >= datetime('now', ?)
      ORDER BY monitor_score DESC
      LIMIT ?
    `);

    this.getUnusedRecentStmt = db.prepare(`
      SELECT * FROM news_events
      WHERE created_at >= datetime('now', ?)
      AND used_in_digest = 0
      ORDER BY monitor_score DESC
      LIMIT ?
    `);

    this.markUsedStmt = db.prepare(`
      UPDATE news_events SET used_in_digest = 1 WHERE tweet_id = ?
    `);

    this.pruneStmt = db.prepare(
      "DELETE FROM news_events WHERE created_at < datetime('now', '-14 days')",
    );

    this.countRecentStmt = db.prepare(
      "SELECT COUNT(*) as count FROM news_events WHERE created_at >= datetime('now', ?)",
    );

    this.insertDigestStmt = db.prepare(`
      INSERT INTO news_digests
        (stories_found, stories_selected, variants_generated, variants_filtered,
         variants_evaluated, roasts_sent, top_story, top_score, research_summary, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.getLastDigestStmt = db.prepare(`
      SELECT * FROM news_digests ORDER BY created_at DESC LIMIT 1
    `);
  }

  upsert(event: InsertNewsEvent): void {
    this.upsertStmt.run(
      event.tweetId,
      event.authorHandle,
      event.authorTier,
      event.tweetText,
      event.tweetUrl,
      event.monitorScore,
      event.followersK,
      event.isReply ? 1 : 0,
    );
  }

  getRecent(hoursBack: number = 24, limit: number = 100): NewsEvent[] {
    const offset = `-${String(hoursBack)} hours`;
    return (this.getRecentStmt.all(offset, limit) as NewsEventRow[]).map(mapEventRow);
  }

  getUnusedRecent(hoursBack: number = 24, limit: number = 100): NewsEvent[] {
    const offset = `-${String(hoursBack)} hours`;
    return (this.getUnusedRecentStmt.all(offset, limit) as NewsEventRow[]).map(mapEventRow);
  }

  markUsed(tweetIds: string[]): void {
    if (tweetIds.length === 0) return;
    this.db.transaction(() => {
      for (const id of tweetIds) {
        this.markUsedStmt.run(id);
      }
    })();
  }

  countRecent(hoursBack: number = 24): number {
    const offset = `-${String(hoursBack)} hours`;
    return (this.countRecentStmt.get(offset) as { count: number }).count;
  }

  pruneOld(): number {
    return this.pruneStmt.run().changes;
  }

  insertDigest(digest: InsertNewsDigest): number {
    const result = this.insertDigestStmt.run(
      digest.storiesFound,
      digest.storiesSelected,
      digest.variantsGenerated,
      digest.variantsFiltered,
      digest.variantsEvaluated,
      digest.roastsSent,
      digest.topStory ?? null,
      digest.topScore ?? null,
      digest.researchSummary ?? null,
      digest.durationMs,
    );
    return Number(result.lastInsertRowid);
  }

  getLastDigest(): NewsDigest | undefined {
    const row = this.getLastDigestStmt.get() as NewsDigestRow | undefined;
    return row ? mapDigestRow(row) : undefined;
  }
}

function mapEventRow(row: NewsEventRow): NewsEvent {
  return {
    id: row.id,
    tweetId: row.tweet_id,
    authorHandle: row.author_handle,
    authorTier: row.author_tier as NewsEvent['authorTier'],
    tweetText: row.tweet_text,
    tweetUrl: row.tweet_url,
    monitorScore: row.monitor_score,
    followersK: row.followers_k,
    isReply: row.is_reply === 1,
    storyId: row.story_id,
    storyLabel: row.story_label,
    roastability: row.roastability,
    usedInDigest: row.used_in_digest === 1,
    createdAt: row.created_at,
  };
}

function mapDigestRow(row: NewsDigestRow): NewsDigest {
  return {
    id: row.id,
    storiesFound: row.stories_found,
    storiesSelected: row.stories_selected,
    variantsGenerated: row.variants_generated,
    variantsFiltered: row.variants_filtered,
    variantsEvaluated: row.variants_evaluated,
    roastsSent: row.roasts_sent,
    topStory: row.top_story,
    topScore: row.top_score,
    researchSummary: row.research_summary,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

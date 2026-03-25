import type Database from 'better-sqlite3';

// --- Types ---

export interface BotTweetRow {
  id: number;
  tweet_id: string;
  text: string;
  created_at: string;
  conversation_id: string | null;
  in_reply_to_tweet_id: string | null;
  in_reply_to_user_id: string | null;
  referenced_tweet_id: string | null;
  referenced_tweet_type: string | null;
  entities: string | null;
  likes: number;
  retweets: number;
  replies: number;
  impressions: number;
  quotes: number;
  bookmarks: number;
  engagement_rate: number | null;
  roast_id: number | null;
  twitter_status: string;
  metrics_updated_at: string | null;
  first_seen_at: string;
  hour_of_day: number | null;
  day_of_week: number | null;
  tweet_length: number | null;
  is_reply: number;
  is_quote: number;
  has_media: number;
  has_link: number;
  has_mention: number;
}

export interface InsertBotTweet {
  tweetId: string;
  text: string;
  createdAt: string;
  conversationId?: string;
  inReplyToTweetId?: string;
  inReplyToUserId?: string;
  referencedTweetId?: string;
  referencedTweetType?: 'replied_to' | 'quoted' | 'retweeted';
  entities?: string;
  roastId?: number;
  isReply: boolean;
  isQuote: boolean;
  hasMedia: boolean;
  hasLink: boolean;
  hasMention: boolean;
}

export interface TweetMetricsUpdate {
  tweetId: string;
  likes: number;
  retweets: number;
  replies: number;
  impressions: number;
  quotes: number;
  bookmarks: number;
}

export interface DailyMetricsRow {
  date: string;
  tweets_posted: number;
  replies_posted: number;
  total_likes: number;
  total_retweets: number;
  total_replies_recv: number;
  total_impressions: number;
  total_quotes: number;
  total_bookmarks: number;
  avg_engagement_rate: number | null;
  best_tweet_id: string | null;
  worst_tweet_id: string | null;
  tweets_deleted: number;
  followers: number | null;
}

export interface AccountSnapshot {
  followers: number;
  following: number;
  tweetCount: number;
  listedCount: number;
}

// --- Repository ---

export class MetricsRepository {
  private readonly insertBotTweetStmt: Database.Statement;
  private readonly upsertBotTweetStmt: Database.Statement;
  private readonly getBotTweetByIdStmt: Database.Statement;
  private readonly getAllLiveTweetIdsStmt: Database.Statement;
  private readonly updateMetricsStmt: Database.Statement;
  private readonly markDeletedStmt: Database.Statement;
  private readonly insertSnapshotStmt: Database.Statement;
  private readonly insertAccountSnapshotStmt: Database.Statement;
  private readonly insertApiUsageStmt: Database.Statement;
  private readonly backfillRoastsStmt: Database.Statement;
  private readonly linkRoastIdStmt: Database.Statement;
  private readonly configGetStmt: Database.Statement;
  private readonly configSetStmt: Database.Statement;
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;

    this.insertBotTweetStmt = db.prepare(`
      INSERT OR IGNORE INTO bot_tweets (
        tweet_id, text, created_at, conversation_id,
        in_reply_to_tweet_id, in_reply_to_user_id,
        referenced_tweet_id, referenced_tweet_type, entities,
        roast_id, is_reply, is_quote, has_media, has_link, has_mention,
        hour_of_day, day_of_week, tweet_length
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.upsertBotTweetStmt = db.prepare(`
      INSERT INTO bot_tweets (
        tweet_id, text, created_at, conversation_id,
        in_reply_to_tweet_id, in_reply_to_user_id,
        referenced_tweet_id, referenced_tweet_type, entities,
        roast_id, is_reply, is_quote, has_media, has_link, has_mention,
        hour_of_day, day_of_week, tweet_length
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tweet_id) DO UPDATE SET
        text = excluded.text,
        entities = excluded.entities,
        roast_id = COALESCE(excluded.roast_id, bot_tweets.roast_id)
    `);

    this.getBotTweetByIdStmt = db.prepare('SELECT * FROM bot_tweets WHERE tweet_id = ?');

    this.getAllLiveTweetIdsStmt = db.prepare(
      "SELECT tweet_id, metrics_updated_at, created_at FROM bot_tweets WHERE twitter_status = 'live' ORDER BY created_at DESC",
    );

    this.updateMetricsStmt = db.prepare(`
      UPDATE bot_tweets SET
        likes = ?, retweets = ?, replies = ?, impressions = ?,
        quotes = ?, bookmarks = ?,
        engagement_rate = CASE WHEN ? > 0
          THEN ROUND(CAST(? + ? + ? + ? AS REAL) / ?, 6)
          ELSE NULL END,
        metrics_updated_at = datetime('now')
      WHERE tweet_id = ?
    `);

    this.markDeletedStmt = db.prepare(
      "UPDATE bot_tweets SET twitter_status = 'deleted', metrics_updated_at = datetime('now') WHERE tweet_id = ?",
    );

    this.insertSnapshotStmt = db.prepare(`
      INSERT INTO bot_tweet_snapshots (tweet_id, likes, retweets, replies, impressions, quotes, bookmarks)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.insertAccountSnapshotStmt = db.prepare(`
      INSERT INTO bot_account_snapshots (followers, following, tweet_count, listed_count)
      VALUES (?, ?, ?, ?)
    `);

    this.insertApiUsageStmt = db.prepare(`
      INSERT INTO api_usage_log (source, endpoint, reads_used) VALUES (?, ?, ?)
    `);

    this.backfillRoastsStmt = db.prepare(`
      UPDATE roasts SET
        likes = ?, retweets = ?, replies = ?, impressions = ?
      WHERE tweet_id = ?
    `);

    this.linkRoastIdStmt = db.prepare(`
      UPDATE bot_tweets SET roast_id = (
        SELECT id FROM roasts WHERE roasts.tweet_id = bot_tweets.tweet_id
        AND roasts.tweet_id IS NOT NULL AND roasts.tweet_id NOT LIKE 'dry_%'
        LIMIT 1
      ) WHERE bot_tweets.tweet_id = ? AND bot_tweets.roast_id IS NULL
    `);

    this.configGetStmt = db.prepare('SELECT value FROM config WHERE key = ?');
    this.configSetStmt = db.prepare(`
      INSERT INTO config (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);
  }

  // --- Config helpers ---

  getConfig(key: string): string | undefined {
    const row = this.configGetStmt.get(key) as { value: string } | undefined;
    return row?.value;
  }

  setConfig(key: string, value: string): void {
    this.configSetStmt.run(key, value);
  }

  // --- Bot tweets ---

  insertBotTweet(tweet: InsertBotTweet): void {
    const dt = new Date(tweet.createdAt);
    this.insertBotTweetStmt.run(
      tweet.tweetId,
      tweet.text,
      tweet.createdAt,
      tweet.conversationId ?? null,
      tweet.inReplyToTweetId ?? null,
      tweet.inReplyToUserId ?? null,
      tweet.referencedTweetId ?? null,
      tweet.referencedTweetType ?? null,
      tweet.entities ?? null,
      tweet.roastId ?? null,
      tweet.isReply ? 1 : 0,
      tweet.isQuote ? 1 : 0,
      tweet.hasMedia ? 1 : 0,
      tweet.hasLink ? 1 : 0,
      tweet.hasMention ? 1 : 0,
      dt.getUTCHours(),
      dt.getUTCDay(),
      tweet.text.length,
    );
  }

  upsertBotTweet(tweet: InsertBotTweet): void {
    const dt = new Date(tweet.createdAt);
    this.upsertBotTweetStmt.run(
      tweet.tweetId,
      tweet.text,
      tweet.createdAt,
      tweet.conversationId ?? null,
      tweet.inReplyToTweetId ?? null,
      tweet.inReplyToUserId ?? null,
      tweet.referencedTweetId ?? null,
      tweet.referencedTweetType ?? null,
      tweet.entities ?? null,
      tweet.roastId ?? null,
      tweet.isReply ? 1 : 0,
      tweet.isQuote ? 1 : 0,
      tweet.hasMedia ? 1 : 0,
      tweet.hasLink ? 1 : 0,
      tweet.hasMention ? 1 : 0,
      dt.getUTCHours(),
      dt.getUTCDay(),
      tweet.text.length,
    );
  }

  getBotTweet(tweetId: string): BotTweetRow | undefined {
    return this.getBotTweetByIdStmt.get(tweetId) as BotTweetRow | undefined;
  }

  getAllLiveTweets(): Array<{ tweet_id: string; metrics_updated_at: string | null; created_at: string }> {
    return this.getAllLiveTweetIdsStmt.all() as Array<{
      tweet_id: string;
      metrics_updated_at: string | null;
      created_at: string;
    }>;
  }

  // --- Metrics update ---

  updateTweetMetrics(m: TweetMetricsUpdate): void {
    this.updateMetricsStmt.run(
      m.likes, m.retweets, m.replies, m.impressions,
      m.quotes, m.bookmarks,
      m.impressions, // CASE WHEN check
      m.likes, m.retweets, m.replies, m.quotes, m.impressions, // numerator + denominator
      m.tweetId,
    );
  }

  insertSnapshot(m: TweetMetricsUpdate): void {
    this.insertSnapshotStmt.run(
      m.tweetId, m.likes, m.retweets, m.replies, m.impressions, m.quotes, m.bookmarks,
    );
  }

  backfillRoast(tweetId: string, likes: number, retweets: number, replies: number, impressions: number): void {
    this.backfillRoastsStmt.run(likes, retweets, replies, impressions, tweetId);
  }

  markDeleted(tweetId: string): void {
    this.markDeletedStmt.run(tweetId);
  }

  linkRoastId(tweetId: string): void {
    this.linkRoastIdStmt.run(tweetId);
  }

  // --- Account snapshots ---

  insertAccountSnapshot(snap: AccountSnapshot): void {
    this.insertAccountSnapshotStmt.run(snap.followers, snap.following, snap.tweetCount, snap.listedCount);
  }

  getLatestAccountSnapshot(): AccountSnapshot | undefined {
    const row = this.db
      .prepare('SELECT followers, following, tweet_count, listed_count FROM bot_account_snapshots ORDER BY captured_at DESC LIMIT 1')
      .get() as { followers: number; following: number; tweet_count: number; listed_count: number } | undefined;
    if (!row) return undefined;
    return { followers: row.followers, following: row.following, tweetCount: row.tweet_count, listedCount: row.listed_count };
  }

  // --- API usage ---

  logApiUsage(source: string, endpoint: string, readsUsed: number): void {
    this.insertApiUsageStmt.run(source, endpoint, readsUsed);
  }

  getMonthlyApiReads(): number {
    const row = this.db
      .prepare("SELECT COALESCE(SUM(reads_used), 0) as total FROM api_usage_log WHERE called_at >= datetime('now', 'start of month')")
      .get() as { total: number };
    return row.total;
  }

  // --- Daily metrics (full recompute) ---

  recomputeDailyMetrics(): void {
    const latestFollowers = this.db
      .prepare('SELECT followers FROM bot_account_snapshots ORDER BY captured_at DESC LIMIT 1')
      .get() as { followers: number } | undefined;

    this.db.exec("DELETE FROM daily_metrics");

    this.db.prepare(`
      INSERT INTO daily_metrics (
        date, tweets_posted, replies_posted,
        total_likes, total_retweets, total_replies_recv,
        total_impressions, total_quotes, total_bookmarks,
        avg_engagement_rate, best_tweet_id, worst_tweet_id, tweets_deleted
      )
      SELECT
        date(created_at) as date,
        COUNT(*) as tweets_posted,
        SUM(is_reply) as replies_posted,
        SUM(likes) as total_likes,
        SUM(retweets) as total_retweets,
        SUM(replies) as total_replies_recv,
        SUM(impressions) as total_impressions,
        SUM(quotes) as total_quotes,
        SUM(bookmarks) as total_bookmarks,
        AVG(CASE WHEN engagement_rate IS NOT NULL THEN engagement_rate END) as avg_engagement_rate,
        (SELECT bt2.tweet_id FROM bot_tweets bt2
         WHERE date(bt2.created_at) = date(bot_tweets.created_at)
         AND bt2.impressions > 0
         ORDER BY bt2.engagement_rate DESC LIMIT 1) as best_tweet_id,
        (SELECT bt3.tweet_id FROM bot_tweets bt3
         WHERE date(bt3.created_at) = date(bot_tweets.created_at)
         AND bt3.impressions > 0
         ORDER BY bt3.engagement_rate ASC LIMIT 1) as worst_tweet_id,
        SUM(CASE WHEN twitter_status = 'deleted' THEN 1 ELSE 0 END) as tweets_deleted
      FROM bot_tweets
      GROUP BY date(created_at)
      ORDER BY date
    `).run();

    if (latestFollowers) {
      this.db
        .prepare("UPDATE daily_metrics SET followers = ? WHERE date = date('now')")
        .run(latestFollowers.followers);
    }
  }

  // --- Analytics queries ---

  getTweetStats(): {
    total: number;
    live: number;
    deleted: number;
    totalImpressions: number;
    totalLikes: number;
    avgEngagementRate: number | null;
  } {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN twitter_status = 'live' THEN 1 ELSE 0 END) as live,
        SUM(CASE WHEN twitter_status = 'deleted' THEN 1 ELSE 0 END) as deleted,
        COALESCE(SUM(impressions), 0) as total_impressions,
        COALESCE(SUM(likes), 0) as total_likes,
        AVG(CASE WHEN engagement_rate IS NOT NULL THEN engagement_rate END) as avg_er
      FROM bot_tweets
    `).get() as { total: number; live: number; deleted: number; total_impressions: number; total_likes: number; avg_er: number | null };
    return {
      total: row.total,
      live: row.live,
      deleted: row.deleted,
      totalImpressions: row.total_impressions,
      totalLikes: row.total_likes,
      avgEngagementRate: row.avg_er,
    };
  }

  getRecentDailyMetrics(days: number): DailyMetricsRow[] {
    return this.db.prepare(`
      SELECT * FROM daily_metrics
      WHERE date >= date('now', '-' || ? || ' days')
      ORDER BY date DESC
    `).all(days) as DailyMetricsRow[];
  }

  getTopTweets(limit: number, days?: number): BotTweetRow[] {
    const where = days
      ? "WHERE impressions > 0 AND twitter_status = 'live' AND created_at >= datetime('now', '-' || ? || ' days')"
      : "WHERE impressions > 0 AND twitter_status = 'live'";
    const params = days ? [days, limit] : [limit];
    return this.db.prepare(`
      SELECT * FROM bot_tweets ${where}
      ORDER BY engagement_rate DESC LIMIT ?
    `).all(...params) as BotTweetRow[];
  }

  getWorstTweets(limit: number, days?: number): BotTweetRow[] {
    const where = days
      ? "WHERE impressions > 0 AND twitter_status = 'live' AND created_at >= datetime('now', '-' || ? || ' days')"
      : "WHERE impressions > 0 AND twitter_status = 'live'";
    const params = days ? [days, limit] : [limit];
    return this.db.prepare(`
      SELECT * FROM bot_tweets ${where}
      ORDER BY engagement_rate ASC LIMIT ?
    `).all(...params) as BotTweetRow[];
  }

  getSuppressedTweets(): BotTweetRow[] {
    return this.db.prepare(`
      WITH cohort_medians AS (
        SELECT is_reply,
          AVG(impressions) as median_impressions
        FROM (
          SELECT is_reply, impressions,
            ROW_NUMBER() OVER (PARTITION BY is_reply ORDER BY impressions) as rn,
            COUNT(*) OVER (PARTITION BY is_reply) as cnt
          FROM bot_tweets
          WHERE twitter_status = 'live'
            AND impressions > 0
            AND created_at < datetime('now', '-6 hours')
        )
        WHERE rn BETWEEN cnt * 0.4 + 1 AND cnt * 0.6 + 1
        GROUP BY is_reply
      )
      SELECT bt.* FROM bot_tweets bt
      JOIN cohort_medians cm ON bt.is_reply = cm.is_reply
      WHERE bt.twitter_status = 'live'
        AND bt.created_at < datetime('now', '-6 hours')
        AND bt.metrics_updated_at IS NOT NULL
        AND bt.impressions < cm.median_impressions * 0.2
      ORDER BY bt.impressions ASC
    `).all() as BotTweetRow[];
  }

  getEngagementByHour(): Array<{ hour: number; avg_er: number; count: number }> {
    return this.db.prepare(`
      SELECT hour_of_day as hour,
        AVG(engagement_rate) as avg_er,
        COUNT(*) as count
      FROM bot_tweets
      WHERE engagement_rate IS NOT NULL AND twitter_status = 'live'
      GROUP BY hour_of_day
      ORDER BY avg_er DESC
    `).all() as Array<{ hour: number; avg_er: number; count: number }>;
  }

  getEngagementByType(): Array<{ is_reply: number; avg_er: number; avg_impressions: number; count: number }> {
    return this.db.prepare(`
      SELECT is_reply,
        AVG(engagement_rate) as avg_er,
        AVG(impressions) as avg_impressions,
        COUNT(*) as count
      FROM bot_tweets
      WHERE engagement_rate IS NOT NULL AND twitter_status = 'live'
      GROUP BY is_reply
    `).all() as Array<{ is_reply: number; avg_er: number; avg_impressions: number; count: number }>;
  }

  getDeletedTweets(): BotTweetRow[] {
    return this.db.prepare(
      "SELECT * FROM bot_tweets WHERE twitter_status = 'deleted' ORDER BY created_at DESC",
    ).all() as BotTweetRow[];
  }
}

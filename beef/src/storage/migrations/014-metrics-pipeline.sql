-- Metrics pipeline: bot tweet tracking, engagement time-series, daily aggregates, API budget.

-- Track API read budget across the entire application
CREATE TABLE api_usage_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source      TEXT NOT NULL,
    endpoint    TEXT NOT NULL,
    reads_used  INTEGER NOT NULL,
    called_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_api_usage_called ON api_usage_log(called_at);

-- Bot account-level snapshots (followers over time)
CREATE TABLE bot_account_snapshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    followers     INTEGER NOT NULL,
    following     INTEGER NOT NULL,
    tweet_count   INTEGER NOT NULL,
    listed_count  INTEGER NOT NULL,
    captured_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Bot tweets as seen by Twitter API (source of truth for what's live on Twitter)
CREATE TABLE bot_tweets (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id               TEXT NOT NULL UNIQUE,
    text                   TEXT NOT NULL,
    created_at             TEXT NOT NULL,
    -- Threading
    conversation_id        TEXT,
    in_reply_to_tweet_id   TEXT,
    in_reply_to_user_id    TEXT,
    referenced_tweet_id    TEXT,
    referenced_tweet_type  TEXT CHECK (referenced_tweet_type IN ('replied_to', 'quoted', 'retweeted')),
    -- Raw entities from Twitter (urls, mentions, hashtags, cashtags as JSON)
    entities               TEXT,
    -- Metrics (latest snapshot)
    likes                  INTEGER NOT NULL DEFAULT 0,
    retweets               INTEGER NOT NULL DEFAULT 0,
    replies                INTEGER NOT NULL DEFAULT 0,
    impressions            INTEGER NOT NULL DEFAULT 0,
    quotes                 INTEGER NOT NULL DEFAULT 0,
    bookmarks              INTEGER NOT NULL DEFAULT 0,
    -- Derived (NULL when impressions = 0)
    engagement_rate        REAL,
    -- Link to internal roast record
    roast_id               INTEGER REFERENCES roasts(id),
    -- Status
    twitter_status         TEXT NOT NULL DEFAULT 'live'
                           CHECK (twitter_status IN ('live', 'deleted', 'suspended', 'withheld')),
    metrics_updated_at     TEXT,
    first_seen_at          TEXT NOT NULL DEFAULT (datetime('now')),
    -- Pre-computed for analysis (extracted from created_at on insert)
    hour_of_day            INTEGER,
    day_of_week            INTEGER,
    tweet_length           INTEGER,
    is_reply               INTEGER NOT NULL DEFAULT 0,
    is_quote               INTEGER NOT NULL DEFAULT 0,
    has_media              INTEGER NOT NULL DEFAULT 0,
    has_link               INTEGER NOT NULL DEFAULT 0,
    has_mention            INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_bot_tweets_created ON bot_tweets(created_at);
CREATE INDEX idx_bot_tweets_status  ON bot_tweets(twitter_status);
CREATE INDEX idx_bot_tweets_metrics ON bot_tweets(metrics_updated_at);
CREATE INDEX idx_bot_tweets_roast   ON bot_tweets(roast_id);

-- Time-series engagement snapshots for bot tweets
CREATE TABLE bot_tweet_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id    TEXT NOT NULL,
    likes       INTEGER NOT NULL,
    retweets    INTEGER NOT NULL,
    replies     INTEGER NOT NULL,
    impressions INTEGER NOT NULL,
    quotes      INTEGER NOT NULL DEFAULT 0,
    bookmarks   INTEGER NOT NULL DEFAULT 0,
    captured_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tweet_id) REFERENCES bot_tweets(tweet_id)
);

CREATE INDEX idx_bts_tweet_time ON bot_tweet_snapshots(tweet_id, captured_at);

-- Daily aggregated metrics (fully recomputed from bot_tweets each sync)
CREATE TABLE daily_metrics (
    date                TEXT NOT NULL PRIMARY KEY,
    tweets_posted       INTEGER NOT NULL DEFAULT 0,
    replies_posted      INTEGER NOT NULL DEFAULT 0,
    total_likes         INTEGER NOT NULL DEFAULT 0,
    total_retweets      INTEGER NOT NULL DEFAULT 0,
    total_replies_recv  INTEGER NOT NULL DEFAULT 0,
    total_impressions   INTEGER NOT NULL DEFAULT 0,
    total_quotes        INTEGER NOT NULL DEFAULT 0,
    total_bookmarks     INTEGER NOT NULL DEFAULT 0,
    avg_engagement_rate REAL,
    best_tweet_id       TEXT,
    worst_tweet_id      TEXT,
    tweets_deleted      INTEGER NOT NULL DEFAULT 0,
    followers           INTEGER,
    computed_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cached LLM analysis results
CREATE TABLE metrics_analysis (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis_type   TEXT NOT NULL CHECK (analysis_type IN
                      ('weekly_review', 'shadowban_check', 'content_strategy', 'anomaly')),
    period_start    TEXT NOT NULL,
    period_end      TEXT NOT NULL,
    summary         TEXT NOT NULL,
    recommendations TEXT,
    raw_data        TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

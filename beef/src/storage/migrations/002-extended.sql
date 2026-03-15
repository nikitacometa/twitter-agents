-- Knowledge + learning tables (rev.2)

-- All tweets we observe (mentions, search, reply-guy targets, engagement tracking)
CREATE TABLE tweets_observed (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id      TEXT NOT NULL UNIQUE,
    author_id     TEXT NOT NULL,
    author_name   TEXT NOT NULL,
    text          TEXT NOT NULL,
    source        TEXT NOT NULL CHECK (source IN ('mention_poll', 'search', 'reply_guy', 'engagement_track')),
    metrics       TEXT,
    created_at    TEXT NOT NULL,
    observed_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Accumulated knowledge about each target (learning loop)
CREATE TABLE target_profiles (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL UNIQUE,
    type          TEXT NOT NULL,
    data          TEXT NOT NULL,
    roast_count   INTEGER NOT NULL DEFAULT 0,
    last_roasted  TEXT,
    last_enriched TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- LLM call log — every provider invocation
CREATE TABLE llm_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id       TEXT NOT NULL,
    task_type     TEXT NOT NULL,
    prompt_hash   TEXT NOT NULL,
    response_text TEXT NOT NULL,
    duration_ms   INTEGER NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Engagement time series (hourly snapshots)
CREATE TABLE engagement_snapshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    roast_id      INTEGER NOT NULL REFERENCES roasts(id),
    likes         INTEGER NOT NULL,
    retweets      INTEGER NOT NULL,
    replies       INTEGER NOT NULL,
    impressions   INTEGER NOT NULL,
    captured_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- All news items processed (dedup + historical context)
CREATE TABLE news_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    source        TEXT NOT NULL,
    title         TEXT,
    content       TEXT NOT NULL,
    url           TEXT,
    relevance     REAL,
    used_for_roast INTEGER,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- People who interact with us (relationship tracking)
CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    twitter_id    TEXT NOT NULL UNIQUE,
    username      TEXT NOT NULL,
    display_name  TEXT,
    follower_count INTEGER,
    bio_summary   TEXT,
    interaction_count INTEGER NOT NULL DEFAULT 0,
    first_seen    TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen     TEXT NOT NULL DEFAULT (datetime('now')),
    notes         TEXT
);

-- Full-text search indexes
CREATE VIRTUAL TABLE tweets_fts USING fts5(text, content=tweets_observed, content_rowid=id);
CREATE VIRTUAL TABLE roasts_fts USING fts5(tweet_text, content=roasts, content_rowid=id);

-- FTS triggers: keep FTS in sync with source tables
CREATE TRIGGER tweets_fts_insert AFTER INSERT ON tweets_observed BEGIN
    INSERT INTO tweets_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER tweets_fts_delete AFTER DELETE ON tweets_observed BEGIN
    INSERT INTO tweets_fts(tweets_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;

CREATE TRIGGER roasts_fts_insert AFTER INSERT ON roasts BEGIN
    INSERT INTO roasts_fts(rowid, tweet_text) VALUES (new.id, new.tweet_text);
END;

CREATE TRIGGER roasts_fts_delete AFTER DELETE ON roasts BEGIN
    INSERT INTO roasts_fts(roasts_fts, rowid, tweet_text) VALUES ('delete', old.id, old.tweet_text);
END;

-- Regular indexes
CREATE INDEX idx_roasts_target ON roasts(target_name);
CREATE INDEX idx_roasts_created ON roasts(created_at);
CREATE INDEX idx_roasts_source ON roasts(source);
CREATE INDEX idx_mentions_processed ON mentions(processed);
CREATE INDEX idx_queue_status ON queue(status, priority DESC);
CREATE INDEX idx_tweets_author ON tweets_observed(author_id);
CREATE INDEX idx_tweets_created ON tweets_observed(created_at);
CREATE INDEX idx_target_name ON target_profiles(name);
CREATE INDEX idx_llm_type ON llm_log(task_type, created_at);
CREATE INDEX idx_engagement_roast ON engagement_snapshots(roast_id);
CREATE INDEX idx_news_source ON news_items(source, created_at);
CREATE INDEX idx_users_twitter ON users(twitter_id);

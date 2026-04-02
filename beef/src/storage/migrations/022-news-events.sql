-- News roast pipeline: accumulated monitor tweets + digest run logs.

CREATE TABLE IF NOT EXISTS news_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id        TEXT NOT NULL UNIQUE,
    author_handle   TEXT NOT NULL,
    author_tier     TEXT NOT NULL CHECK (author_tier IN ('S', 'A', 'B', 'C')),
    tweet_text      TEXT NOT NULL,
    tweet_url       TEXT NOT NULL,
    monitor_score   INTEGER NOT NULL,
    followers_k     INTEGER NOT NULL,
    is_reply        INTEGER NOT NULL DEFAULT 0,
    -- Story clustering (filled by Phase 2)
    story_id        TEXT,
    story_label     TEXT,
    roastability    INTEGER,
    -- Lifecycle
    used_in_digest  INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_news_events_created ON news_events(created_at);
CREATE INDEX IF NOT EXISTS idx_news_events_score ON news_events(monitor_score DESC);

CREATE TABLE IF NOT EXISTS news_digests (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    stories_found       INTEGER NOT NULL,
    stories_selected    INTEGER NOT NULL,
    variants_generated  INTEGER NOT NULL,
    variants_filtered   INTEGER NOT NULL,
    variants_evaluated  INTEGER NOT NULL,
    roasts_sent         INTEGER NOT NULL,
    top_story           TEXT,
    top_score           REAL,
    research_summary    TEXT,
    duration_ms         INTEGER NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

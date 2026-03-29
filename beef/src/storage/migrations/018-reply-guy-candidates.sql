-- Reply guy: candidate tracking for autonomous reply pipeline.

CREATE TABLE reply_guy_candidates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id        TEXT NOT NULL UNIQUE,
    author_handle   TEXT NOT NULL,
    tweet_text      TEXT NOT NULL,
    tweet_url       TEXT NOT NULL,
    monitor_score   INTEGER NOT NULL,
    is_reply        INTEGER NOT NULL DEFAULT 0,
    tier            TEXT NOT NULL,
    roastability    INTEGER,
    reasoning       TEXT,
    suggested_angle TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','evaluated','selected','generated','posted','skipped')),
    roast_text      TEXT,
    roast_score     REAL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    evaluated_at    TEXT,
    generated_at    TEXT,
    posted_at       TEXT,
    posted_tweet_id TEXT
);

CREATE INDEX idx_rg_status ON reply_guy_candidates(status);
CREATE INDEX idx_rg_created ON reply_guy_candidates(created_at);
CREATE INDEX idx_rg_author ON reply_guy_candidates(author_handle);

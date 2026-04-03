-- Scheduled news threads for daily roast posting.

CREATE TABLE IF NOT EXISTS news_threads (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_data     TEXT NOT NULL,       -- JSON array of ThreadTweet
    scheduled_at    TEXT NOT NULL,       -- ISO timestamp: when to post
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK(status IN ('draft', 'pending', 'posted', 'cancelled', 'failed')),
    posted_at       TEXT,               -- when actually posted
    root_tweet_id   TEXT,               -- first tweet ID after posting
    tweet_ids       TEXT,               -- JSON array of posted tweet IDs
    digest_id       INTEGER,            -- reference to news_digests
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_news_threads_status ON news_threads(status);
CREATE INDEX IF NOT EXISTS idx_news_threads_scheduled ON news_threads(scheduled_at);

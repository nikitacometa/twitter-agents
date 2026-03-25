-- Timeline monitor: dedup table for tracking seen tweets from monitored accounts.

CREATE TABLE timeline_monitor_seen (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id      TEXT NOT NULL UNIQUE,
    author_handle TEXT NOT NULL,
    score         INTEGER NOT NULL DEFAULT 0,
    notified      INTEGER NOT NULL DEFAULT 0,
    seen_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_monitor_seen_at ON timeline_monitor_seen(seen_at);

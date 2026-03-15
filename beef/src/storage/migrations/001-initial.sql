-- Core tables for bot operation

CREATE TABLE roasts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    target_name   TEXT NOT NULL,
    target_type   TEXT NOT NULL CHECK (target_type IN ('project', 'token', 'trend', 'person')),
    tweet_text    TEXT NOT NULL,
    tweet_id      TEXT,
    source        TEXT NOT NULL CHECK (source IN ('autonomous', 'mention', 'burn_request', 'reply_guy')),
    status        TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'failed', 'dry_run', 'pending_approval')),
    fact_checked  INTEGER NOT NULL DEFAULT 0,
    context_data  TEXT,
    agent_output  TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    likes         INTEGER DEFAULT 0,
    retweets      INTEGER DEFAULT 0,
    replies       INTEGER DEFAULT 0,
    impressions   INTEGER DEFAULT 0
);

CREATE TABLE mentions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id      TEXT NOT NULL UNIQUE,
    author_id     TEXT NOT NULL,
    author_name   TEXT NOT NULL,
    text          TEXT NOT NULL,
    request_type  TEXT CHECK (request_type IN ('roast_request', 'challenge', 'reply', 'other')),
    processed     INTEGER NOT NULL DEFAULT 0,
    response_id   TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE queue (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    target_name   TEXT NOT NULL,
    target_type   TEXT NOT NULL,
    source        TEXT NOT NULL,
    priority      INTEGER NOT NULL DEFAULT 1,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'rejected')),
    context       TEXT,
    error_message TEXT,
    attempts      INTEGER NOT NULL DEFAULT 0,
    max_attempts  INTEGER NOT NULL DEFAULT 3,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE config (
    key           TEXT PRIMARY KEY,
    value         TEXT NOT NULL,
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default config values
INSERT INTO config (key, value) VALUES ('paused', 'false');
INSERT INTO config (key, value) VALUES ('daily_limit', '10');
INSERT INTO config (key, value) VALUES ('moderation_mode', 'true');

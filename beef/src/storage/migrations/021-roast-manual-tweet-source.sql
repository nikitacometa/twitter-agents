-- Add 'manual_tweet' to roasts.source CHECK constraint.
-- SQLite doesn't support ALTER CHECK, so recreate the table.

CREATE TABLE roasts_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    target_name     TEXT NOT NULL,
    target_type     TEXT NOT NULL CHECK (target_type IN ('project', 'token', 'trend', 'person')),
    tweet_text      TEXT NOT NULL,
    tweet_id        TEXT,
    source          TEXT NOT NULL CHECK (source IN ('autonomous', 'mention', 'burn_request', 'reply_guy', 'casual_reply', 'manual_tweet')),
    status          TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'failed', 'dry_run', 'pending_approval', 'rejected')),
    fact_checked    INTEGER NOT NULL DEFAULT 0,
    context_data    TEXT,
    agent_output    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    likes           INTEGER DEFAULT 0,
    retweets        INTEGER DEFAULT 0,
    replies         INTEGER DEFAULT 0,
    impressions     INTEGER DEFAULT 0,
    reply_to_id     TEXT,
    conversation_id TEXT,
    angle           TEXT
);

INSERT INTO roasts_new SELECT * FROM roasts;

-- Drop FTS triggers that reference old table
DROP TRIGGER IF EXISTS roasts_fts_insert;
DROP TRIGGER IF EXISTS roasts_fts_delete;

DROP TABLE roasts;
ALTER TABLE roasts_new RENAME TO roasts;

-- Recreate indexes
CREATE INDEX idx_roasts_target ON roasts(target_name);
CREATE INDEX idx_roasts_created ON roasts(created_at);
CREATE INDEX idx_roasts_source ON roasts(source);
CREATE INDEX idx_roasts_conversation_id ON roasts(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_roasts_angle ON roasts(angle) WHERE angle IS NOT NULL;

-- Recreate FTS virtual table and triggers
DROP TABLE IF EXISTS roasts_fts;
CREATE VIRTUAL TABLE roasts_fts USING fts5(tweet_text, content=roasts, content_rowid=id);

INSERT INTO roasts_fts(rowid, tweet_text)
SELECT id, tweet_text FROM roasts;

CREATE TRIGGER roasts_fts_insert AFTER INSERT ON roasts BEGIN
    INSERT INTO roasts_fts(rowid, tweet_text) VALUES (new.id, new.tweet_text);
END;

CREATE TRIGGER roasts_fts_delete AFTER DELETE ON roasts BEGIN
    INSERT INTO roasts_fts(roasts_fts, rowid, tweet_text) VALUES ('delete', old.id, old.tweet_text);
END;

-- Human review scoring: adds human_score column and 'rejected' status.
-- Required table recreation because SQLite doesn't support ALTER CHECK.

-- Step 1: Drop FTS triggers (reference old table)
DROP TRIGGER IF EXISTS stockpile_fts_insert;
DROP TRIGGER IF EXISTS stockpile_fts_delete;

-- Step 2: Create replacement table with human_score + rejected status
CREATE TABLE roast_stockpile_new (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id        INTEGER REFERENCES farm_attempts(id),
    target_name       TEXT NOT NULL,
    target_type       TEXT NOT NULL,
    tweet_text        TEXT NOT NULL,
    angle             TEXT,
    quality_score     REAL NOT NULL,
    evaluator_output  TEXT,
    research_notes    TEXT,
    freshness_type    TEXT NOT NULL DEFAULT 'evergreen'
                      CHECK (freshness_type IN ('evergreen', 'data_dependent')),
    expires_at        TEXT,
    status            TEXT NOT NULL DEFAULT 'available'
                      CHECK (status IN ('available', 'served_bot', 'served_landing', 'promoted', 'expired', 'rejected')),
    served_at         TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    human_score       REAL
);

-- Step 3: Copy existing data
INSERT INTO roast_stockpile_new (
    id, attempt_id, target_name, target_type, tweet_text, angle,
    quality_score, evaluator_output, research_notes, freshness_type,
    expires_at, status, served_at, created_at
)
SELECT
    id, attempt_id, target_name, target_type, tweet_text, angle,
    quality_score, evaluator_output, research_notes, freshness_type,
    expires_at, status, served_at, created_at
FROM roast_stockpile;

-- Step 4: Drop old table, rename new
DROP TABLE roast_stockpile;
ALTER TABLE roast_stockpile_new RENAME TO roast_stockpile;

-- Step 5: Recreate indexes
CREATE INDEX idx_rs_target ON roast_stockpile(target_name, status);
CREATE INDEX idx_rs_score ON roast_stockpile(quality_score DESC);
CREATE INDEX idx_rs_status ON roast_stockpile(status);
CREATE INDEX idx_rs_expires ON roast_stockpile(expires_at)
    WHERE freshness_type = 'data_dependent';

-- Step 6: Recreate FTS triggers
CREATE TRIGGER stockpile_fts_insert AFTER INSERT ON roast_stockpile BEGIN
    INSERT INTO stockpile_fts(rowid, tweet_text) VALUES (new.id, new.tweet_text);
END;

CREATE TRIGGER stockpile_fts_delete AFTER DELETE ON roast_stockpile BEGIN
    INSERT INTO stockpile_fts(stockpile_fts, rowid, tweet_text)
    VALUES ('delete', old.id, old.tweet_text);
END;

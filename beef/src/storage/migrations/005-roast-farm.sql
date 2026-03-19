-- Roast Farm Pipeline tables
-- Separate from production roasts to prevent FTS/query pollution

-- Targets discovered by farm pipeline
CREATE TABLE farm_targets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('project', 'token', 'trend', 'person')),
    source          TEXT NOT NULL,
    priority_score  REAL NOT NULL DEFAULT 0,
    reason          TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'generating', 'completed', 'skipped')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Raw generation output (high volume, temporary — TTL 30 days)
CREATE TABLE farm_attempts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    target_name       TEXT NOT NULL,
    target_type       TEXT NOT NULL,
    tweet_text        TEXT NOT NULL,
    angle             TEXT,
    strategy          TEXT,
    mutation_seed     TEXT,
    llm_self_score    REAL,
    evaluator_score   REAL,
    evaluator_output  TEXT,
    research_notes    TEXT,
    fact_check_passed INTEGER DEFAULT 0,
    agent_output      TEXT,
    promoted          INTEGER DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Curated high-quality roasts (long-lived, served to bot/landing)
CREATE TABLE roast_stockpile (
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
                      CHECK (status IN ('available', 'served_bot', 'served_landing', 'promoted', 'expired')),
    served_at         TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX idx_ft_status ON farm_targets(status);
CREATE INDEX idx_ft_name ON farm_targets(name);

CREATE INDEX idx_fa_target ON farm_attempts(target_name);
CREATE INDEX idx_fa_score ON farm_attempts(evaluator_score);
CREATE INDEX idx_fa_created ON farm_attempts(created_at);
CREATE INDEX idx_fa_promoted ON farm_attempts(promoted);

CREATE INDEX idx_rs_target ON roast_stockpile(target_name, status);
CREATE INDEX idx_rs_score ON roast_stockpile(quality_score DESC);
CREATE INDEX idx_rs_status ON roast_stockpile(status);
CREATE INDEX idx_rs_expires ON roast_stockpile(expires_at)
    WHERE freshness_type = 'data_dependent';

-- FTS5 for stockpile dedupe detection
CREATE VIRTUAL TABLE stockpile_fts USING fts5(
    tweet_text,
    content=roast_stockpile,
    content_rowid=id
);

CREATE TRIGGER stockpile_fts_insert AFTER INSERT ON roast_stockpile BEGIN
    INSERT INTO stockpile_fts(rowid, tweet_text) VALUES (new.id, new.tweet_text);
END;

CREATE TRIGGER stockpile_fts_delete AFTER DELETE ON roast_stockpile BEGIN
    INSERT INTO stockpile_fts(stockpile_fts, rowid, tweet_text)
    VALUES ('delete', old.id, old.tweet_text);
END;

-- Add target index for efficient dedup lookups + stockpile_id FK for traceability.
CREATE INDEX IF NOT EXISTS idx_meme_history_target ON meme_history(target COLLATE NOCASE);

ALTER TABLE meme_history ADD COLUMN stockpile_id INTEGER REFERENCES roast_stockpile(id);

-- meme-farm pipeline: record which humor strategy was used and the vision judge composite score.
ALTER TABLE meme_history ADD COLUMN strategy TEXT;
ALTER TABLE meme_history ADD COLUMN vision_score REAL;

CREATE INDEX IF NOT EXISTS idx_meme_history_vision_score ON meme_history(vision_score);

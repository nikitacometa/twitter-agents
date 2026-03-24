-- Meme generation history for recency tracking and analytics.
CREATE TABLE IF NOT EXISTS meme_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id TEXT NOT NULL,
  template_name TEXT NOT NULL,
  target TEXT NOT NULL,
  boxes TEXT NOT NULL,              -- JSON array of box texts
  format TEXT NOT NULL CHECK (format IN ('meme_only', 'meme_plus_text', 'text_only')),
  image_url TEXT,
  rationale TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_meme_history_template ON meme_history(template_id);
CREATE INDEX IF NOT EXISTS idx_meme_history_created ON meme_history(created_at);

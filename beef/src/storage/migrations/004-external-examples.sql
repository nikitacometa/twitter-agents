-- External roast examples curated by humans for learning.
-- Three types: post_roast (post + reply), person_roast (person + roast examples), news_roast (news + roast).

CREATE TABLE IF NOT EXISTS external_examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('post_roast', 'person_roast', 'news_roast')),
  -- Original content (the post, person description, or news)
  original_text TEXT NOT NULL,
  original_author TEXT,
  original_url TEXT,
  -- Roast response(s)
  roast_text TEXT NOT NULL,
  roast_author TEXT,
  roast_url TEXT,
  -- Additional context
  context TEXT,
  -- Human input at submission
  submitter_telegram_id INTEGER NOT NULL,
  submitter_score INTEGER CHECK(submitter_score BETWEEN 1 AND 5),
  submitter_notes TEXT,
  -- LLM analysis output (JSON)
  analysis TEXT,
  extracted_pattern TEXT,
  classified_angle TEXT,
  specificity_score REAL,
  -- Metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_in_prompts INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_ee_type ON external_examples(type);
CREATE INDEX idx_ee_angle ON external_examples(classified_angle);
CREATE INDEX idx_ee_score ON external_examples(submitter_score);
CREATE INDEX idx_ee_created ON external_examples(created_at);

-- Aggregated reusable patterns extracted from external examples.

CREATE TABLE IF NOT EXISTS roast_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_type TEXT NOT NULL CHECK(pattern_type IN ('structure', 'technique', 'angle_variant')),
  description TEXT NOT NULL,
  source_example_ids TEXT,
  frequency INTEGER NOT NULL DEFAULT 1,
  effectiveness REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_rp_type ON roast_patterns(pattern_type);
CREATE INDEX idx_rp_effectiveness ON roast_patterns(effectiveness);

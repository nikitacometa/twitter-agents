-- Human feedback from Telegram RLHF flow.
-- Each row = one evaluator's verdict on one roast variant.

CREATE TABLE IF NOT EXISTS human_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  variant_index INTEGER NOT NULL DEFAULT 0,
  roast_text TEXT NOT NULL,
  target_name TEXT NOT NULL,
  prompt_variant TEXT,
  angle TEXT,
  llm_self_score INTEGER,
  evaluator_telegram_id INTEGER NOT NULL,
  evaluator_name TEXT,
  verdict TEXT NOT NULL CHECK(verdict IN ('fire', 'post', 'iterate', 'reject')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_hf_session ON human_feedback(session_id);
CREATE INDEX idx_hf_verdict ON human_feedback(verdict);
CREATE INDEX idx_hf_evaluator ON human_feedback(evaluator_telegram_id);
CREATE INDEX idx_hf_target ON human_feedback(target_name);
CREATE INDEX idx_hf_created ON human_feedback(created_at);

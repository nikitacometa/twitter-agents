-- Add conversation_id for thread-level dedup (prevents bot replying to every message in a thread).

ALTER TABLE roasts ADD COLUMN conversation_id TEXT;
ALTER TABLE mentions ADD COLUMN conversation_id TEXT;

CREATE INDEX idx_roasts_conversation_id ON roasts(conversation_id)
  WHERE conversation_id IS NOT NULL;

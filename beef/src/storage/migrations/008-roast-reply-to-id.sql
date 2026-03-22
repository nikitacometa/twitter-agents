-- Add reply_to_id to roasts for persistent reply targeting.
-- Survives process restarts (was in-memory Map before).
ALTER TABLE roasts ADD COLUMN reply_to_id TEXT;

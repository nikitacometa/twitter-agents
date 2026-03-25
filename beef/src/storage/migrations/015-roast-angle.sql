-- Add angle column to roasts for per-angle engagement analysis.
-- Backfills from roast_stockpile and farm_attempts via tweet_text match.

ALTER TABLE roasts ADD COLUMN angle TEXT;

-- Backfill from stockpile (tweet_text is unique at 280 chars)
UPDATE roasts
SET angle = (
  SELECT rs.angle
  FROM roast_stockpile rs
  WHERE rs.tweet_text = roasts.tweet_text
    AND rs.angle IS NOT NULL
  ORDER BY rs.served_at DESC
  LIMIT 1
)
WHERE angle IS NULL;

-- Backfill from farm_attempts (promoted variants)
UPDATE roasts
SET angle = (
  SELECT fa.angle
  FROM farm_attempts fa
  WHERE fa.tweet_text = roasts.tweet_text
    AND fa.promoted = 1
    AND fa.angle IS NOT NULL
  ORDER BY fa.created_at DESC
  LIMIT 1
)
WHERE angle IS NULL;

CREATE INDEX idx_roasts_angle ON roasts(angle) WHERE angle IS NOT NULL;

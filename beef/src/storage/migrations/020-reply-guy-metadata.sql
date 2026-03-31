-- Generation metadata for reply-guy analytics and self-learning
ALTER TABLE reply_guy_candidates ADD COLUMN generation_duration_ms INTEGER;
ALTER TABLE reply_guy_candidates ADD COLUMN variants_total INTEGER;
ALTER TABLE reply_guy_candidates ADD COLUMN variants_filtered INTEGER;
ALTER TABLE reply_guy_candidates ADD COLUMN runner_ups TEXT;       -- JSON: [{text, score, angle, pipeline}]
ALTER TABLE reply_guy_candidates ADD COLUMN pipeline_stats TEXT;   -- JSON: per-pipeline leg status for Max

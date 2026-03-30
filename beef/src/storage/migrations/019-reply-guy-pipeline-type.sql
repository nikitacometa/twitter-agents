-- Pipeline routing: track which generation pipeline was used for each reply.
ALTER TABLE reply_guy_candidates
  ADD COLUMN pipeline_type TEXT CHECK(pipeline_type IN ('lightning', 'max')) DEFAULT NULL;

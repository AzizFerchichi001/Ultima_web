-- SmartPlay uploaded clip pipeline tables (PostgreSQL)
-- Idempotent migration for admin-uploaded clip processing.

CREATE TABLE IF NOT EXISTS ai_uploaded_clips (
  id                   SERIAL PRIMARY KEY,
  match_id             INT NULL REFERENCES matches(id) ON DELETE SET NULL,
  external_match_key   TEXT NULL,
  player_user_id       INT NULL REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by_user_id  INT NULL REFERENCES users(id) ON DELETE SET NULL,
  camera_id            TEXT NOT NULL DEFAULT 'camera_01',
  sport_type           TEXT NOT NULL DEFAULT 'padel',
  original_filename    TEXT NOT NULL,
  stored_video_path    TEXT NOT NULL,
  duration_sec         NUMERIC NULL,
  fps                  NUMERIC NULL,
  frame_count          INT NULL,
  width                INT NULL,
  height               INT NULL,
  status               TEXT NOT NULL DEFAULT 'awaiting_court_annotation',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_uploaded_clips_match
  ON ai_uploaded_clips(match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_uploaded_clips_external_match
  ON ai_uploaded_clips(external_match_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_uploaded_clips_player
  ON ai_uploaded_clips(player_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_uploaded_clips_status
  ON ai_uploaded_clips(status);

CREATE TABLE IF NOT EXISTS ai_clip_jobs (
  id                  SERIAL PRIMARY KEY,
  clip_id             INT NOT NULL REFERENCES ai_uploaded_clips(id) ON DELETE CASCADE,
  external_job_id     TEXT NULL UNIQUE,
  job_type            TEXT NOT NULL DEFAULT 'clip_full_pipeline',
  status              TEXT NOT NULL DEFAULT 'uploaded',
  current_step        TEXT NOT NULL DEFAULT 'upload',
  ai_service_url      TEXT NULL,
  input_video_path    TEXT NULL,
  homography_path     TEXT NULL,
  court_surfaces_path TEXT NULL,
  ball_tracks_path    TEXT NULL,
  player_tracks_path  TEXT NULL,
  scoring_out_dir     TEXT NULL,
  rendered_video_path TEXT NULL,
  error_message       TEXT NULL,
  started_at          TIMESTAMPTZ NULL,
  finished_at         TIMESTAMPTZ NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_clip_jobs_clip
  ON ai_clip_jobs(clip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_clip_jobs_status
  ON ai_clip_jobs(status);

CREATE TABLE IF NOT EXISTS ai_clip_events (
  id          SERIAL PRIMARY KEY,
  clip_id     INT NOT NULL REFERENCES ai_uploaded_clips(id) ON DELETE CASCADE,
  job_id      INT NULL REFERENCES ai_clip_jobs(id) ON DELETE CASCADE,
  frame       INT NOT NULL,
  time_sec    NUMERIC NULL,
  event_type  TEXT NOT NULL,
  winner_side TEXT NULL,
  confidence  NUMERIC NULL,
  reason      TEXT NULL,
  raw         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_clip_events_clip
  ON ai_clip_events(clip_id, frame);
CREATE INDEX IF NOT EXISTS idx_ai_clip_events_job
  ON ai_clip_events(job_id, frame);

-- SmartPlay AI FastAPI persistence tables (PostgreSQL)
-- Idempotent migration for persisted proxy jobs and scoring events.

CREATE TABLE IF NOT EXISTS ai_analysis_jobs (
  id                    SERIAL PRIMARY KEY,
  match_id              INT NULL REFERENCES matches(id) ON DELETE CASCADE,
  external_match_key    TEXT NULL,
  camera_id             TEXT NOT NULL DEFAULT 'camera_01',
  requested_by_user_id  INT NULL REFERENCES users(id) ON DELETE SET NULL,
  job_id                TEXT NOT NULL UNIQUE,
  status                TEXT NOT NULL DEFAULT 'queued',
  ai_service_url        TEXT NULL,
  input_video_path      TEXT NULL,
  ball_tracks_path      TEXT NULL,
  player_tracks_path    TEXT NULL,
  output_dir            TEXT NULL,
  debug_video_path      TEXT NULL,
  error_message         TEXT NULL,
  started_at            TIMESTAMPTZ NULL,
  finished_at           TIMESTAMPTZ NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_external_match
  ON ai_analysis_jobs(external_match_key, camera_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_requested_by
  ON ai_analysis_jobs(requested_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_status
  ON ai_analysis_jobs(status);

CREATE TABLE IF NOT EXISTS ai_scoring_events (
  id                SERIAL PRIMARY KEY,
  analysis_job_id   INT NULL REFERENCES ai_analysis_jobs(id) ON DELETE CASCADE,
  match_id          INT NULL REFERENCES matches(id) ON DELETE CASCADE,
  external_match_key TEXT NULL,
  camera_id         TEXT NOT NULL DEFAULT 'camera_01',
  frame             INT NOT NULL,
  time_sec          NUMERIC NULL,
  event_type        TEXT NOT NULL,
  winner_side       TEXT NULL,
  confidence        NUMERIC NULL,
  reason            TEXT NULL,
  raw               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_scoring_events_job
  ON ai_scoring_events(analysis_job_id, frame);
CREATE INDEX IF NOT EXISTS idx_ai_scoring_events_external_match
  ON ai_scoring_events(external_match_key, camera_id, frame);

CREATE TABLE IF NOT EXISTS ai_performance_summaries (
  id              SERIAL PRIMARY KEY,
  analysis_job_id INT NULL REFERENCES ai_analysis_jobs(id) ON DELETE CASCADE,
  match_id        INT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_user_id  INT NULL REFERENCES users(id) ON DELETE SET NULL,
  summary         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_performance_summaries_job
  ON ai_performance_summaries(analysis_job_id);
CREATE INDEX IF NOT EXISTS idx_ai_performance_summaries_player
  ON ai_performance_summaries(player_user_id, created_at DESC);

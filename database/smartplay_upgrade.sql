-- ULTIMA SmartPlay Upgrade Migration (PostgreSQL)
-- Adds: scoring tables, analytics, payments, arena/court enrichment, SmartPlay AI placeholders
-- Idempotent: uses ADD COLUMN IF NOT EXISTS and CREATE TABLE IF NOT EXISTS

-- ────────────────────────────────────────────────────────────
-- 1. EXTEND arenas with richer metadata
-- ────────────────────────────────────────────────────────────

ALTER TABLE arenas ADD COLUMN IF NOT EXISTS description TEXT NULL;
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS city VARCHAR(100) NULL;
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS address VARCHAR(255) NULL;
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS phone VARCHAR(30) NULL;
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS email VARCHAR(191) NULL;
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- ────────────────────────────────────────────────────────────
-- 2. EXTEND courts with price, type, lighting, image
-- ────────────────────────────────────────────────────────────

ALTER TABLE courts ADD COLUMN IF NOT EXISTS court_type VARCHAR(20) NOT NULL DEFAULT 'outdoor';
ALTER TABLE courts ADD COLUMN IF NOT EXISTS surface_type VARCHAR(50) NULL;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS price_per_hour NUMERIC(8,3) NOT NULL DEFAULT 50.000;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS has_lighting BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) NULL;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- ────────────────────────────────────────────────────────────
-- 3. EXTEND reservations with payment and player count
-- ────────────────────────────────────────────────────────────

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS num_players INT NOT NULL DEFAULT 2;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS total_price NUMERIC(10,3) NULL;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'pending';

-- ────────────────────────────────────────────────────────────
-- 4. EXTEND matches with player ids, winner, and score source
-- ────────────────────────────────────────────────────────────

ALTER TABLE matches ADD COLUMN IF NOT EXISTS player1_id INT NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS player2_id INT NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS winner_team SMALLINT NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS score_source VARCHAR(20) NOT NULL DEFAULT 'manual';

-- ────────────────────────────────────────────────────────────
-- 5. NEW TABLE: score_events
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS score_events (
  id SERIAL PRIMARY KEY,
  match_id INT NOT NULL,
  event_type VARCHAR(30) NOT NULL DEFAULT 'point',
  player_name VARCHAR(191) NULL,
  team SMALLINT NULL,
  set_number SMALLINT NOT NULL DEFAULT 1,
  source VARCHAR(20) NOT NULL DEFAULT 'manual',
  confidence NUMERIC(5,4) NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_score_events_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_score_events_match ON score_events(match_id);
CREATE INDEX IF NOT EXISTS idx_score_events_created ON score_events(created_at);

-- ────────────────────────────────────────────────────────────
-- 6. NEW TABLE: score_correction_logs
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS score_correction_logs (
  id SERIAL PRIMARY KEY,
  match_id INT NOT NULL,
  old_score1 JSONB NOT NULL DEFAULT '[]',
  old_score2 JSONB NOT NULL DEFAULT '[]',
  new_score1 JSONB NOT NULL DEFAULT '[]',
  new_score2 JSONB NOT NULL DEFAULT '[]',
  reason TEXT NULL,
  changed_by_user_id INT NOT NULL,
  changed_by_role VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_score_correction_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  CONSTRAINT fk_score_correction_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_score_corrections_match ON score_correction_logs(match_id);

-- ────────────────────────────────────────────────────────────
-- 7. NEW TABLE: reservation_payments
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reservation_payments (
  id SERIAL PRIMARY KEY,
  reservation_id INT NOT NULL UNIQUE,
  amount NUMERIC(10,3) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'TND',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  method VARCHAR(20) NOT NULL DEFAULT 'simulated',
  transaction_ref VARCHAR(191) NULL,
  paid_at TIMESTAMPTZ NULL,
  refunded_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_res_payments_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_res_payments_status ON reservation_payments(status);

-- ────────────────────────────────────────────────────────────
-- 8. NEW TABLE: smartplay_analysis_jobs
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS smartplay_analysis_jobs (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  match_id INT NULL,
  job_type VARCHAR(30) NOT NULL DEFAULT 'full_match',
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  source_video_path VARCHAR(500) NULL,
  result_json JSONB NULL,
  error_message TEXT NULL,
  requested_by_user_id INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_smartplay_jobs_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_smartplay_jobs_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_smartplay_jobs_user ON smartplay_analysis_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_smartplay_jobs_status ON smartplay_analysis_jobs(status);

-- ────────────────────────────────────────────────────────────
-- 9. NEW TABLE: match_analysis (AI results placeholder)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS match_analysis (
  id SERIAL PRIMARY KEY,
  match_id INT NOT NULL UNIQUE,
  job_id INT NULL,
  rally_count INT NULL,
  avg_rally_length NUMERIC(6,2) NULL,
  winners_team1 INT NULL,
  winners_team2 INT NULL,
  errors_team1 INT NULL,
  errors_team2 INT NULL,
  court_coverage_team1 NUMERIC(5,2) NULL,
  court_coverage_team2 NUMERIC(5,2) NULL,
  ball_speed_avg_kmh NUMERIC(6,2) NULL,
  ball_speed_max_kmh NUMERIC(6,2) NULL,
  heatmap_data JSONB NULL,
  raw_analysis JSONB NULL,
  ai_version VARCHAR(50) NULL,
  analyzed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_match_analysis_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  CONSTRAINT fk_match_analysis_job FOREIGN KEY (job_id) REFERENCES smartplay_analysis_jobs(id) ON DELETE SET NULL
);

-- ────────────────────────────────────────────────────────────
-- 10. NEW TABLE: player_analysis (per-player AI metrics)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS player_analysis (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  match_id INT NULL,
  job_id INT NULL,
  movement_coverage NUMERIC(5,2) NULL,
  reaction_speed_ms NUMERIC(8,2) NULL,
  shot_accuracy NUMERIC(5,2) NULL,
  avg_shot_speed_kmh NUMERIC(6,2) NULL,
  winners INT NULL,
  forced_errors INT NULL,
  unforced_errors INT NULL,
  points_won INT NULL,
  points_lost INT NULL,
  serve_speed_avg_kmh NUMERIC(6,2) NULL,
  heatmap_json JSONB NULL,
  raw_metrics JSONB NULL,
  ai_version VARCHAR(50) NULL,
  analyzed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_player_analysis_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_player_analysis_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_player_analysis_user ON player_analysis(user_id);

-- ────────────────────────────────────────────────────────────
-- 10b. NEW TABLES: SmartPlay FastAPI persistence
-- ────────────────────────────────────────────────────────────

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

CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_external_match ON ai_analysis_jobs(external_match_key, camera_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_requested_by ON ai_analysis_jobs(requested_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_status ON ai_analysis_jobs(status);

CREATE TABLE IF NOT EXISTS ai_scoring_events (
  id                 SERIAL PRIMARY KEY,
  analysis_job_id    INT NULL REFERENCES ai_analysis_jobs(id) ON DELETE CASCADE,
  match_id           INT NULL REFERENCES matches(id) ON DELETE CASCADE,
  external_match_key TEXT NULL,
  camera_id          TEXT NOT NULL DEFAULT 'camera_01',
  frame              INT NOT NULL,
  time_sec           NUMERIC NULL,
  event_type         TEXT NOT NULL,
  winner_side        TEXT NULL,
  confidence         NUMERIC NULL,
  reason             TEXT NULL,
  raw                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_scoring_events_job ON ai_scoring_events(analysis_job_id, frame);
CREATE INDEX IF NOT EXISTS idx_ai_scoring_events_external_match ON ai_scoring_events(external_match_key, camera_id, frame);

CREATE TABLE IF NOT EXISTS ai_performance_summaries (
  id              SERIAL PRIMARY KEY,
  analysis_job_id INT NULL REFERENCES ai_analysis_jobs(id) ON DELETE CASCADE,
  match_id        INT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_user_id  INT NULL REFERENCES users(id) ON DELETE SET NULL,
  summary         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_performance_summaries_job ON ai_performance_summaries(analysis_job_id);
CREATE INDEX IF NOT EXISTS idx_ai_performance_summaries_player ON ai_performance_summaries(player_user_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- 10c. NEW TABLES: SmartPlay uploaded clip pipeline
-- ────────────────────────────────────────────────────────────

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

CREATE INDEX IF NOT EXISTS idx_ai_uploaded_clips_match ON ai_uploaded_clips(match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_uploaded_clips_external_match ON ai_uploaded_clips(external_match_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_uploaded_clips_player ON ai_uploaded_clips(player_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_uploaded_clips_status ON ai_uploaded_clips(status);

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

CREATE INDEX IF NOT EXISTS idx_ai_clip_jobs_clip ON ai_clip_jobs(clip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_clip_jobs_status ON ai_clip_jobs(status);

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

CREATE INDEX IF NOT EXISTS idx_ai_clip_events_clip ON ai_clip_events(clip_id, frame);
CREATE INDEX IF NOT EXISTS idx_ai_clip_events_job ON ai_clip_events(job_id, frame);

-- ────────────────────────────────────────────────────────────
-- 11. NEW TABLE: notification_preferences
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INT PRIMARY KEY,
  reservation_confirmed BOOLEAN NOT NULL DEFAULT TRUE,
  reservation_reminder BOOLEAN NOT NULL DEFAULT TRUE,
  reservation_cancelled BOOLEAN NOT NULL DEFAULT TRUE,
  payment_update BOOLEAN NOT NULL DEFAULT TRUE,
  competition_update BOOLEAN NOT NULL DEFAULT TRUE,
  match_scheduled BOOLEAN NOT NULL DEFAULT TRUE,
  score_updated BOOLEAN NOT NULL DEFAULT TRUE,
  role_changed BOOLEAN NOT NULL DEFAULT TRUE,
  ai_analysis_ready BOOLEAN NOT NULL DEFAULT TRUE,
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_notif_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────
-- 12. SEED: enriched arena data
-- ────────────────────────────────────────────────────────────

UPDATE arenas SET
  description = 'Premier padel & tennis complex in La Marsa with state-of-the-art courts and SUMMA scoring technology.',
  city = 'La Marsa',
  address = 'Route de la Corniche, La Marsa, Tunis',
  phone = '+216 71 000 000',
  email = 'contact@ultima-arena.tn',
  is_active = TRUE
WHERE slug = 'ultima-arena' AND (description IS NULL OR description = '');

-- ────────────────────────────────────────────────────────────
-- 13. SEED: reservation payments for existing reservations
-- ────────────────────────────────────────────────────────────

INSERT INTO reservation_payments (reservation_id, amount, currency, status, method, paid_at)
VALUES
  (1, 75.000, 'TND', 'paid', 'card', '2026-04-10 14:00:00+00'),
  (2, 75.000, 'TND', 'paid', 'cash', '2024-05-11 16:00:00+00'),
  (3, 75.000, 'TND', 'paid', 'card', '2025-01-01 07:30:00+00'),
  (4, 75.000, 'TND', 'pending', 'simulated', NULL)
ON CONFLICT (reservation_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 14. SEED: sample score events for live matches
-- ────────────────────────────────────────────────────────────

INSERT INTO score_events (match_id, event_type, player_name, team, set_number, source)
SELECT m.id, 'point', m.player1_name, 1, 1, 'manual'
FROM matches m WHERE m.status = 'live' LIMIT 3
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 15. UPDATE: payment_status on reservations to match payments
-- ────────────────────────────────────────────────────────────

UPDATE reservations r
SET payment_status = rp.status
FROM reservation_payments rp
WHERE rp.reservation_id = r.id
  AND r.payment_status != rp.status;

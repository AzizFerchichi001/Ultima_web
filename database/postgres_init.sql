-- ULTIMA PostgreSQL base schema + seed data
-- Equivalent of mysql_demo_dump.sql + multi_arena_upgrade.sql
-- Runs once on fresh container via docker-entrypoint-initdb.d

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'player',
  platform_role VARCHAR(20) NOT NULL DEFAULT 'member',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arenas (
  id SERIAL PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  slug VARCHAR(191) NOT NULL UNIQUE,
  location VARCHAR(191) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courts (
  id SERIAL PRIMARY KEY,
  arena_id INT NULL REFERENCES arenas(id),
  name VARCHAR(191) NOT NULL UNIQUE,
  sport VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'available',
  has_summa BOOLEAN NOT NULL DEFAULT FALSE,
  location VARCHAR(191) NOT NULL,
  min_players INT NOT NULL DEFAULT 2,
  max_players INT NOT NULL DEFAULT 4,
  opening_time TIME NOT NULL DEFAULT '08:00:00',
  closing_time TIME NOT NULL DEFAULT '22:00:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservations (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  court_id INT NOT NULL REFERENCES courts(id),
  reservation_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  qr_token CHAR(36) NOT NULL UNIQUE,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_court_date ON reservations(court_id, reservation_date, start_time, end_time);

CREATE TABLE IF NOT EXISTS competitions (
  id SERIAL PRIMARY KEY,
  arena_id INT NULL REFERENCES arenas(id),
  name VARCHAR(191) NOT NULL,
  sport VARCHAR(100) NOT NULL,
  description TEXT NULL,
  start_date DATE NOT NULL,
  location VARCHAR(191) NOT NULL,
  max_participants INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competition_registrations (
  id SERIAL PRIMARY KEY,
  competition_id INT NOT NULL REFERENCES competitions(id),
  user_id INT NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'registered',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (competition_id, user_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  reservation_id INT NULL REFERENCES reservations(id),
  court_id INT NULL REFERENCES courts(id),
  arena_id INT NULL REFERENCES arenas(id),
  competition_id INT NULL REFERENCES competitions(id),
  team1_player1_id INT NULL REFERENCES users(id),
  team1_player2_id INT NULL REFERENCES users(id),
  team2_player1_id INT NULL REFERENCES users(id),
  team2_player2_id INT NULL REFERENCES users(id),
  score1 JSONB NOT NULL DEFAULT '[]',
  score2 JSONB NOT NULL DEFAULT '[]',
  winner_team INT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'upcoming',
  current_set INT NOT NULL DEFAULT 1,
  scheduled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance_snapshots (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  week_label VARCHAR(20) NOT NULL,
  ranking_score INT NOT NULL,
  wins INT NOT NULL,
  losses INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance_profiles (
  user_id INT PRIMARY KEY REFERENCES users(id),
  service INT NOT NULL,
  return_skill INT NOT NULL,
  volley INT NOT NULL,
  endurance INT NOT NULL,
  strategy INT NOT NULL,
  mental INT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_analyses (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  title VARCHAR(191) NOT NULL,
  video_name VARCHAR(191) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  summary TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  arena_id INT NULL REFERENCES arenas(id),
  actor_user_id INT NULL,
  action VARCHAR(191) NOT NULL,
  actor_name VARCHAR(191) NOT NULL,
  detail TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arena_memberships (
  id SERIAL PRIMARY KEY,
  arena_id INT NOT NULL REFERENCES arenas(id),
  user_id INT NOT NULL REFERENCES users(id),
  role VARCHAR(20) NOT NULL DEFAULT 'player',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (arena_id, user_id)
);

CREATE TABLE IF NOT EXISTS reservation_participants (
  id SERIAL PRIMARY KEY,
  reservation_id INT NOT NULL REFERENCES reservations(id),
  user_id INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reservation_id, user_id)
);

CREATE TABLE IF NOT EXISTS coach_player_relationships (
  id                    SERIAL PRIMARY KEY,
  arena_id              INT NULL REFERENCES arenas(id),
  coach_user_id         INT NOT NULL REFERENCES users(id),
  player_user_id        INT NOT NULL REFERENCES users(id),
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  requested_by_user_id  INT NOT NULL REFERENCES users(id),
  responded_by_user_id  INT NULL REFERENCES users(id),
  responded_at          TIMESTAMPTZ NULL,
  can_view_performance  SMALLINT NOT NULL DEFAULT 1,
  can_view_reservations SMALLINT NOT NULL DEFAULT 1,
  can_schedule_sessions SMALLINT NOT NULL DEFAULT 1,
  can_view_notes        SMALLINT NOT NULL DEFAULT 0,
  consent_version       INT NOT NULL DEFAULT 1,
  consent_granted_at    TIMESTAMPTZ NULL,
  start_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date              DATE NULL,
  notes                 TEXT NOT NULL DEFAULT '',
  last_reminder_at      TIMESTAMPTZ NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coach_profiles (
  id                  SERIAL PRIMARY KEY,
  user_id             INT NOT NULL UNIQUE REFERENCES users(id),
  arena_id            INT NULL REFERENCES arenas(id),
  profile_image_url   VARCHAR(512) NULL,
  headline            VARCHAR(255) NULL,
  bio                 TEXT NULL,
  expertise           JSONB NOT NULL DEFAULT '[]',
  qualities           JSONB NOT NULL DEFAULT '[]',
  certifications      JSONB NOT NULL DEFAULT '[]',
  previous_workplaces JSONB NOT NULL DEFAULT '[]',
  languages           JSONB NOT NULL DEFAULT '[]',
  years_experience    INT NULL,
  hourly_rate         NUMERIC(10,2) NULL,
  currency            VARCHAR(10) NOT NULL DEFAULT 'TND',
  is_active                BOOLEAN NOT NULL DEFAULT true,
  is_verified              BOOLEAN NOT NULL DEFAULT false,
  max_sessions_per_day     INT NULL DEFAULT NULL,
  session_duration_minutes INT NOT NULL DEFAULT 60,
  cooldown_minutes         INT NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coach_availability_rules (
  id             SERIAL PRIMARY KEY,
  coach_user_id  INT NOT NULL REFERENCES users(id),
  arena_id       INT NULL REFERENCES arenas(id),
  day_of_week    SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time     TIME NOT NULL,
  end_time       TIME NOT NULL,
  is_available   BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coach_availability_exceptions (
  id             SERIAL PRIMARY KEY,
  coach_user_id  INT NOT NULL REFERENCES users(id),
  exception_date DATE NOT NULL,
  start_time     TIME NULL,
  end_time       TIME NULL,
  is_available   BOOLEAN NOT NULL DEFAULT false,
  reason         VARCHAR(255) NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coaching_requests (
  id                          SERIAL PRIMARY KEY,
  player_user_id              INT NOT NULL REFERENCES users(id),
  coach_user_id               INT NOT NULL REFERENCES users(id),
  arena_id                    INT NULL REFERENCES arenas(id),
  requested_date              DATE NOT NULL,
  requested_start_time        TIME NOT NULL,
  requested_end_time          TIME NOT NULL,
  players_count               SMALLINT NOT NULL DEFAULT 1
                              CHECK (players_count >= 1 AND players_count <= 4),
  message                     TEXT NULL,
  status                      VARCHAR(30) NOT NULL DEFAULT 'pending',
  coach_reply_message         TEXT NULL,
  counter_proposed_date       DATE NULL,
  counter_proposed_start_time TIME NULL,
  counter_proposed_end_time   TIME NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coaching_sessions (
  id                  SERIAL PRIMARY KEY,
  coaching_request_id INT NULL REFERENCES coaching_requests(id),
  player_user_id      INT NOT NULL REFERENCES users(id),
  coach_user_id       INT NOT NULL REFERENCES users(id),
  arena_id            INT NULL REFERENCES arenas(id),
  session_date        DATE NOT NULL,
  start_time          TIME NOT NULL,
  end_time            TIME NOT NULL,
  players_count       SMALLINT NOT NULL DEFAULT 1,
  status              VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS smartplay_analysis_jobs (
  id                    SERIAL PRIMARY KEY,
  user_id               INT NOT NULL REFERENCES users(id),
  match_id              INT NULL,
  job_type              VARCHAR(64) NOT NULL DEFAULT 'full_match',
  source_video_path     VARCHAR(512) NULL,
  status                VARCHAR(32) NOT NULL DEFAULT 'queued',
  requested_by_user_id  INT NULL REFERENCES users(id),
  result_data           JSONB NULL,
  error_message         TEXT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_analysis (
  id            SERIAL PRIMARY KEY,
  match_id      INT NOT NULL,
  heatmap_data  JSONB NULL,
  raw_analysis  JSONB NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS training_sessions (
  id              SERIAL PRIMARY KEY,
  arena_id        INT NOT NULL REFERENCES arenas(id),
  coach_user_id   INT NOT NULL REFERENCES users(id),
  reservation_id  INT NULL REFERENCES reservations(id),
  session_type    VARCHAR(64) NOT NULL DEFAULT 'group',
  title           VARCHAR(255) NOT NULL DEFAULT '',
  focus_areas     TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  status          VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_plans (
  id                   SERIAL PRIMARY KEY,
  code                 VARCHAR(64) NOT NULL UNIQUE,
  name                 VARCHAR(128) NOT NULL,
  max_admins           INT NOT NULL DEFAULT 2,
  max_coaches          INT NOT NULL DEFAULT 5,
  max_players          INT NOT NULL DEFAULT 100,
  features_json        JSONB NOT NULL DEFAULT '{}',
  monthly_price_cents  INT NOT NULL DEFAULT 0,
  yearly_price_cents   INT NOT NULL DEFAULT 0,
  is_active            SMALLINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS arena_subscriptions (
  id                          SERIAL PRIMARY KEY,
  arena_id                    INT NOT NULL REFERENCES arenas(id),
  plan_id                     INT NOT NULL REFERENCES billing_plans(id),
  status                      VARCHAR(32) NOT NULL DEFAULT 'active',
  provider                    VARCHAR(64) NOT NULL DEFAULT 'manual',
  provider_customer_id        VARCHAR(255) NULL,
  provider_subscription_id    VARCHAR(255) NULL,
  current_period_start        TIMESTAMPTZ NULL,
  current_period_end          TIMESTAMPTZ NULL,
  trial_end                   TIMESTAMPTZ NULL,
  cancel_at_period_end        SMALLINT NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Seed data ─────────────────────────────────────────────────────────────────

INSERT INTO billing_plans (code, name, max_admins, max_coaches, max_players, features_json, monthly_price_cents, yearly_price_cents)
VALUES
  ('starter', 'Starter', 2,  3,  50,  '{"analytics":false,"ai":false}', 0,    0),
  ('pro',     'Pro',     5,  10, 200, '{"analytics":true,"ai":false}',  4900, 49000),
  ('elite',   'Elite',   10, 25, 999, '{"analytics":true,"ai":true}',   9900, 99000)
ON CONFLICT (code) DO NOTHING;

INSERT INTO users (id, first_name, last_name, email, password_hash, role, platform_role, status, created_at) VALUES
(1, 'Ahmed',       'Bouazizi',  'ahmed@email.com',   '$2b$10$o3uQcXa5CZKz8fpHmsw4nO3NrSnNtoK4ijqkxWTlpaee4oH4.VKaG', 'player', 'member',      'active',   '2026-04-02 18:02:54.330+00'),
(2, 'Imed',        'Trabelsi',  'sami@email.com',    '$2b$10$wS82IslNVJ4npYfocISd9exulsDWTmuQJ10ptDBxTdNIFUP2.BRAq', 'coach',  'member',      'active',   '2026-04-02 18:02:54.459+00'),
(3, 'Meryam',      'Trbsli',    'mariem@email.com',  '$2b$10$F8SydrXWOrtb2ooWFxxfjui/QV5a72zfQOutlymkNlNohK6ZRklh6', 'player', 'member',      'inactive', '2026-04-02 18:02:54.591+00'),
(4, 'Youssef',     'Khelifi',   'youssef@email.com', '$2b$10$Pmk5bKMDtfE0c2.ZpbZPJeVqpwUCBTpuf3ZkgXsRRQvEsSrrRYJqy', 'player', 'member',      'active',   '2026-04-02 18:02:54.722+00'),
(5, 'Aziz',        'Ferchichi', 'aziz@email.com',    '$2b$10$k5R6s63aUjWiMRHpWV76v.1k6WgR1nKWDHPRj0Nr0NYXUoEHNGKre', 'admin',  'super_admin', 'active',   '2026-04-02 18:02:54.851+00'),
(6, 'NotFerchichi','NotAziz',   'Notaziz@email.com', '$2b$10$I4FlnmpzIQJyUO60oCse/OWVjoPRUS9ysyJAQn.sJ6ZHzZ8M1kZCG', 'coach',  'member',      'active',   '2026-04-02 19:04:31.023+00')
ON CONFLICT (id) DO NOTHING;

SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

INSERT INTO arenas (id, name, slug, location) VALUES
(1, 'ULTIMA Arena', 'ultima-arena', 'La Marsa')
ON CONFLICT (id) DO NOTHING;

SELECT setval('arenas_id_seq', (SELECT MAX(id) FROM arenas));

INSERT INTO courts (id, arena_id, name, sport, status, has_summa, location, created_at) VALUES
(1, 1, 'Terrain Padel A',          'Padel',  'available',  FALSE, 'ULTIMA Arena', '2026-04-02 18:02:54.851+00'),
(2, 1, 'Terrain Padel B',          'Padel',  'available',  FALSE, 'ULTIMA Arena', '2026-04-02 18:02:54.851+00'),
(3, 1, 'Terrain Tennis 1',         'Tennis', 'occupied',   FALSE, 'Court Central','2026-04-02 18:02:54.851+00'),
(4, 1, 'Terrain Tennis 2',         'Tennis', 'available',  FALSE, 'Court Central','2026-04-02 18:02:54.851+00'),
(5, 1, 'Terrain Padel C (SUMMA)',  'Padel',  'available',  TRUE,  'ULTIMA Arena', '2026-04-02 18:02:54.852+00'),
(6, 1, 'Terrain Tennis 3 (SUMMA)', 'Tennis', 'available',  TRUE,  'Court Central','2026-04-02 18:02:54.852+00')
ON CONFLICT (id) DO NOTHING;

SELECT setval('courts_id_seq', (SELECT MAX(id) FROM courts));

INSERT INTO reservations (id, user_id, court_id, reservation_date, start_time, end_time, status, qr_token, notes, created_at) VALUES
(1, 5, 1, '2026-04-10', '15:30', '17:00', 'confirmed', '214fe197-f225-4588-acb2-6722f570a8a2', '', '2026-04-02 18:12:19.858+00'),
(2, 1, 1, '2004-05-11', '17:00', '18:30', 'confirmed', '232a87b3-8908-4c20-94b9-2af4767195e6', '', '2026-04-02 18:49:25.552+00'),
(3, 5, 1, '2025-01-01', '08:00', '09:30', 'confirmed', '4bf73247-224f-4ee5-8fec-dcd0b2378e7a', '', '2026-04-02 18:56:22.101+00'),
(4, 6, 5, '2026-04-03', '08:00', '09:30', 'confirmed', '61fb38dc-4960-4d2c-acbd-0da3f5d4272c', '', '2026-04-02 19:05:29.386+00')
ON CONFLICT (id) DO NOTHING;

SELECT setval('reservations_id_seq', (SELECT MAX(id) FROM reservations));

INSERT INTO competitions (id, arena_id, name, sport, description, start_date, location, max_participants, status, created_at) VALUES
(1, 1, 'Tournoi Padel Printemps 2026', 'Padel',          'Tournoi de demonstration ULTIMA pour les joueurs confirmes.', '2026-03-15', 'ULTIMA Arena', 32, 'open', '2026-04-02 18:02:54.852+00'),
(2, 1, 'Open Tennis La Marsa',         'Tennis',         'Competition open avec diffusion des scores en direct.',       '2026-04-22', 'Court Central',32, 'open', '2026-04-02 18:02:54.852+00'),
(3, 1, 'Championnat Interclubs',       'Padel & Tennis', 'Tournoi complet reserve aux clubs partenaires.',              '2026-05-10', 'ULTIMA Arena', 32, 'full', '2026-04-02 18:02:54.852+00'),
(4, 1, 'Tournoi Junior Padel',         'Padel',          'Competition junior dediee a la detection de talents.',        '2026-06-05', 'Terrain B',    16, 'open', '2026-04-02 18:02:54.852+00')
ON CONFLICT (id) DO NOTHING;

SELECT setval('competitions_id_seq', (SELECT MAX(id) FROM competitions));

INSERT INTO competition_registrations (id, competition_id, user_id, status, created_at) VALUES
(1,  1, 1, 'registered', '2026-04-02 18:02:54.852+00'),
(2,  1, 2, 'registered', '2026-04-02 18:02:54.852+00'),
(3,  1, 3, 'registered', '2026-04-02 18:02:54.852+00'),
(4,  1, 4, 'registered', '2026-04-02 18:02:54.852+00'),
(5,  2, 1, 'registered', '2026-04-02 18:02:54.852+00'),
(6,  2, 2, 'registered', '2026-04-02 18:02:54.852+00'),
(7,  2, 3, 'registered', '2026-04-02 18:02:54.852+00'),
(8,  2, 4, 'registered', '2026-04-02 18:02:54.852+00'),
(9,  3, 1, 'registered', '2026-04-02 18:02:54.852+00'),
(10, 3, 2, 'registered', '2026-04-02 18:02:54.852+00'),
(11, 3, 3, 'registered', '2026-04-02 18:02:54.852+00'),
(12, 3, 4, 'registered', '2026-04-02 18:02:54.852+00'),
(13, 4, 1, 'registered', '2026-04-02 18:02:54.852+00'),
(14, 4, 2, 'registered', '2026-04-02 18:02:54.852+00'),
(15, 4, 3, 'registered', '2026-04-02 18:02:54.852+00'),
(16, 4, 4, 'registered', '2026-04-02 18:02:54.852+00')
ON CONFLICT (id) DO NOTHING;

SELECT setval('competition_registrations_id_seq', (SELECT MAX(id) FROM competition_registrations));

INSERT INTO matches (id, arena_id, competition_id, court_id, player1_name, player2_name, status, current_set, scheduled_at, score1, score2, created_at) VALUES
(1, 1, 1, 5, 'Ahmed B.', 'Sami T.',    'live',     3, '2026-04-02 14:00:00+00', '[6,4,7]', '[3,6,7]', '2026-04-02 18:02:54.852+00'),
(2, 1, 2, 3, 'Youssef K.','Mariem F.', 'live',     2, '2026-04-02 15:00:00+00', '[6,7]',   '[2,7]',   '2026-04-02 18:02:54.852+00'),
(3, 1, 1, 1, 'Aziz F.',  'Nabil M.',  'finished', 2, '2026-04-02 11:00:00+00', '[6,6]',   '[4,3]',   '2026-04-02 18:02:54.852+00'),
(4, 1, 2, 4, 'Ines R.',  'Leila B.',  'upcoming', 1, '2026-04-02 18:00:00+00', '[0]',     '[0]',     '2026-04-02 18:02:54.852+00')
ON CONFLICT (id) DO NOTHING;

SELECT setval('matches_id_seq', (SELECT MAX(id) FROM matches));

INSERT INTO performance_snapshots (id, user_id, week_label, ranking_score, wins, losses, created_at) VALUES
(1, 1, 'S1', 1050, 3, 0, '2026-04-02 18:02:54.852+00'),
(2, 1, 'S2', 1085, 3, 1, '2026-04-02 18:02:54.852+00'),
(3, 1, 'S3', 1120, 4, 2, '2026-04-02 18:02:54.852+00'),
(4, 1, 'S4', 1155, 4, 0, '2026-04-02 18:02:54.852+00'),
(5, 1, 'S5', 1215, 5, 1, '2026-04-02 18:02:54.852+00'),
(6, 1, 'S6', 1250, 5, 2, '2026-04-02 18:02:54.852+00'),
(7, 1, 'S7', 1285, 6, 0, '2026-04-02 18:02:54.852+00'),
(8, 1, 'S8', 1320, 6, 1, '2026-04-02 18:02:54.852+00')
ON CONFLICT (id) DO NOTHING;

SELECT setval('performance_snapshots_id_seq', (SELECT MAX(id) FROM performance_snapshots));

INSERT INTO performance_profiles (user_id, service, return_skill, volley, endurance, strategy, mental, updated_at) VALUES
(1, 85, 72, 90, 68, 78, 82, '2026-04-02 18:02:54.852+00')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO ai_analyses (id, user_id, title, video_name, status, summary, created_at) VALUES
(1, 1, 'Analyse Match Demo', 'match-demo.mp4', 'completed', 'Heatmaps generees, patterns de deplacement detectes et recommandations pretes.', '2026-04-02 18:02:54.852+00')
ON CONFLICT (id) DO NOTHING;

SELECT setval('ai_analyses_id_seq', (SELECT MAX(id) FROM ai_analyses));

INSERT INTO activity_logs (id, arena_id, action, actor_name, detail, created_at) VALUES
(10, 1, 'Reservation confirmee', 'Utilisateur #6', '2026-04-03 08:00 - Court #5', '2026-04-02 19:05:29.386+00'),
(9,  1, 'Nouveau compte',        'NotFerchichi NotAziz', 'Role: coach',            '2026-04-02 19:04:31.023+00'),
(8,  1, 'Reservation confirmee', 'Utilisateur #5', '2025-01-01 08:00 - Court #1', '2026-04-02 18:56:22.101+00'),
(7,  1, 'Reservation confirmee', 'Utilisateur #1', '2004-05-11 17:00 - Court #1', '2026-04-02 18:49:25.552+00'),
(6,  1, 'Reservation confirmee', 'Utilisateur #5', '2026-04-10 15:30 - Court #1', '2026-04-02 18:12:19.858+00'),
(1,  1, 'Reservation confirmee', 'Ahmed B.',       'Terrain Padel A - 15:30',     '2026-04-02 18:02:54.852+00'),
(2,  1, 'Inscription tournoi',   'Sami T.',        'Open Tennis La Marsa',         '2026-04-02 18:02:54.853+00'),
(3,  1, 'Score mis a jour',      'Systeme SUMMA',  'Terrain Padel C (SUMMA)',      '2026-04-02 18:02:54.853+00'),
(4,  1, 'Nouveau compte',        'Ines R.',        'Role: Joueur',                 '2026-04-02 18:02:54.853+00'),
(5,  1, 'Match termine',         'Systeme',        'Aziz F. vs Nabil M.',          '2026-04-02 18:02:54.853+00')
ON CONFLICT (id) DO NOTHING;

SELECT setval('activity_logs_id_seq', (SELECT MAX(id) FROM activity_logs));

INSERT INTO arena_memberships (arena_id, user_id, role, status)
SELECT 1, u.id,
  CASE WHEN u.email = 'sami@email.com' THEN 'admin'
       WHEN u.role = 'coach' THEN 'coach'
       ELSE 'player' END,
  CASE WHEN u.status = 'inactive' THEN 'inactive' ELSE 'active' END
FROM users u
WHERE u.email <> 'aziz@email.com'
ON CONFLICT (arena_id, user_id) DO NOTHING;

INSERT INTO reservation_participants (reservation_id, user_id)
SELECT r.id, r.user_id FROM reservations r
ON CONFLICT (reservation_id, user_id) DO NOTHING;

-- ── Migrations: add session-limit columns to existing databases ───────────────
ALTER TABLE coach_profiles ADD COLUMN IF NOT EXISTS max_sessions_per_day     INT NULL DEFAULT NULL;
ALTER TABLE coach_profiles ADD COLUMN IF NOT EXISTS session_duration_minutes INT NOT NULL DEFAULT 60;
ALTER TABLE coach_profiles ADD COLUMN IF NOT EXISTS cooldown_minutes         INT NOT NULL DEFAULT 0;

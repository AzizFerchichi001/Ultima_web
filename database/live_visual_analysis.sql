-- Live SmartPlay AI visual analysis tables (PostgreSQL)
-- Visual tracking only. Scoring is intentionally not implemented here.

CREATE TABLE IF NOT EXISTS court_cameras (
  id          SERIAL PRIMARY KEY,
  arena_id    INT NOT NULL REFERENCES arenas(id) ON DELETE CASCADE,
  court_id    INT NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  camera_url  TEXT NOT NULL,
  camera_type TEXT NOT NULL DEFAULT 'rtsp',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_court_cameras_court ON court_cameras(court_id, is_active);

ALTER TABLE court_cameras
  ADD COLUMN IF NOT EXISTS arena_id INT NULL REFERENCES arenas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS camera_type TEXT NOT NULL DEFAULT 'rtsp',
  ADD COLUMN IF NOT EXISTS camera_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE court_cameras cc
SET arena_id = c.arena_id
FROM courts c
WHERE cc.court_id = c.id
  AND cc.arena_id IS NULL;

ALTER TABLE court_cameras
  ALTER COLUMN arena_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS court_calibrations (
  id                      SERIAL PRIMARY KEY,
  court_id                INT NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  arena_id                INT NULL REFERENCES arenas(id) ON DELETE SET NULL,
  camera_id               INT NULL REFERENCES court_cameras(id) ON DELETE SET NULL,
  sport                   TEXT NOT NULL DEFAULT 'padel',
  sport_type              TEXT NOT NULL DEFAULT 'padel',
  calibration_image_path  TEXT NULL,
  homography_json_path    TEXT NULL,
  calibration_status      TEXT NOT NULL DEFAULT 'draft',
  image_points            JSONB NOT NULL DEFAULT '[]'::jsonb,
  world_points            JSONB NOT NULL DEFAULT '[]'::jsonb,
  keypoint_labels         JSONB NOT NULL DEFAULT '[]'::jsonb,
  homography_matrix       JSONB NULL,
  status                  TEXT NOT NULL DEFAULT 'draft',
  is_active               BOOLEAN NOT NULL DEFAULT FALSE,
  version                 INT NOT NULL DEFAULT 1,
  created_by_user_id      INT NULL REFERENCES users(id) ON DELETE SET NULL,
  computed_at             TIMESTAMPTZ NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE court_calibrations
  ADD COLUMN IF NOT EXISTS camera_id INT NULL REFERENCES court_cameras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS arena_id INT NULL REFERENCES arenas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'padel',
  ADD COLUMN IF NOT EXISTS homography_json_path TEXT NULL,
  ADD COLUMN IF NOT EXISTS calibration_status TEXT NOT NULL DEFAULT 'draft';

UPDATE court_calibrations cc
SET arena_id = c.arena_id
FROM courts c
WHERE cc.court_id = c.id
  AND cc.arena_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_court_calibrations_court ON court_calibrations(court_id);
CREATE INDEX IF NOT EXISTS idx_court_calibrations_camera ON court_calibrations(camera_id);
CREATE INDEX IF NOT EXISTS idx_court_calibrations_active ON court_calibrations(court_id) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS live_sessions (
  id                 SERIAL PRIMARY KEY,
  arena_id           INT NOT NULL REFERENCES arenas(id) ON DELETE CASCADE,
  court_id           INT NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  camera_id          INT NULL REFERENCES court_cameras(id) ON DELETE SET NULL,
  match_id           INT NULL REFERENCES matches(id) ON DELETE SET NULL,
  competition_id     INT NULL REFERENCES competitions(id) ON DELETE SET NULL,
  reservation_id     INT NULL REFERENCES reservations(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'created',
  mode               TEXT NOT NULL DEFAULT 'real',
  started_by_user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
  started_at         TIMESTAMPTZ NULL,
  stopped_at         TIMESTAMPTZ NULL,
  ai_session_id      TEXT NULL,
  ai_status_message  TEXT NULL,
  fps                NUMERIC NULL,
  last_frame         INT NULL,
  last_update_at     TIMESTAMPTZ NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_sessions_arena_status ON live_sessions(arena_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_sessions_court_status ON live_sessions(court_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_sessions_match ON live_sessions(match_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_reservation ON live_sessions(reservation_id);

CREATE TABLE IF NOT EXISTS live_session_players (
  id              SERIAL PRIMARY KEY,
  live_session_id INT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id         INT NULL REFERENCES users(id) ON DELETE SET NULL,
  slot            TEXT NOT NULL,
  team            TEXT NULL,
  side_hint       TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_live_session_players_session ON live_session_players(live_session_id);
CREATE INDEX IF NOT EXISTS idx_live_session_players_user ON live_session_players(user_id);

CREATE TABLE IF NOT EXISTS live_ai_events (
  id              SERIAL PRIMARY KEY,
  live_session_id INT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  frame           INT NULL,
  timestamp_ms    BIGINT NULL,
  event_type      TEXT NOT NULL,
  payload_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_ai_events_session_frame ON live_ai_events(live_session_id, frame);
CREATE INDEX IF NOT EXISTS idx_live_ai_events_type ON live_ai_events(event_type);

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS live_analysis_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS arena_id INT NULL REFERENCES arenas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'padel',
  ADD COLUMN IF NOT EXISTS players_count INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS booking_type TEXT NOT NULL DEFAULT 'court_reservation';

UPDATE reservations r
SET arena_id = c.arena_id
FROM courts c
WHERE r.court_id = c.id
  AND r.arena_id IS NULL;

UPDATE reservations
SET players_count = COALESCE(num_players, players_count, 2)
WHERE players_count IS NULL
   OR (num_players IS NOT NULL AND players_count <> num_players);

CREATE INDEX IF NOT EXISTS idx_reservations_arena_date ON reservations(arena_id, reservation_date, start_time);

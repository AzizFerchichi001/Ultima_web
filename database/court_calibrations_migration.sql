-- Court Calibrations + Clip enhancements migration
-- Run once against the database.

-- Soft delete + court assignment for clips
ALTER TABLE ai_uploaded_clips
  ADD COLUMN IF NOT EXISTS deleted_at          TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS court_id            INT NULL REFERENCES courts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_player_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ai_uploaded_clips_court   ON ai_uploaded_clips(court_id);
CREATE INDEX IF NOT EXISTS idx_ai_uploaded_clips_deleted ON ai_uploaded_clips(deleted_at) WHERE deleted_at IS NULL;

-- Court calibration records (keypoints + computed homography)
CREATE TABLE IF NOT EXISTS court_calibrations (
  id                      SERIAL PRIMARY KEY,
  court_id                INT  NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  arena_id                INT  NULL     REFERENCES arenas(id) ON DELETE SET NULL,
  sport_type              TEXT NOT NULL DEFAULT 'padel',
  calibration_image_path  TEXT NULL,
  image_points            JSONB NOT NULL DEFAULT '[]'::jsonb,
  world_points            JSONB NOT NULL DEFAULT '[]'::jsonb,
  keypoint_labels         JSONB NOT NULL DEFAULT '[]'::jsonb,
  homography_matrix       JSONB NULL,
  status                  TEXT NOT NULL DEFAULT 'draft',
  is_active               BOOLEAN NOT NULL DEFAULT FALSE,
  version                 INT  NOT NULL DEFAULT 1,
  created_by_user_id      INT  NULL REFERENCES users(id) ON DELETE SET NULL,
  computed_at             TIMESTAMPTZ NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_court_calibrations_court  ON court_calibrations(court_id);
CREATE INDEX IF NOT EXISTS idx_court_calibrations_active ON court_calibrations(court_id) WHERE is_active = TRUE;

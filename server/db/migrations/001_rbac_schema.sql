-- ============================================================
-- MIGRATION 001 — RBAC Schema additions
-- Safe to run multiple times (IF NOT EXISTS / IF EXISTS guards).
-- Apply with: psql -d ultima_web -f server/db/migrations/001_rbac_schema.sql
-- ============================================================

-- ── 001: Extend arena_memberships with provenance + head-coach flag ───────────
ALTER TABLE arena_memberships
  ADD COLUMN IF NOT EXISTS granted_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS granted_at      TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS revoked_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS head_coach_flag BOOLEAN NOT NULL DEFAULT false;

-- Backfill granted_at from created_at for existing rows
UPDATE arena_memberships SET granted_at = created_at WHERE granted_at IS NULL;

-- ── 002: Extend users table ───────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_suspended  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- ── 003: Audit log (append-only, replaces scattered activity_logs for RBAC) ──
CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGSERIAL PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action        VARCHAR(120) NOT NULL,
  target_type   VARCHAR(60),
  target_id     TEXT,
  before_json   JSONB,
  after_json    JSONB,
  arena_id      INTEGER REFERENCES arenas(id) ON DELETE SET NULL,
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor  ON audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_arena  ON audit_log(arena_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_time   ON audit_log(created_at DESC);

-- ── 004: Permission denial log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permission_denials (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  route        VARCHAR(255) NOT NULL,
  resource_id  TEXT,
  reason       VARCHAR(120),
  ip_address   INET,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_perm_denials_user ON permission_denials(user_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_perm_denials_time ON permission_denials(attempted_at DESC);

-- ── 005: Soft-delete columns on all user-facing tables ───────────────────────
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS soft_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ;

ALTER TABLE courts
  ADD COLUMN IF NOT EXISTS soft_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ;

ALTER TABLE arenas
  ADD COLUMN IF NOT EXISTS soft_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ;

ALTER TABLE competitions
  ADD COLUMN IF NOT EXISTS soft_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ;

ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS soft_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ;

-- coach_profiles may not exist yet; ignore error if it doesn't
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coach_profiles') THEN
    BEGIN
      ALTER TABLE coach_profiles
        ADD COLUMN IF NOT EXISTS soft_deleted BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;

-- ── 006: Coach feature tables ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drill_library (
  id            SERIAL PRIMARY KEY,
  coach_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  arena_id      INTEGER REFERENCES arenas(id) ON DELETE SET NULL,
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  tags          TEXT[],
  video_url     TEXT,
  duration_sec  INTEGER,
  soft_deleted  BOOLEAN NOT NULL DEFAULT false,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_drill_library_coach ON drill_library(coach_user_id);
CREATE INDEX IF NOT EXISTS idx_drill_library_arena ON drill_library(arena_id);

CREATE TABLE IF NOT EXISTS coach_student_goals (
  id              SERIAL PRIMARY KEY,
  coach_user_id   INTEGER NOT NULL REFERENCES users(id),
  student_user_id INTEGER NOT NULL REFERENCES users(id),
  arena_id        INTEGER NOT NULL REFERENCES arenas(id),
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  target_date     DATE,
  status          VARCHAR(30) NOT NULL DEFAULT 'active',
  progress_notes  JSONB NOT NULL DEFAULT '[]',
  soft_deleted    BOOLEAN NOT NULL DEFAULT false,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coach_goals_coach   ON coach_student_goals(coach_user_id);
CREATE INDEX IF NOT EXISTS idx_coach_goals_student ON coach_student_goals(student_user_id);
CREATE INDEX IF NOT EXISTS idx_coach_goals_arena   ON coach_student_goals(arena_id);

CREATE TABLE IF NOT EXISTS match_video_annotations (
  id              SERIAL PRIMARY KEY,
  clip_id         INTEGER NOT NULL REFERENCES ai_uploaded_clips(id) ON DELETE CASCADE,
  coach_user_id   INTEGER NOT NULL REFERENCES users(id),
  student_user_id INTEGER REFERENCES users(id),
  time_sec        NUMERIC(10,3) NOT NULL,
  note            TEXT NOT NULL,
  annotation_type VARCHAR(30) NOT NULL DEFAULT 'comment',
  drill_id        INTEGER REFERENCES drill_library(id) ON DELETE SET NULL,
  soft_deleted    BOOLEAN NOT NULL DEFAULT false,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_match_annotations_clip  ON match_video_annotations(clip_id, time_sec);
CREATE INDEX IF NOT EXISTS idx_match_annotations_coach ON match_video_annotations(coach_user_id);

CREATE TABLE IF NOT EXISTS session_drill_tags (
  session_id INTEGER NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  drill_id   INTEGER NOT NULL REFERENCES drill_library(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, drill_id)
);

-- ── 007: Indexes for common arena-scoped queries ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_arena_memberships_user  ON arena_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_arena_memberships_arena ON arena_memberships(arena_id);
CREATE INDEX IF NOT EXISTS idx_reservations_user       ON reservations(user_id) WHERE soft_deleted = false;
CREATE INDEX IF NOT EXISTS idx_notifications_user      ON notifications(user_id, created_at DESC);

import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.PG_HOST ?? "127.0.0.1",
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER ?? "postgres",
  password: process.env.PG_PASSWORD ?? "",
  database: process.env.PG_DATABASE ?? "ultima_demo",
});

const sql = `
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
`;

try {
  await pool.query(sql);
  console.log("✓ coach_player_relationships table created (or already existed).");
} catch (err) {
  console.error("✗ Migration failed:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}

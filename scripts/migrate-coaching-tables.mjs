import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.PG_HOST ?? "127.0.0.1",
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER ?? "postgres",
  password: process.env.PG_PASSWORD ?? "",
  database: process.env.PG_DATABASE ?? "ultima_demo",
});

const migrations = [
  {
    name: "coach_profiles",
    sql: `
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
        is_active           BOOLEAN NOT NULL DEFAULT true,
        is_verified         BOOLEAN NOT NULL DEFAULT false,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
  {
    name: "coach_availability_rules",
    sql: `
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
      CREATE INDEX IF NOT EXISTS idx_coach_avail_rules_coach
        ON coach_availability_rules (coach_user_id, day_of_week);
    `,
  },
  {
    name: "coach_availability_exceptions",
    sql: `
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
      CREATE INDEX IF NOT EXISTS idx_coach_avail_exc_coach
        ON coach_availability_exceptions (coach_user_id, exception_date);
    `,
  },
  {
    name: "coaching_requests",
    sql: `
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
      CREATE INDEX IF NOT EXISTS idx_coaching_requests_coach
        ON coaching_requests (coach_user_id, status);
      CREATE INDEX IF NOT EXISTS idx_coaching_requests_player
        ON coaching_requests (player_user_id);
    `,
  },
  {
    name: "coaching_sessions",
    sql: `
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
      CREATE INDEX IF NOT EXISTS idx_coaching_sessions_coach
        ON coaching_sessions (coach_user_id, session_date);
      CREATE INDEX IF NOT EXISTS idx_coaching_sessions_player
        ON coaching_sessions (player_user_id);
    `,
  },
];

for (const m of migrations) {
  try {
    await pool.query(m.sql);
    console.log(`✓ ${m.name}`);
  } catch (err) {
    console.error(`✗ ${m.name}:`, err.message);
    process.exit(1);
  }
}

await pool.end();
console.log("\nMigration complete.");

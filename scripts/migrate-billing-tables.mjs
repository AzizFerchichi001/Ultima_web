/**
 * Creates billing_plans and arena_subscriptions tables (if missing) and seeds plans.
 *
 * Usage:
 *   PG_PORT=5433 PG_PASSWORD=admin PG_DATABASE=ultima_web node scripts/migrate-billing-tables.mjs
 */
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.PG_HOST ?? "127.0.0.1",
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER ?? "postgres",
  password: process.env.PG_PASSWORD ?? "",
  database: process.env.PG_DATABASE ?? "ultima_demo",
});

const steps = [
  {
    name: "smartplay_analysis_jobs",
    sql: `
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
      CREATE INDEX IF NOT EXISTS idx_smartplay_jobs_user ON smartplay_analysis_jobs (user_id, created_at DESC);
    `,
  },
  {
    name: "match_analysis",
    sql: `
      CREATE TABLE IF NOT EXISTS match_analysis (
        id            SERIAL PRIMARY KEY,
        match_id      INT NOT NULL,
        heatmap_data  JSONB NULL,
        raw_analysis  JSONB NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
  {
    name: "training_sessions",
    sql: `
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
      CREATE INDEX IF NOT EXISTS idx_training_sessions_coach ON training_sessions (coach_user_id);
    `,
  },
  {
    name: "billing_plans",
    sql: `
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
    `,
  },
  {
    name: "billing_plans seed",
    sql: `
      INSERT INTO billing_plans (code, name, max_admins, max_coaches, max_players, features_json, monthly_price_cents, yearly_price_cents)
      VALUES
        ('starter', 'Starter', 2,  3,  50,  '{"analytics":false,"ai":false}', 0,    0),
        ('pro',     'Pro',     5,  10, 200, '{"analytics":true,"ai":false}',  4900, 49000),
        ('elite',   'Elite',   10, 25, 999, '{"analytics":true,"ai":true}',   9900, 99000)
      ON CONFLICT (code) DO NOTHING;
    `,
  },
  {
    name: "arena_subscriptions",
    sql: `
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
    `,
  },
];

for (const step of steps) {
  try {
    await pool.query(step.sql);
    console.log(`✓ ${step.name}`);
  } catch (err) {
    console.error(`✗ ${step.name}:`, err.message);
    process.exit(1);
  }
}

// Verify
const { rows } = await pool.query("SELECT code, name, max_coaches, monthly_price_cents FROM billing_plans ORDER BY monthly_price_cents");
console.log("\nBilling plans:");
for (const p of rows) {
  console.log(`  ${p.code}: ${p.name} (max_coaches=${p.max_coaches}, price=${p.monthly_price_cents})`);
}

await pool.end();
console.log("\nMigration complete. Restart the server to apply.");

import mysql from "mysql2/promise";
import { createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? "root",
  password: process.env.MYSQL_PASSWORD ?? "",
  database: process.env.MYSQL_DATABASE ?? "ultima_demo",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true,
  timezone: "Z",
});

const REQUIRED_TABLES = [
  "users",
  "arenas",
  "arena_memberships",
  "courts",
  "reservations",
  "reservation_participants",
  "competitions",
  "competition_registrations",
  "matches",
  "performance_snapshots",
  "performance_profiles",
  "ai_analyses",
  "activity_logs",
];

const BILLING_SECRET = process.env.BILLING_SIGNATURE_SECRET ?? process.env.JWT_SECRET ?? "ultima-billing-secret";
const RESERVATION_DURATION_MINUTES = Number(process.env.RESERVATION_DURATION_MINUTES ?? 90);
const RESERVATION_STEP_MINUTES = Number(process.env.RESERVATION_STEP_MINUTES ?? RESERVATION_DURATION_MINUTES);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO_CANDIDATE_PATHS = [
  path.resolve(__dirname, "../src/assets/ultima_logo.jpg"),
  path.resolve(__dirname, "../public/ultima_logo.jpg"),
];
const SHOWCASE_ARENAS = [
  {
    name: "Arena Padel Premium",
    slug: "arena-padel-premium",
    location: "Rue du Parc, La Soukra",
    courts: Array.from({ length: 5 }, (_, index) => ({
      name: `Arena Court ${index + 1}`,
      sport: "Padel",
      status: "available",
      has_summa: index === 4 ? 1 : 0,
      location: "Arena Padel Premium",
      min_players: 2,
      max_players: 4,
      opening_time: "08:00:00",
      closing_time: "23:00:00",
    })),
  },
  {
    name: "Padel Indoor La Soukra",
    slug: "padel-indoor-la-soukra",
    location: "V6CJ+P4H, La Soukra",
    courts: Array.from({ length: 2 }, (_, index) => ({
      name: `Indoor Court ${index + 1}`,
      sport: "Padel",
      status: "available",
      has_summa: 0,
      location: "Padel Indoor La Soukra",
      min_players: 2,
      max_players: 4,
      opening_time: "08:00:00",
      closing_time: "22:00:00",
    })),
  },
  {
    name: "Padel House Ariana",
    slug: "padel-house-ariana",
    location: "676 Sidi Amor, Ariana",
    courts: Array.from({ length: 3 }, (_, index) => ({
      name: `House Court ${index + 1}`,
      sport: "Padel",
      status: "available",
      has_summa: index === 2 ? 1 : 0,
      location: "Padel House Ariana",
      min_players: 2,
      max_players: 4,
      opening_time: "08:00:00",
      closing_time: "23:00:00",
    })),
  },
  {
    name: "Le Club de Gammarth",
    slug: "le-club-de-gammarth",
    location: "Zone touristique Cap Gammarth",
    courts: Array.from({ length: 3 }, (_, index) => ({
      name: `Gammarth Court ${index + 1}`,
      sport: "Padel",
      status: "available",
      has_summa: index === 2 ? 1 : 0,
      location: "Le Club de Gammarth",
      min_players: 2,
      max_players: 4,
      opening_time: "07:00:00",
      closing_time: "22:00:00",
    })),
  },
  {
    name: "Olympysky Club",
    slug: "olympysky-club",
    location: "Lac 2, Tunis",
    courts: Array.from({ length: 3 }, (_, index) => ({
      name: `Sky Court ${index + 1}`,
      sport: "Padel",
      status: "available",
      has_summa: index === 1 ? 1 : 0,
      location: "Olympysky Club",
      min_players: 2,
      max_players: 4,
      opening_time: "08:00:00",
      closing_time: "22:00:00",
    })),
  },
];

const toIso = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const parseJsonColumn = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }

  return [];
};

const resolveRole = (user) => {
  if (!user) {
    return null;
  }

  if (user.platform_role === "super_admin") {
    return "super_admin";
  }

  return user.membership_role ?? user.role ?? "player";
};

const resolveStatus = (user) => {
  if (!user) {
    return "inactive";
  }

  if (user.platform_role === "super_admin") {
    return user.status ?? "inactive";
  }

  return user.membership_status ?? user.status ?? "inactive";
};

const normalizeUser = (user) => {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    password_hash: user.password_hash,
    role: user.role,
    status: user.status,
    created_at: toIso(user.created_at),
    platform_role: user.platform_role ?? "member",
    membership_id: user.membership_id ?? null,
    membership_role: user.membership_role ?? null,
    membership_status: user.membership_status ?? null,
    arena_id: user.arena_id ?? null,
    arena_name: user.arena_name ?? null,
    arena_location: user.arena_location ?? null,
    cin_number: user.cin_number ?? null,
    email_verified_at: toIso(user.email_verified_at),
    effective_role: resolveRole(user),
    effective_status: resolveStatus(user),
  };
};

const sanitizeCourt = (court) => ({
  ...court,
  created_at: toIso(court.created_at),
});

const sanitizeLog = (log) => ({
  ...log,
  created_at: toIso(log.created_at),
});

const sanitizeCompetition = (competition) => ({
  ...competition,
  created_at: toIso(competition.created_at),
});

const sanitizeReservation = (reservation) => {
  const sanitized = {
    ...reservation,
    created_at: toIso(reservation.created_at),
    participants: reservation.participants ? parseJsonColumn(reservation.participants) : [],
  };

  if (sanitized.reservation_date instanceof Date) {
    sanitized.reservation_date = sanitized.reservation_date.toISOString().split("T")[0];
  } else if (typeof sanitized.reservation_date === "string") {
    sanitized.reservation_date = sanitized.reservation_date.split("T")[0];
  }

  // Ensure times are 12:34:56 format and not full ISO strings or anything else
  if (typeof sanitized.start_time === "string") sanitized.start_time = sanitized.start_time.slice(0, 8);
  if (typeof sanitized.end_time === "string") sanitized.end_time = sanitized.end_time.slice(0, 8);

  return sanitized;
};

const sanitizeMembershipUser = (row) => ({
  id: row.id,
  first_name: row.first_name,
  last_name: row.last_name,
  email: row.email,
  role: row.platform_role === "super_admin" ? "super_admin" : row.membership_role,
  status: row.membership_status ?? row.status,
  account_status: row.status,
  platform_role: row.platform_role,
  arena_id: row.arena_id,
  arena_name: row.arena_name,
  created_at: toIso(row.created_at),
});

const timeToMinutes = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const parts = value.split(":").map(Number);
  if (parts.length < 2 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  return parts[0] * 60 + parts[1];
};

const minutesToTime = (value) => {
  const hours = String(Math.floor(value / 60)).padStart(2, "0");
  const minutes = String(value % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const generateSixDigitCode = () => {
  const buffer = randomBytes(4);
  const numeric = buffer.readUInt32BE(0) % 1000000;
  return String(numeric).padStart(6, "0");
};

const isAdminLike = (actor) => actor?.effective_role === "admin" || actor?.effective_role === "super_admin";
const isCoachLike = (actor) => ["coach", "admin", "super_admin"].includes(actor?.effective_role);

async function queryUsersBy(sql, params = [], connection = pool) {
  const [rows] = await connection.query(
    `SELECT
       users.*,
       arena_memberships.id AS membership_id,
       arena_memberships.role AS membership_role,
       arena_memberships.status AS membership_status,
       arenas.id AS arena_id,
       arenas.name AS arena_name,
       arenas.location AS arena_location
     FROM users
     LEFT JOIN arena_memberships ON arena_memberships.user_id = users.id
     LEFT JOIN arenas ON arenas.id = arena_memberships.arena_id
     ${sql}`,
    params
  );

  return rows.map(normalizeUser);
}

async function findUserById(userId, connection = pool) {
  const users = await queryUsersBy("WHERE users.id = ? ORDER BY arena_memberships.id ASC LIMIT 1", [userId], connection);
  return users[0] ?? null;
}

export async function getUserById(userId) {
  return findUserById(Number(userId));
}

export async function updateUserProfile(userId, { firstName, lastName }) {
  const fields = [];
  const params = [];

  if (firstName !== undefined) {
    const value = String(firstName ?? "").trim();
    if (!value) {
      throw new Error("First name cannot be empty");
    }
    fields.push("first_name = ?");
    params.push(value);
  }

  if (lastName !== undefined) {
    const value = String(lastName ?? "").trim();
    if (!value) {
      throw new Error("Last name cannot be empty");
    }
    fields.push("last_name = ?");
    params.push(value);
  }

  const normalizedUserId = Number(userId);
  if (!fields.length) {
    return findUserById(normalizedUserId);
  }

  params.push(normalizedUserId);
  await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, params);
  return findUserById(normalizedUserId);
}

async function addActivityLog(connection, { arenaId = null, actorUserId = null, actorName, action, detail }) {
  await connection.query(
    `INSERT INTO activity_logs (arena_id, action, actor_user_id, actor_name, detail, created_at)
     VALUES (?, ?, ?, ?, ?, NOW(3))`,
    [arenaId, action, actorUserId, actorName, detail]
  );
}

async function requireActiveActor(userId, connection) {
  const actor = await findUserById(userId, connection);
  if (!actor) {
    throw new Error("User not found");
  }

  if (actor.effective_status !== "active") {
    throw new Error("This account is inactive");
  }

  return actor;
}

export async function initializeDatabase() {
  const connection = await pool.getConnection();

  try {
    await connection.query("SELECT 1");

    const [rows] = await connection.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
         AND table_name IN (${REQUIRED_TABLES.map(() => "?").join(", ")})`,
      REQUIRED_TABLES
    );

    if (rows[0].count < REQUIRED_TABLES.length) {
      throw new Error("Required multi-arena tables are missing. Run database/multi_arena_upgrade.sql in MySQL Workbench first.");
    }

    await connection.query(
      `CREATE TABLE IF NOT EXISTS training_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        arena_id INT NOT NULL,
        coach_user_id INT NOT NULL,
        reservation_id INT NOT NULL,
        session_type ENUM('individual','group','match_practice') NOT NULL DEFAULT 'individual',
        title VARCHAR(191) NOT NULL,
        focus_areas TEXT NULL,
        notes TEXT NULL,
        status ENUM('scheduled','completed','cancelled') NOT NULL DEFAULT 'scheduled',
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_training_sessions_arena (arena_id),
        INDEX idx_training_sessions_coach (coach_user_id),
        INDEX idx_training_sessions_reservation (reservation_id)
      )`
    );

    await connection.query(
      `CREATE TABLE IF NOT EXISTS coach_player_relationships (
        id INT AUTO_INCREMENT PRIMARY KEY,
        arena_id INT NOT NULL,
        coach_user_id INT NOT NULL,
        player_user_id INT NOT NULL,
        status ENUM('pending','active','paused','ended','rejected') NOT NULL DEFAULT 'pending',
        requested_by_user_id INT NOT NULL,
        responded_by_user_id INT NULL,
        can_view_performance TINYINT(1) NOT NULL DEFAULT 1,
        can_view_reservations TINYINT(1) NOT NULL DEFAULT 1,
        can_schedule_sessions TINYINT(1) NOT NULL DEFAULT 1,
        can_view_notes TINYINT(1) NOT NULL DEFAULT 0,
        consent_version INT NOT NULL DEFAULT 1,
        consent_granted_at DATETIME(3) NULL,
        start_date DATE NOT NULL,
        end_date DATE NULL,
        notes TEXT NULL,
        responded_at DATETIME(3) NULL,
        last_reminder_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_coach_player_active_window (coach_user_id, player_user_id, start_date, end_date),
        INDEX idx_cpr_coach (coach_user_id),
        INDEX idx_cpr_player (player_user_id),
        INDEX idx_cpr_status_dates (status, start_date, end_date),
        INDEX idx_cpr_arena (arena_id)
      )`
    );

    await connection.query(
      `CREATE TABLE IF NOT EXISTS billing_plans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(48) NOT NULL UNIQUE,
        name VARCHAR(96) NOT NULL,
        max_admins INT NOT NULL,
        max_coaches INT NOT NULL,
        max_players INT NOT NULL,
        features_json JSON NULL,
        monthly_price_cents INT NOT NULL DEFAULT 0,
        yearly_price_cents INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      )`
    );
    await connection.query(
      `CREATE TABLE IF NOT EXISTS refresh_tokens (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        token VARCHAR(256) NOT NULL UNIQUE,
        expires_at DATETIME(3) NOT NULL,
        revoked_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      )`
    );
    await connection.query(
      `CREATE TABLE IF NOT EXISTS notifications (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        title VARCHAR(191) NOT NULL,
        body TEXT NOT NULL,
        type VARCHAR(64) NOT NULL DEFAULT 'info',
        link_url VARCHAR(255) NULL,
        read_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      )`
    );
    await connection.query("ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS uploader_user_id BIGINT NULL");
    await connection.query("ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS subject_user_id BIGINT NULL");
    await connection.query("ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS match_id BIGINT NULL");
    await connection.query("ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS storage_path VARCHAR(255) NULL");
    await connection.query("ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS uploaded_at DATETIME(3) NULL");

    await connection.query(
      `CREATE TABLE IF NOT EXISTS arena_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        arena_id INT NOT NULL,
        plan_id INT NOT NULL,
        status ENUM('trialing','active','past_due','canceled','paused') NOT NULL DEFAULT 'trialing',
        provider VARCHAR(24) NOT NULL DEFAULT 'manual',
        provider_customer_id VARCHAR(191) NULL,
        provider_subscription_id VARCHAR(191) NULL,
        current_period_start DATETIME(3) NULL,
        current_period_end DATETIME(3) NULL,
        trial_end DATETIME(3) NULL,
        cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_arena_subscriptions_arena (arena_id),
        INDEX idx_arena_subscriptions_provider (provider, provider_customer_id, provider_subscription_id)
      )`
    );

    await connection.query(
      `INSERT INTO billing_plans (code, name, max_admins, max_coaches, max_players, features_json, monthly_price_cents, yearly_price_cents, is_active)
       VALUES
         ('starter', 'Starter', 1, 2, 50, JSON_OBJECT('competitions', true, 'liveScores', true, 'smartPlayAi', false), 9900, 99000, 1),
         ('pro', 'Pro', 3, 10, 300, JSON_OBJECT('competitions', true, 'liveScores', true, 'smartPlayAi', true), 29900, 299000, 1),
         ('elite', 'Elite', 10, 30, 2000, JSON_OBJECT('competitions', true, 'liveScores', true, 'smartPlayAi', true, 'prioritySupport', true), 79900, 799000, 1)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         max_admins = VALUES(max_admins),
         max_coaches = VALUES(max_coaches),
         max_players = VALUES(max_players),
         features_json = VALUES(features_json),
         monthly_price_cents = VALUES(monthly_price_cents),
         yearly_price_cents = VALUES(yearly_price_cents),
         is_active = VALUES(is_active)`
    );

    const ensureColumn = async (tableName, columnName, definitionSql) => {
      const [columns] = await connection.query(
        `SELECT COUNT(*) AS count
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = ?
           AND column_name = ?`,
        [tableName, columnName]
      );
      if (Number(columns?.[0]?.count ?? 0) === 0) {
        await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
      }
    };

    await ensureColumn("users", "cin_number", "VARCHAR(32) NULL");
    await ensureColumn("users", "email_verified_at", "DATETIME(3) NULL");
    try {
      await connection.query("CREATE UNIQUE INDEX uq_users_cin_number ON users (cin_number)");
    } catch (error) {
      if (error?.code !== "ER_DUP_KEYNAME") {
        throw error;
      }
    }
    await connection.query(
      `CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(128) NOT NULL UNIQUE,
        expires_at DATETIME(3) NOT NULL,
        used_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_password_reset_tokens_user (user_id),
        INDEX idx_password_reset_tokens_expires (expires_at)
      )`
    );
    await connection.query(
      `CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(128) NOT NULL UNIQUE,
        expires_at DATETIME(3) NOT NULL,
        used_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_email_verification_tokens_user (user_id),
        INDEX idx_email_verification_tokens_expires (expires_at)
      )`
    );
    await connection.query(
      `UPDATE users
       SET cin_number = LPAD(id, 8, '0')
       WHERE role IN ('player', 'coach')
         AND (cin_number IS NULL OR cin_number = '')`
    );
    await connection.query(
      `UPDATE users
       SET email_verified_at = NOW(3)
       WHERE email_verified_at IS NULL
         AND created_at < '2026-04-12 00:00:00'`
    );
    for (const showcaseArena of SHOWCASE_ARENAS) {
      const [arenaRows] = await connection.query(
        `SELECT id
         FROM arenas
         WHERE slug = ?
         LIMIT 1`,
        [showcaseArena.slug]
      );

      let arenaId = Number(arenaRows[0]?.id ?? 0);
      if (!arenaId) {
        const [insertArena] = await connection.query(
          `INSERT INTO arenas (name, slug, location, created_at)
           VALUES (?, ?, ?, NOW(3))`,
          [showcaseArena.name, showcaseArena.slug, showcaseArena.location]
        );
        arenaId = Number(insertArena.insertId);
      }

      for (const court of showcaseArena.courts) {
        const [courtRows] = await connection.query(
          `SELECT id
           FROM courts
           WHERE arena_id = ?
             AND name = ?
           LIMIT 1`,
          [arenaId, court.name]
        );
        if (courtRows[0]) {
          continue;
        }

        await connection.query(
          `INSERT INTO courts
            (arena_id, name, sport, status, has_summa, location, min_players, max_players, opening_time, closing_time, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
          [
            arenaId,
            court.name,
            court.sport,
            court.status,
            court.has_summa,
            court.location,
            court.min_players,
            court.max_players,
            court.opening_time,
            court.closing_time,
          ]
        );
      }
    }
  } finally {
    connection.release();
  }
}

export async function listArenas() {
  const [rows] = await pool.query(
    `SELECT id, name, slug, location, created_at
     FROM arenas
     ORDER BY name ASC`
  );
  return rows.map((row) => ({ ...row, created_at: toIso(row.created_at) }));
}

function toSlug(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "arena";
}

export async function createArena({ name, location }) {
  const baseSlug = toSlug(name);
  let slug = baseSlug;
  let attempt = 0;

  while (attempt < 10) {
    try {
      const [result] = await pool.query(
        `INSERT INTO arenas (name, slug, location, created_at)
         VALUES (?, ?, ?, NOW(3))`,
        [name, slug, location]
      );

      const [rows] = await pool.query(
        `SELECT id, name, slug, location, created_at
         FROM arenas
         WHERE id = ?`,
        [result.insertId]
      );
      await ensureArenaTrialSubscription(result.insertId);
      return { ...rows[0], created_at: toIso(rows[0].created_at) };
    } catch (error) {
      if (error?.code !== "ER_DUP_ENTRY") {
        throw error;
      }
      attempt += 1;
      slug = `${baseSlug}-${Math.floor(Math.random() * 10000)}`;
    }
  }

  throw new Error("Unable to create arena slug");
}

async function ensureArenaTrialSubscription(arenaId, connection = pool) {
  const [existingRows] = await connection.query(
    `SELECT id
     FROM arena_subscriptions
     WHERE arena_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [arenaId]
  );
  if (existingRows[0]) {
    return existingRows[0].id;
  }

  const [planRows] = await connection.query(
    `SELECT id
     FROM billing_plans
     WHERE code = 'starter'
     LIMIT 1`
  );
  const starterPlanId = planRows[0]?.id;
  if (!starterPlanId) {
    throw new Error("Starter plan is missing");
  }

  const [result] = await connection.query(
    `INSERT INTO arena_subscriptions
      (arena_id, plan_id, status, provider, current_period_start, current_period_end, trial_end, created_at, updated_at)
     VALUES (
       ?, ?, 'trialing', 'manual', NOW(3), DATE_ADD(NOW(3), INTERVAL 1 MONTH), DATE_ADD(NOW(3), INTERVAL 14 DAY), NOW(3), NOW(3)
     )`,
    [arenaId, starterPlanId]
  );

  return result.insertId;
}

async function getArenaSubscriptionWithPlan(arenaId, connection = pool) {
  await ensureArenaTrialSubscription(arenaId, connection);

  const [rows] = await connection.query(
    `SELECT
       subscriptions.*,
       plans.code AS plan_code,
       plans.name AS plan_name,
       plans.max_admins,
       plans.max_coaches,
       plans.max_players,
       plans.features_json,
       plans.monthly_price_cents,
       plans.yearly_price_cents
     FROM arena_subscriptions subscriptions
     JOIN billing_plans plans ON plans.id = subscriptions.plan_id
     WHERE subscriptions.arena_id = ?
     ORDER BY subscriptions.id DESC
     LIMIT 1`,
    [arenaId]
  );

  return rows[0] ?? null;
}

async function getArenaRoleUsage(arenaId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT
       SUM(CASE WHEN arena_memberships.role = 'admin' THEN 1 ELSE 0 END) AS admins,
       SUM(CASE WHEN arena_memberships.role = 'coach' THEN 1 ELSE 0 END) AS coaches,
       SUM(CASE WHEN arena_memberships.role = 'player' THEN 1 ELSE 0 END) AS players
     FROM arena_memberships
     JOIN users ON users.id = arena_memberships.user_id
     WHERE arena_memberships.arena_id = ?
       AND arena_memberships.status = 'active'
       AND users.status = 'active'`,
    [arenaId]
  );
  const usage = rows[0] ?? { admins: 0, coaches: 0, players: 0 };
  return {
    admins: Number(usage.admins ?? 0),
    coaches: Number(usage.coaches ?? 0),
    players: Number(usage.players ?? 0),
  };
}

async function assertCanAddArenaMember(arenaId, membershipRole, connection = pool) {
  const subscription = await getArenaSubscriptionWithPlan(arenaId, connection);
  if (!subscription) {
    throw new Error("No active subscription found for this arena");
  }

  if (!["trialing", "active"].includes(subscription.status)) {
    throw new Error("Subscription is not active. Please update billing before adding users.");
  }

  const usage = await getArenaRoleUsage(arenaId, connection);
  const limits = {
    admin: Number(subscription.max_admins ?? 0),
    coach: Number(subscription.max_coaches ?? 0),
    player: Number(subscription.max_players ?? 0),
  };
  const current = {
    admin: usage.admins,
    coach: usage.coaches,
    player: usage.players,
  };

  if (!Object.prototype.hasOwnProperty.call(limits, membershipRole)) {
    return;
  }

  if (current[membershipRole] >= limits[membershipRole]) {
    throw new Error(`Plan limit reached for ${membershipRole} accounts. Please upgrade your subscription.`);
  }
}

export async function listCourts(actor = null) {
  const params = [];
  let whereClause = "";

  if (actor?.effective_role !== "super_admin" && actor?.effective_role !== "player" && actor?.arena_id) {
    whereClause = "WHERE courts.arena_id = ?";
    params.push(actor.arena_id);
  }

  const [rows] = await pool.query(
    `SELECT
       courts.*,
       arenas.name AS arena_name,
       arenas.location AS arena_location
     FROM courts
     JOIN arenas ON arenas.id = courts.arena_id
     ${whereClause}
     ORDER BY courts.id ASC`,
    params
  );

  return rows.map(sanitizeCourt);
}

export async function getCourtById(id) {
  const [rows] = await pool.query(
    `SELECT
       courts.*,
       arenas.name AS arena_name,
       arenas.location AS arena_location
     FROM courts
     JOIN arenas ON arenas.id = courts.arena_id
     WHERE courts.id = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] ? sanitizeCourt(rows[0]) : null;
}

export async function getCourtAvailability(courtId, reservationDate) {
  const court = await getCourtById(courtId);
  if (!court) {
    return null;
  }

  const openingMinutes = timeToMinutes(court.opening_time);
  const closingMinutes = timeToMinutes(court.closing_time);
  const duration = Number.isFinite(RESERVATION_DURATION_MINUTES) && RESERVATION_DURATION_MINUTES > 0
    ? RESERVATION_DURATION_MINUTES
    : 90;
  const step = Number.isFinite(RESERVATION_STEP_MINUTES) && RESERVATION_STEP_MINUTES > 0
    ? RESERVATION_STEP_MINUTES
    : duration;

  const [reservedRows] = await pool.query(
    `SELECT start_time, end_time
     FROM reservations
     WHERE court_id = ?
       AND reservation_date = ?
       AND status = 'confirmed'
     ORDER BY start_time ASC`,
    [courtId, reservationDate]
  );

  const reserved = reservedRows.map((row) => ({
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
  }));

  const slots = [];
  for (let cursor = openingMinutes; cursor + duration <= closingMinutes; cursor += step) {
    const slotStart = minutesToTime(cursor);
    const slotEnd = minutesToTime(cursor + duration);
    const isReserved = reserved.some((range) => !(range.endTime <= slotStart || range.startTime >= slotEnd));

    slots.push({
      startTime: slotStart,
      endTime: slotEnd,
      available: !isReserved,
    });
  }

  return {
    courtId: court.id,
    reservationDate,
    openingTime: String(court.opening_time).slice(0, 5),
    closingTime: String(court.closing_time).slice(0, 5),
    slots,
    reserved,
  };
}

export async function lookupParticipantsForArena(arenaId, emails) {
  if (!arenaId || !emails.length) {
    return [];
  }

  const uniqueEmails = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (!uniqueEmails.length) {
    return [];
  }

  const [rows] = await pool.query(
    `SELECT
       users.id,
       users.first_name,
       users.last_name,
       users.email,
       users.platform_role,
       users.status AS account_status,
       arena_memberships.role AS membership_role,
       arena_memberships.status AS membership_status,
       arenas.id AS arena_id,
       arenas.name AS arena_name
     FROM users
     JOIN arena_memberships ON arena_memberships.user_id = users.id
     JOIN arenas ON arenas.id = arena_memberships.arena_id
     WHERE arena_memberships.arena_id = ?
       AND users.status = 'active'
       AND arena_memberships.status = 'active'
       AND users.email IN (${uniqueEmails.map(() => "?").join(", ")})`,
    [arenaId, ...uniqueEmails]
  );

  return rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    role: row.platform_role === "super_admin" ? "super_admin" : row.membership_role,
    status: row.membership_status,
    accountStatus: row.account_status,
    arenaId: row.arena_id,
    arenaName: row.arena_name,
  }));
}

export async function listReservationsForUser(userId) {
  const [rows] = await pool.query(
    `SELECT
       reservations.*,
       courts.name AS court_name,
       courts.sport,
       courts.arena_id,
       arenas.name AS arena_name,
       JSON_ARRAYAGG(
         JSON_OBJECT(
           'id', participants.id,
           'firstName', participants.first_name,
           'lastName', participants.last_name,
           'email', participants.email
         )
       ) AS participants
     FROM reservation_participants
     JOIN reservations ON reservations.id = reservation_participants.reservation_id
     JOIN courts ON courts.id = reservations.court_id
     JOIN arenas ON arenas.id = courts.arena_id
     JOIN users AS participants ON participants.id = reservation_participants.user_id
     WHERE reservation_participants.user_id = ?
     GROUP BY reservations.id, courts.name, courts.sport, courts.arena_id, arenas.name
     ORDER BY reservations.reservation_date DESC, reservations.start_time DESC`,
    [userId]
  );

  return rows.map(sanitizeReservation);
}

export async function getReservationTicketDetails(reservationId, actor) {
  const [rows] = await pool.query(
    `SELECT
       reservations.id,
       reservations.reservation_date,
       reservations.start_time,
       reservations.end_time,
       reservations.status,
       reservations.qr_token,
       reservations.notes,
       reservations.created_at,
       courts.name AS court_name,
       courts.sport AS sport,
       arenas.id AS arena_id,
       arenas.name AS arena_name,
       arenas.location AS arena_location,
       creator.first_name AS owner_first_name,
       creator.last_name AS owner_last_name
     FROM reservations
     JOIN courts ON courts.id = reservations.court_id
     JOIN arenas ON arenas.id = courts.arena_id
     JOIN users AS creator ON creator.id = reservations.user_id
     WHERE reservations.id = ?
     LIMIT 1`,
    [reservationId]
  );
  const reservation = rows[0];
  if (!reservation) {
    throw new Error("Reservation not found");
  }

  const [participantRows] = await pool.query(
    `SELECT
       users.id,
       users.first_name,
       users.last_name,
       users.email
     FROM reservation_participants
     JOIN users ON users.id = reservation_participants.user_id
     WHERE reservation_participants.reservation_id = ?
     ORDER BY users.first_name ASC, users.last_name ASC`,
    [reservationId]
  );

  const canAccess =
    actor?.effective_role === "super_admin" ||
    (actor?.effective_role === "admin" && actor?.arena_id && actor.arena_id === reservation.arena_id) ||
    participantRows.some((participant) => participant.id === actor?.id);

  if (!canAccess) {
    throw new Error("You do not have access to this reservation ticket");
  }

  const signaturePayload = `${reservation.id}|${reservation.qr_token}|${reservation.reservation_date}|${String(reservation.start_time).slice(0, 8)}|${String(reservation.end_time).slice(0, 8)}`;
  const signature = createHmac("sha256", BILLING_SECRET).update(signaturePayload).digest("hex").slice(0, 32).toUpperCase();
  const specialCode = `ULT-${reservation.id}-${signature.slice(0, 8)}`;

  return {
    id: reservation.id,
    reservationDate: reservation.reservation_date instanceof Date ? reservation.reservation_date.toISOString().split("T")[0] : String(reservation.reservation_date).split("T")[0],
    startTime: String(reservation.start_time).slice(0, 5),
    endTime: String(reservation.end_time).slice(0, 5),
    status: reservation.status,
    qrToken: reservation.qr_token,
    notes: reservation.notes ?? "",
    createdAt: toIso(reservation.created_at),
    courtName: reservation.court_name,
    sport: reservation.sport,
    arenaName: reservation.arena_name,
    arenaLocation: reservation.arena_location,
    ownerName: `${reservation.owner_first_name} ${reservation.owner_last_name}`,
    participants: participantRows.map((participant) => ({
      id: participant.id,
      name: `${participant.first_name} ${participant.last_name}`,
      email: participant.email,
    })),
    signature,
    specialCode,
  };
}

export async function getReservationTicketDetailsByQr(reservationId, qrToken) {
  const [rows] = await pool.query(
    `SELECT
       reservations.id,
       reservations.reservation_date,
       reservations.start_time,
       reservations.end_time,
       reservations.status,
       reservations.qr_token,
       reservations.notes,
       reservations.created_at,
       courts.name AS court_name,
       courts.sport AS sport,
       arenas.name AS arena_name,
       arenas.location AS arena_location,
       creator.first_name AS owner_first_name,
       creator.last_name AS owner_last_name
     FROM reservations
     JOIN courts ON courts.id = reservations.court_id
     JOIN arenas ON arenas.id = courts.arena_id
     JOIN users AS creator ON creator.id = reservations.user_id
     WHERE reservations.id = ?
       AND reservations.qr_token = ?
     LIMIT 1`,
    [reservationId, qrToken]
  );

  const reservation = rows[0];
  if (!reservation) {
    throw new Error("Invalid ticket link or reservation");
  }

  const [participantRows] = await pool.query(
    `SELECT
       users.id,
       users.first_name,
       users.last_name,
       users.email
     FROM reservation_participants
     JOIN users ON users.id = reservation_participants.user_id
     WHERE reservation_participants.reservation_id = ?
     ORDER BY users.first_name ASC, users.last_name ASC`,
    [reservationId]
  );

  const signaturePayload = `${reservation.id}|${reservation.qr_token}|${reservation.reservation_date}|${String(reservation.start_time).slice(0, 8)}|${String(reservation.end_time).slice(0, 8)}`;
  const signature = createHmac("sha256", BILLING_SECRET).update(signaturePayload).digest("hex").slice(0, 32).toUpperCase();
  const specialCode = `ULT-${reservation.id}-${signature.slice(0, 8)}`;

  return {
    id: reservation.id,
    reservationDate: reservation.reservation_date instanceof Date ? reservation.reservation_date.toISOString().split("T")[0] : String(reservation.reservation_date).split("T")[0],
    startTime: String(reservation.start_time).slice(0, 5),
    endTime: String(reservation.end_time).slice(0, 5),
    status: reservation.status,
    qrToken: reservation.qr_token,
    notes: reservation.notes ?? "",
    createdAt: toIso(reservation.created_at),
    courtName: reservation.court_name,
    sport: reservation.sport,
    arenaName: reservation.arena_name,
    arenaLocation: reservation.arena_location,
    ownerName: `${reservation.owner_first_name} ${reservation.owner_last_name}`,
    participants: participantRows.map((participant) => ({
      id: participant.id,
      name: `${participant.first_name} ${participant.last_name}`,
      email: participant.email,
    })),
    signature,
    specialCode,
  };
}

function getJpegSize(buffer) {
  if (!buffer || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }
    if (marker === 0xda || marker === 0xd9) {
      break;
    }
    const length = buffer.readUInt16BE(offset + 2);
    offset += 2 + length;
  }
  return null;
}

function loadUltimaLogoJpeg() {
  for (const candidate of LOGO_CANDIDATE_PATHS) {
    if (fs.existsSync(candidate)) {
      const bytes = fs.readFileSync(candidate);
      const size = getJpegSize(bytes);
      if (size) {
        return { bytes, ...size };
      }
    }
  }
  return null;
}

function buildQrPdfCommands(value, x, y, size) {
  const qr = QRCode.create(String(value), {
    errorCorrectionLevel: "M",
    margin: 0,
  });
  const moduleCount = qr.modules.size;
  const moduleSize = size / moduleCount;
  const commands = [];

  // White background behind QR for better scanning reliability
  commands.push("1 1 1 rg");
  commands.push(`${x} ${y} ${size} ${size} re`);
  commands.push("f");

  // Draw dark modules
  commands.push("0 0 0 rg");
  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (!qr.modules.get(row, col)) {
        continue;
      }
      const px = x + col * moduleSize;
      const py = y + (moduleCount - 1 - row) * moduleSize;
      commands.push(`${px.toFixed(2)} ${py.toFixed(2)} ${moduleSize.toFixed(2)} ${moduleSize.toFixed(2)} re`);
      commands.push("f");
    }
  }

  return commands;
}

export function generateReservationTicketPdfBuffer(ticket) {
  const line = (text = "") => String(text).replace(/[()]/g, "").slice(0, 110);
  const participants = (ticket.participants || []).slice(0, 8).map((participant, index) => `${index + 1}. ${participant.name} <${participant.email}>`);
  const specialCode = ticket.specialCode || `ULT-${ticket.id}-${ticket.signature.slice(0, 8)}`;
  const qrPayload = `ULTIMA|TICKET|${ticket.id}|${ticket.qrToken}|${specialCode}`;
  const contentLines = [
    `Ticket ID: #${ticket.id}`,
    `Arena: ${ticket.arenaName} (${ticket.arenaLocation || "N/A"})`,
    `Court: ${ticket.courtName} - ${ticket.sport}`,
    `Date: ${ticket.reservationDate}`,
    `Time: ${ticket.startTime} - ${ticket.endTime}`,
    `Status: ${ticket.status}`,
    `Owner: ${ticket.ownerName}`,
    `QR Token: ${ticket.qrToken}`,
    "",
    "Participants:",
    ...participants,
    "",
    `Notes: ${ticket.notes || "N/A"}`,
    "",
    `Special Verification Code: ${specialCode}`,
    `Digital Signature: ${ticket.signature}`,
    `Generated At: ${new Date().toISOString()}`,
  ];

  const stream = [
    "0.08 0.06 0.16 rg",
    "0 760 595 82 re",
    "f",
    "0.88 0.84 0.98 rg",
    "0 0 595 842 re",
    "f",
    "0.60 0.55 0.75 rg",
    "BT",
    "/F1 54 Tf",
    "120 410 Td",
    "(ULTIMA) Tj",
    "ET",
    "0.16 0.12 0.3 rg",
    "BT",
    "/F1 26 Tf",
    "120 798 Td",
    "(ULTIMA RESERVATION PASS) Tj",
    "ET",
    "q",
    "74 0 0 54 42 772 cm",
    "/Im1 Do",
    "Q",
    "0.16 0.12 0.3 rg",
    "BT",
    "/F1 11 Tf",
    "50 730 Td",
    "14 TL",
  ];
  for (let index = 0; index < contentLines.length; index += 1) {
    const text = line(contentLines[index]);
    if (index === 0) {
      stream.push(`(${text}) Tj`);
    } else {
      stream.push("T*");
      stream.push(`(${text}) Tj`);
    }
  }
  stream.push("ET");
  stream.push("0.24 0.22 0.35 RG");
  stream.push("2 w");
  stream.push("40 50 515 740 re");
  stream.push("S");
  stream.push(...buildQrPdfCommands(qrPayload, 430, 74, 112));
  stream.push("0.16 0.12 0.3 rg");
  stream.push("BT");
  stream.push("/F1 8 Tf");
  stream.push("430 62 Td");
  stream.push("(Reservation QR - scan to verify) Tj");
  stream.push("ET");
  stream.push("0.24 0.22 0.35 rg");
  stream.push("BT");
  stream.push("/F1 11 Tf");
  stream.push("50 68 Td");
  stream.push(`(Admin Verification: use Reservation #${ticket.id} + Signature ${ticket.signature.slice(0, 8)}...) Tj`);
  stream.push("ET");
  const contentStream = `${stream.join("\n")}\n`;
  const contentLength = Buffer.byteLength(contentStream, "utf8");
  const logo = loadUltimaLogoJpeg();

  const objects = [];
  objects.push(Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", "utf8"));
  objects.push(Buffer.from("2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n", "utf8"));
  objects.push(
    Buffer.from(
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 5 0 R >>\nendobj\n",
      "utf8"
    )
  );
  objects.push(Buffer.from("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n", "utf8"));
  objects.push(Buffer.from(`5 0 obj\n<< /Length ${contentLength} >>\nstream\n${contentStream}endstream\nendobj\n`, "utf8"));

  if (logo) {
    const imageHeader = Buffer.from(
      `6 0 obj\n<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>\nstream\n`,
      "utf8"
    );
    const imageFooter = Buffer.from("\nendstream\nendobj\n", "utf8");
    objects.push(Buffer.concat([imageHeader, logo.bytes, imageFooter]));
  } else {
    objects.push(
      Buffer.from(
        "6 0 obj\n<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 3 >>\nstream\n\xFF\xFF\xFF\nendstream\nendobj\n",
        "binary"
      )
    );
  }

  let offset = Buffer.byteLength("%PDF-1.4\n", "utf8");
  const xrefOffsets = [0];
  for (const object of objects) {
    xrefOffsets.push(offset);
    offset += object.length;
  }

  const xrefStart = offset;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    xref += `${String(xrefOffsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.concat([
    Buffer.from("%PDF-1.4\n", "utf8"),
    ...objects,
    Buffer.from(xref, "utf8"),
    Buffer.from(trailer, "utf8"),
  ]);
}

export async function verifyReservationTicketSignature(reservationId, signature) {
  const [rows] = await pool.query(
    `SELECT
       reservations.id,
       reservations.reservation_date,
       reservations.start_time,
       reservations.end_time,
       reservations.qr_token,
       reservations.status,
       courts.name AS court_name,
       arenas.name AS arena_name,
       CONCAT(owner.first_name, ' ', owner.last_name) AS owner_name
     FROM reservations
     JOIN courts ON courts.id = reservations.court_id
     JOIN arenas ON arenas.id = courts.arena_id
     JOIN users AS owner ON owner.id = reservations.user_id
     WHERE reservations.id = ?
     LIMIT 1`,
    [reservationId]
  );

  const reservation = rows[0];
  if (!reservation) {
    return { valid: false, reason: "Reservation not found" };
  }

  const expectedPayload = `${reservation.id}|${reservation.qr_token}|${reservation.reservation_date}|${String(reservation.start_time).slice(0, 8)}|${String(reservation.end_time).slice(0, 8)}`;
  const expectedSignature = createHmac("sha256", BILLING_SECRET).update(expectedPayload).digest("hex").slice(0, 32).toUpperCase();
  const provided = String(signature || "").trim().toUpperCase();
  const specialCode = `ULT-${reservation.id}-${expectedSignature.slice(0, 8)}`;

  return {
    valid: provided === expectedSignature || provided === specialCode,
    expectedSignature,
    reservationId: reservation.id,
    details: {
      reservationDate: reservation.reservation_date instanceof Date ? reservation.reservation_date.toISOString().split("T")[0] : String(reservation.reservation_date).split("T")[0],
      startTime: String(reservation.start_time).slice(0, 5),
      endTime: String(reservation.end_time).slice(0, 5),
      status: reservation.status,
      courtName: reservation.court_name,
      arenaName: reservation.arena_name,
      ownerName: reservation.owner_name,
      specialCode,
    },
  };
}

export async function hasReservationConflict(courtId, reservationDate, startTime, endTime, connection = pool) {
  const [rows] = await connection.query(
    `SELECT id
     FROM reservations
     WHERE court_id = ?
       AND reservation_date = ?
       AND status = 'confirmed'
       AND NOT (end_time <= ? OR start_time >= ?)
     LIMIT 1`,
    [courtId, reservationDate, startTime, endTime]
  );

  return rows.length > 0;
}

export async function createReservation({
  userId,
  courtId,
  reservationDate,
  startTime,
  endTime,
  qrToken,
  notes = "",
  participantEmails = [],
}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const creator = await requireActiveActor(userId, connection);
    if (!creator.arena_id) {
      throw new Error("Only arena members can create reservations");
    }

    const court = await getCourtById(courtId);
    if (!court) {
      throw new Error("Court not found");
    }

    if (court.status !== "available") {
      throw new Error("This court is not available for booking");
    }

    if (!["player", "super_admin"].includes(creator.effective_role) && court.arena_id !== creator.arena_id) {
      throw new Error("You can only reserve courts in your arena");
    }

    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    const openingMinutes = timeToMinutes(String(court.opening_time).slice(0, 5));
    const closingMinutes = timeToMinutes(String(court.closing_time).slice(0, 5));

    if (
      startMinutes === null ||
      endMinutes === null ||
      openingMinutes === null ||
      closingMinutes === null ||
      endMinutes <= startMinutes
    ) {
      throw new Error("Invalid reservation time");
    }

    if (startMinutes < openingMinutes || endMinutes > closingMinutes) {
      throw new Error("Reservation must stay within the arena opening hours");
    }

    if (await hasReservationConflict(courtId, reservationDate, startTime, endTime, connection)) {
      throw new Error("This slot is already reserved");
    }

    const guestEmails = participantEmails.map((email) => email.trim().toLowerCase()).filter(Boolean);
    const uniqueGuestEmails = [...new Set(guestEmails)];

    if (uniqueGuestEmails.length !== guestEmails.length) {
      throw new Error("The same email cannot be used twice in a reservation");
    }

    if (uniqueGuestEmails.some((email) => email === creator.email.toLowerCase())) {
      throw new Error("The reservation creator is already included automatically");
    }

    const totalPlayers = 1 + uniqueGuestEmails.length;
    if (totalPlayers < Number(court.min_players) || totalPlayers > Number(court.max_players)) {
      throw new Error(`This court accepts between ${court.min_players} and ${court.max_players} players`);
    }

    let participantRows = [];
    if (uniqueGuestEmails.length) {
      const [rows] = await connection.query(
        `SELECT
           users.id,
           users.first_name,
           users.last_name,
           users.email,
           users.platform_role,
           users.status AS account_status,
           arena_memberships.status AS membership_status
         FROM users
         JOIN arena_memberships ON arena_memberships.user_id = users.id
         WHERE arena_memberships.arena_id = ?
           AND users.email IN (${uniqueGuestEmails.map(() => "?").join(", ")})`,
        [court.arena_id, ...uniqueGuestEmails]
      );
      participantRows = rows;
    }

    if (participantRows.length !== uniqueGuestEmails.length) {
      throw new Error("Every guest participant must already have an active account in this venue");
    }

    const invalidParticipant = participantRows.find(
      (participant) =>
        participant.platform_role === "super_admin" ||
        participant.account_status !== "active" ||
        participant.membership_status !== "active"
    );

    if (invalidParticipant) {
      throw new Error("Every guest participant must already have an active account in this venue");
    }

    const [result] = await connection.query(
      `INSERT INTO reservations
        (user_id, court_id, reservation_date, start_time, end_time, status, qr_token, notes, created_at)
       VALUES (?, ?, ?, ?, ?, 'confirmed', ?, ?, NOW(3))`,
      [userId, courtId, reservationDate, startTime, endTime, qrToken, notes]
    );

    await connection.query(
      `INSERT INTO reservation_participants (reservation_id, user_id, created_at)
       VALUES (?, ?, NOW(3))`,
      [result.insertId, creator.id]
    );

    for (const participant of participantRows) {
      await connection.query(
        `INSERT INTO reservation_participants (reservation_id, user_id, created_at)
         VALUES (?, ?, NOW(3))`,
        [result.insertId, participant.id]
      );
    }

    await addActivityLog(connection, {
      arenaId: court.arena_id,
      actorUserId: creator.id,
      actorName: `${creator.first_name} ${creator.last_name}`,
      action: "Reservation confirmee",
      detail: `${court.name} - ${reservationDate} ${startTime}-${endTime}`,
    });

    await connection.commit();

    const [rows] = await connection.query(
      `SELECT
         reservations.*,
         courts.name AS court_name,
         courts.sport,
         courts.arena_id,
         arenas.name AS arena_name,
         JSON_ARRAYAGG(
           JSON_OBJECT(
             'id', participants.id,
             'firstName', participants.first_name,
             'lastName', participants.last_name,
             'email', participants.email
           )
         ) AS participants
       FROM reservations
       JOIN courts ON courts.id = reservations.court_id
       JOIN arenas ON arenas.id = courts.arena_id
       JOIN reservation_participants ON reservation_participants.reservation_id = reservations.id
       JOIN users AS participants ON participants.id = reservation_participants.user_id
       WHERE reservations.id = ?
       GROUP BY reservations.id, courts.name, courts.sport, courts.arena_id, arenas.name`,
      [result.insertId]
    );

    return sanitizeReservation(rows[0]);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function cancelReservation(id, actor, reason = null) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT
         reservations.*,
         courts.arena_id,
         courts.name AS court_name
       FROM reservations
       JOIN courts ON courts.id = reservations.court_id
       WHERE reservations.id = ?
       LIMIT 1`,
      [id]
    );

    const reservation = rows[0];
    if (!reservation) {
      await connection.rollback();
      return { changes: 0 };
    }

    if (reservation.status === 'cancelled') {
      await connection.rollback();
      return { success: true };
    }

    // Participants check
    const [participants] = await connection.query(
      "SELECT user_id FROM reservation_participants WHERE reservation_id = ?",
      [id]
    );

    const isParticipant = participants.some((p) => p.user_id === actor.id);
    const canCancelRole = actor.effective_role === "super_admin" || (actor.effective_role === "admin" && actor.arena_id === reservation.arena_id);

    if (!canCancelRole && !isParticipant) {
      throw new Error("You do not have permission to cancel this reservation");
    }

    // 24-hour check for non-admins
    if (!canCancelRole) {
      const reservationStart = new Date(`${reservation.reservation_date}T${reservation.start_time}`);
      const now = new Date();
      const diffMs = reservationStart.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours < 24) {
        throw new Error("Reservations can only be cancelled 24 hours or more in advance");
      }
    }

    const [result] = await connection.query(
      `UPDATE reservations
       SET status = 'cancelled'
       WHERE id = ?`,
      [id]
    );

    await addActivityLog(connection, {
      arenaId: reservation.arena_id,
      actorUserId: actor.id,
      actorName: `${actor.first_name} ${actor.last_name}`,
      action: "Reservation annulee",
      detail: `${reservation.court_name} - ${reservation.reservation_date} ${String(reservation.start_time).slice(0, 5)}`,
    });

    await connection.commit();
    return { changes: result.affectedRows, success: true, reservation, cancelledSession: null };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Stub — MySQL schema does not include refund columns; noop keeps the interface consistent.
export async function updateReservationRefund(_id, _fields) {}

export async function listCompetitions(actor = null) {
  const params = [];
  let whereClause = "";

  if (actor?.effective_role !== "super_admin" && actor?.arena_id) {
    whereClause = "WHERE competitions.arena_id = ?";
    params.push(actor.arena_id);
  }

  const [rows] = await pool.query(
    `SELECT
       competitions.*,
       arenas.name AS arena_name,
       COUNT(competition_registrations.id) AS participants
     FROM competitions
     JOIN arenas ON arenas.id = competitions.arena_id
     LEFT JOIN competition_registrations
       ON competition_registrations.competition_id = competitions.id
       AND competition_registrations.status = 'registered'
     ${whereClause}
     GROUP BY competitions.id, arenas.name
     ORDER BY competitions.start_date ASC`,
    params
  );

  return rows.map(sanitizeCompetition);
}

export async function registerForCompetition(competitionId, actor) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (!actor?.arena_id || actor.effective_status !== "active") {
      await connection.rollback();
      return { error: "Only active arena members can register" };
    }

    const [competitionRows] = await connection.query(
      `SELECT *
       FROM competitions
       WHERE id = ?
       LIMIT 1`,
      [competitionId]
    );

    const competition = competitionRows[0];
    if (!competition) {
      await connection.rollback();
      return { error: "Competition not found" };
    }

    if (competition.arena_id !== actor.arena_id) {
      await connection.rollback();
      return { error: "You can only register for competitions in your arena" };
    }

    const [existingRows] = await connection.query(
      `SELECT id
       FROM competition_registrations
       WHERE competition_id = ? AND user_id = ? AND status = 'registered'
       LIMIT 1`,
      [competitionId, actor.id]
    );

    if (existingRows.length > 0) {
      await connection.rollback();
      return { error: "Already registered" };
    }

    const [countRows] = await connection.query(
      `SELECT COUNT(*) AS count
       FROM competition_registrations
       WHERE competition_id = ? AND status = 'registered'`,
      [competitionId]
    );

    if (competition.status !== "open" || countRows[0].count >= competition.max_participants) {
      await connection.rollback();
      return { error: "Competition is full or closed" };
    }

    await connection.query(
      `INSERT INTO competition_registrations (competition_id, user_id, status, created_at)
       VALUES (?, ?, 'registered', NOW(3))`,
      [competitionId, actor.id]
    );

    await addActivityLog(connection, {
      arenaId: actor.arena_id,
      actorUserId: actor.id,
      actorName: `${actor.first_name} ${actor.last_name}`,
      action: "Inscription tournoi",
      detail: competition.name,
    });

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getLeaderboard(actor = null) {
  const params = [];
  let whereClause = "";

  if (actor?.effective_role !== "super_admin" && actor?.arena_id) {
    whereClause = "WHERE arena_memberships.arena_id = ?";
    params.push(actor.arena_id);
  }

  const [rows] = await pool.query(
    `SELECT
       ROW_NUMBER() OVER (ORDER BY MAX(performance_snapshots.ranking_score) DESC) AS \`rank\`,
       CONCAT(users.first_name, ' ', LEFT(users.last_name, 1), '.') AS name,
       MAX(performance_snapshots.ranking_score) AS points,
       SUM(performance_snapshots.wins) AS wins,
       SUM(performance_snapshots.losses) AS losses
     FROM users
     JOIN performance_snapshots ON performance_snapshots.user_id = users.id
     LEFT JOIN arena_memberships ON arena_memberships.user_id = users.id
     ${whereClause}
     GROUP BY users.id
     ORDER BY points DESC
     LIMIT 5`,
    params
  );

  return rows;
}

export async function listMatches(actor = null) {
  const params = [];
  let whereClause = "";

  if (actor?.effective_role !== "super_admin" && actor?.arena_id) {
    whereClause = "WHERE matches.arena_id = ?";
    params.push(actor.arena_id);
  }

  const [rows] = await pool.query(
    `SELECT
       matches.*,
       courts.name AS court_name,
       arenas.name AS arena_name
     FROM matches
     LEFT JOIN courts ON courts.id = matches.court_id
     LEFT JOIN arenas ON arenas.id = matches.arena_id
     ${whereClause}
     ORDER BY
       FIELD(matches.status, 'live', 'upcoming', 'finished'),
       matches.id`,
    params
  );

  return rows.map((row) => ({
    ...row,
    scheduled_at: toIso(row.scheduled_at),
    created_at: toIso(row.created_at),
    score1: parseJsonColumn(row.score1),
    score2: parseJsonColumn(row.score2),
  }));
}

export async function tickLiveMatches() {
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.query(
      "SELECT id, score1, score2 FROM matches WHERE status = 'live'"
    );

    for (const row of rows) {
      const score1 = parseJsonColumn(row.score1);
      const score2 = parseJsonColumn(row.score2);
      const lastIndex = Math.max(score1.length, score2.length) - 1;

      if (lastIndex < 0) {
        continue;
      }

      if (Math.random() > 0.5) {
        score1[lastIndex] = Math.min(7, Number(score1[lastIndex] ?? 0) + 1);
      } else {
        score2[lastIndex] = Math.min(7, Number(score2[lastIndex] ?? 0) + 1);
      }

      await connection.query(
        "UPDATE matches SET score1 = ?, score2 = ? WHERE id = ?",
        [JSON.stringify(score1), JSON.stringify(score2), row.id]
      );
    }
  } finally {
    connection.release();
  }
}

export async function findUserByEmail(email) {
  const users = await queryUsersBy("WHERE users.email = ? ORDER BY arena_memberships.id ASC LIMIT 1", [email]);
  return users[0] ?? null;
}

export async function createUser({
  firstName,
  lastName,
  email,
  passwordHash,
  arenaId,
  membershipRole,
  cinNumber = null,
  emailVerifiedAt = new Date().toISOString(),
}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await assertCanAddArenaMember(arenaId, membershipRole, connection);

    const [result] = await connection.query(
      `INSERT INTO users
        (first_name, last_name, email, password_hash, role, status, platform_role, cin_number, email_verified_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', 'member', ?, ?, NOW(3))`,
      [firstName, lastName, email, passwordHash, membershipRole, cinNumber, emailVerifiedAt]
    );

    await connection.query(
      `INSERT INTO arena_memberships (arena_id, user_id, role, status, created_at)
       VALUES (?, ?, ?, 'active', NOW(3))`,
      [arenaId, result.insertId, membershipRole]
    );

    await addActivityLog(connection, {
      arenaId,
      actorUserId: result.insertId,
      actorName: `${firstName} ${lastName}`,
      action: "Nouveau compte",
      detail: `Role: ${membershipRole}`,
    });

    await connection.commit();
    return findUserById(result.insertId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function createManagedUser({
  actor,
  firstName,
  lastName,
  email,
  passwordHash,
  arenaId,
  membershipRole,
  arenaName,
  cinNumber = null,
  emailVerifiedAt = new Date().toISOString(),
}) {
  if (!isAdminLike(actor)) {
    throw new Error("Admin access required");
  }

  let finalArenaId = arenaId;

  if (actor.effective_role === "super_admin" && membershipRole === "admin" && arenaName) {
    const arena = await createArena({ name: arenaName, location: "Plateforme ULTIMA" });
    finalArenaId = arena.id;
    firstName = "Admin";
    lastName = arenaName;
  }

  if (actor.effective_role === "admin") {
    if (finalArenaId !== actor.arena_id) {
      throw new Error("You can only create users in your arena");
    }

    if (!["player", "coach"].includes(membershipRole)) {
      throw new Error("Arena admins can only create players and coaches");
    }
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await assertCanAddArenaMember(finalArenaId, membershipRole, connection);

    const [result] = await connection.query(
      `INSERT INTO users
        (first_name, last_name, email, password_hash, role, status, platform_role, cin_number, email_verified_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', 'member', ?, ?, NOW(3))`,
      [firstName, lastName, email, passwordHash, membershipRole, cinNumber, emailVerifiedAt]
    );

    await connection.query(
      `INSERT INTO arena_memberships (arena_id, user_id, role, status, created_at)
       VALUES (?, ?, ?, 'active', NOW(3))`,
      [finalArenaId, result.insertId, membershipRole]
    );

    await addActivityLog(connection, {
      arenaId: finalArenaId,
      actorUserId: actor.id,
      actorName: `${actor.first_name} ${actor.last_name}`,
      action: "Compte cree par le staff",
      detail: `${firstName} ${lastName} (${membershipRole})`,
    });

    await connection.commit();
    return findUserById(result.insertId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    role: user.effective_role,
    status: user.effective_status,
    accountStatus: user.status,
    platformRole: user.platform_role,
    membershipRole: user.membership_role,
    membershipStatus: user.membership_status,
    arenaId: user.arena_id,
    arenaName: user.arena_name,
    cinNumber: user.cin_number ?? null,
    emailVerified: Boolean(user.email_verified_at),
    emailVerifiedAt: toIso(user.email_verified_at),
    createdAt: toIso(user.created_at),
  };
}

export async function requestPasswordReset(email) {
  const user = await findUserByEmail(String(email).trim().toLowerCase());
  if (!user) return { sent: true, token: null };
  const token = randomBytes(32).toString("hex");
  const code = generateSixDigitCode();
  await pool.query("DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL", [user.id]);
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at, created_at)
     VALUES (?, ?, DATE_ADD(NOW(3), INTERVAL 20 MINUTE), NOW(3))`,
    [user.id, `${token}:${code}`]
  );
  return {
    sent: true,
    token,
    code,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    },
  };
}

export async function requestEmailVerification(email) {
  const user = await findUserByEmail(String(email).trim().toLowerCase());
  if (!user) return { sent: true, token: null };
  if (user.email_verified_at) return { sent: true, token: null, alreadyVerified: true };
  const token = randomBytes(32).toString("hex");
  const code = generateSixDigitCode();
  await pool.query("DELETE FROM email_verification_tokens WHERE user_id = ? AND used_at IS NULL", [user.id]);
  await pool.query(
    `INSERT INTO email_verification_tokens (user_id, token, expires_at, created_at)
     VALUES (?, ?, DATE_ADD(NOW(3), INTERVAL 24 HOUR), NOW(3))`,
    [user.id, `${token}:${code}`]
  );
  return {
    sent: true,
    token,
    code,
    alreadyVerified: false,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    },
  };
}

export async function verifyEmailWithToken(token) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT *
       FROM email_verification_tokens
       WHERE (token = ? OR token LIKE CONCAT(?, ':%'))
         AND used_at IS NULL
         AND expires_at > NOW(3)
       ORDER BY id DESC
       LIMIT 1`,
      [token, token]
    );
    const match = rows[0];
    if (!match) throw new Error("Invalid or expired verification token");
    await connection.query("UPDATE users SET email_verified_at = NOW(3) WHERE id = ?", [match.user_id]);
    await connection.query("UPDATE email_verification_tokens SET used_at = NOW(3) WHERE id = ?", [match.id]);
    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function verifyEmailWithCode(email, code) {
  const user = await findUserByEmail(String(email).trim().toLowerCase());
  if (!user) {
    throw new Error("Invalid verification code");
  }
  const normalizedCode = String(code ?? "").trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error("Invalid verification code");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT *
       FROM email_verification_tokens
       WHERE user_id = ?
         AND token LIKE ?
         AND used_at IS NULL
         AND expires_at > NOW(3)
       ORDER BY id DESC
       LIMIT 1`,
      [user.id, `%:${normalizedCode}`]
    );
    const match = rows[0];
    if (!match) {
      throw new Error("Invalid or expired verification code");
    }
    await connection.query("UPDATE users SET email_verified_at = NOW(3) WHERE id = ?", [match.user_id]);
    await connection.query("UPDATE email_verification_tokens SET used_at = NOW(3) WHERE id = ?", [match.id]);
    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function resetPasswordWithToken(token, passwordHash) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT *
       FROM password_reset_tokens
       WHERE (token = ? OR token LIKE CONCAT(?, ':%'))
         AND used_at IS NULL
         AND expires_at > NOW(3)
       ORDER BY id DESC
       LIMIT 1`,
      [token, token]
    );
    const match = rows[0];
    if (!match) {
      throw new Error("Invalid or expired reset token");
    }
    await connection.query("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, match.user_id]);
    await connection.query("UPDATE password_reset_tokens SET used_at = NOW(3) WHERE id = ?", [match.id]);
    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function resetPasswordWithCode(email, code, passwordHash) {
  const user = await findUserByEmail(String(email).trim().toLowerCase());
  if (!user) {
    throw new Error("Invalid reset code");
  }
  const normalizedCode = String(code ?? "").trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error("Invalid reset code");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT *
       FROM password_reset_tokens
       WHERE user_id = ?
         AND token LIKE ?
         AND used_at IS NULL
         AND expires_at > NOW(3)
       ORDER BY id DESC
       LIMIT 1`,
      [user.id, `%:${normalizedCode}`]
    );
    const match = rows[0];
    if (!match) {
      throw new Error("Invalid or expired reset code");
    }
    await connection.query("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, match.user_id]);
    await connection.query("UPDATE password_reset_tokens SET used_at = NOW(3) WHERE id = ?", [match.id]);
    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getArenaBillingSummary(actor) {
  if (!isAdminLike(actor)) {
    throw new Error("Admin access required");
  }

  const arenaId = actor.effective_role === "super_admin" ? actor.arena_id : actor.arena_id;
  if (!arenaId) {
    throw new Error("Arena billing is not available for this account");
  }

  const subscription = await getArenaSubscriptionWithPlan(arenaId);
  const usage = await getArenaRoleUsage(arenaId);

  let features = subscription.features_json ?? {};
  if (typeof features === "string") {
    try {
      features = JSON.parse(features);
    } catch {
      features = {};
    }
  }

  return {
    arenaId,
    subscription: {
      id: subscription.id,
      status: subscription.status,
      provider: subscription.provider,
      providerCustomerId: subscription.provider_customer_id,
      providerSubscriptionId: subscription.provider_subscription_id,
      plan: {
        code: subscription.plan_code,
        name: subscription.plan_name,
        monthlyPriceCents: Number(subscription.monthly_price_cents ?? 0),
        yearlyPriceCents: Number(subscription.yearly_price_cents ?? 0),
      },
      period: {
        currentStart: toIso(subscription.current_period_start),
        currentEnd: toIso(subscription.current_period_end),
        trialEnd: toIso(subscription.trial_end),
      },
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    },
    limits: {
      admins: Number(subscription.max_admins ?? 0),
      coaches: Number(subscription.max_coaches ?? 0),
      players: Number(subscription.max_players ?? 0),
    },
    usage,
    features,
  };
}

export async function listBillingPlans() {
  const [rows] = await pool.query(
    `SELECT
       code,
       name,
       max_admins,
       max_coaches,
       max_players,
       features_json,
       monthly_price_cents,
       yearly_price_cents
     FROM billing_plans
     WHERE is_active = 1
     ORDER BY monthly_price_cents ASC`
  );

  return rows.map((row) => {
    let features = row.features_json ?? {};
    if (typeof features === "string") {
      try {
        features = JSON.parse(features);
      } catch {
        features = {};
      }
    }

    return {
      code: row.code,
      name: row.name,
      limits: {
        admins: Number(row.max_admins ?? 0),
        coaches: Number(row.max_coaches ?? 0),
        players: Number(row.max_players ?? 0),
      },
      prices: {
        monthlyCents: Number(row.monthly_price_cents ?? 0),
        yearlyCents: Number(row.yearly_price_cents ?? 0),
      },
      features,
    };
  });
}

export async function changeArenaPlan(actor, planCode, cycle = "monthly") {
  if (!isAdminLike(actor)) {
    throw new Error("Admin access required");
  }
  if (!actor.arena_id) {
    throw new Error("Arena not found for this account");
  }

  const [planRows] = await pool.query(
    `SELECT id, code, name, max_admins, max_coaches, max_players, features_json, monthly_price_cents, yearly_price_cents
     FROM billing_plans
     WHERE code = ? AND is_active = 1
     LIMIT 1`,
    [planCode]
  );
  const selectedPlan = planRows[0];
  if (!selectedPlan) {
    throw new Error("Plan not found");
  }

  const usage = await getArenaRoleUsage(actor.arena_id);
  if (usage.admins > Number(selectedPlan.max_admins) || usage.coaches > Number(selectedPlan.max_coaches) || usage.players > Number(selectedPlan.max_players)) {
    throw new Error("Current user count exceeds limits for the selected plan.");
  }

  await upsertArenaSubscriptionFromProvider({
    arenaId: actor.arena_id,
    planCode: selectedPlan.code,
    status: "active",
    provider: "manual",
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: new Date(Date.now() + (String(cycle) === "yearly" ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString(),
    trialEnd: null,
    cancelAtPeriodEnd: false,
  });

  return getArenaBillingSummary(actor);
}

export async function upsertArenaSubscriptionFromProvider({
  arenaId,
  planCode,
  status,
  provider = "stripe",
  providerCustomerId = null,
  providerSubscriptionId = null,
  currentPeriodStart = null,
  currentPeriodEnd = null,
  trialEnd = null,
  cancelAtPeriodEnd = false,
}) {
  const [planRows] = await pool.query(
    `SELECT id FROM billing_plans WHERE code = ? LIMIT 1`,
    [planCode]
  );
  const planId = planRows[0]?.id;
  if (!planId) {
    throw new Error("Invalid billing plan");
  }

  await pool.query(
    `INSERT INTO arena_subscriptions
      (arena_id, plan_id, status, provider, provider_customer_id, provider_subscription_id, current_period_start, current_period_end, trial_end, cancel_at_period_end, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
    [
      arenaId,
      planId,
      status,
      provider,
      providerCustomerId,
      providerSubscriptionId,
      currentPeriodStart,
      currentPeriodEnd,
      trialEnd,
      cancelAtPeriodEnd ? 1 : 0,
    ]
  );

  const [rows] = await pool.query(
    `SELECT id, arena_id, plan_id, status
     FROM arena_subscriptions
     WHERE arena_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [arenaId]
  );
  return rows[0] ?? null;
}

export async function getAdminOverview(actor) {
  if (!isAdminLike(actor)) {
    throw new Error("Admin access required");
  }

  const params = [];
  const whereArena = actor.effective_role === "super_admin" ? "" : "WHERE arena_memberships.arena_id = ?";
  if (whereArena) {
    params.push(actor.arena_id);
  }

  const [statsRows] = await pool.query(
    `SELECT
       COUNT(DISTINCT users.id) AS users,
       COUNT(DISTINCT CASE WHEN competitions.status = 'open' THEN competitions.id END) AS activeCompetitions,
       COUNT(DISTINCT competition_registrations.id) AS totalRegistrations,
       COUNT(DISTINCT matches.id) AS matchesThisWeek
     FROM users
     LEFT JOIN arena_memberships ON arena_memberships.user_id = users.id
     LEFT JOIN competitions ON competitions.arena_id = arena_memberships.arena_id
     LEFT JOIN competition_registrations ON competition_registrations.competition_id = competitions.id
     LEFT JOIN matches ON matches.arena_id = arena_memberships.arena_id
     ${whereArena}`,
    params
  );

  const [userRows] = await pool.query(
    `SELECT
       users.id,
       users.first_name,
       users.last_name,
       users.email,
       users.platform_role,
       users.status,
       arena_memberships.role AS membership_role,
       arena_memberships.status AS membership_status,
       arenas.id AS arena_id,
       arenas.name AS arena_name,
       users.created_at
     FROM users
     LEFT JOIN arena_memberships ON arena_memberships.user_id = users.id
     LEFT JOIN arenas ON arenas.id = arena_memberships.arena_id
     ${whereArena}
     ORDER BY users.id ASC`,
    params
  );

  const [courtRows] = await pool.query(
    `SELECT
       courts.*,
       arenas.name AS arena_name
     FROM courts
     JOIN arenas ON arenas.id = courts.arena_id
     ${actor.effective_role === "super_admin" ? "" : "WHERE courts.arena_id = ?"}
     ORDER BY courts.id ASC`,
    actor.effective_role === "super_admin" ? [] : [actor.arena_id]
  );

  const [logRows] = await pool.query(
    `SELECT
       activity_logs.*,
       arenas.name AS arena_name
     FROM activity_logs
     LEFT JOIN arenas ON arenas.id = activity_logs.arena_id
     ${actor.effective_role === "super_admin" ? "" : "WHERE activity_logs.arena_id = ?"}
     ORDER BY activity_logs.created_at DESC
     LIMIT 12`,
    actor.effective_role === "super_admin" ? [] : [actor.arena_id]
  );

  const arenas = actor.effective_role === "super_admin" ? await listArenas() : [];

  return {
    stats: statsRows[0],
    users: userRows.map(sanitizeMembershipUser),
    courts: courtRows.map(sanitizeCourt),
    logs: logRows.map(sanitizeLog),
    arenas,
  };
}

export async function createCourt({
  actor,
  arenaId,
  name,
  sport,
  location,
  hasSumma = 0,
  minPlayers = 2,
  maxPlayers = 4,
  openingTime = "08:00",
  closingTime = "22:00",
}) {
  if (!isAdminLike(actor)) {
    throw new Error("Admin access required");
  }

  const resolvedArenaId = Number(arenaId);
  if (!resolvedArenaId) {
    throw new Error("Arena is required");
  }

  if (actor.effective_role === "admin" && resolvedArenaId !== actor.arena_id) {
    throw new Error("You can only create courts in your arena");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO courts
        (arena_id, name, sport, status, has_summa, location, min_players, max_players, opening_time, closing_time, created_at)
       VALUES (?, ?, ?, 'available', ?, ?, ?, ?, ?, ?, NOW(3))`,
      [resolvedArenaId, name, sport, Number(hasSumma) ? 1 : 0, location, Number(minPlayers), Number(maxPlayers), openingTime, closingTime]
    );

    await addActivityLog(connection, {
      arenaId: resolvedArenaId,
      actorUserId: actor.id,
      actorName: `${actor.first_name} ${actor.last_name}`,
      action: "Terrain cree",
      detail: `${name} (${sport})`,
    });

    await connection.commit();

    const [rows] = await pool.query(
      `SELECT
         courts.*,
         arenas.name AS arena_name,
         arenas.location AS arena_location
       FROM courts
       JOIN arenas ON arenas.id = courts.arena_id
       WHERE courts.id = ?
       LIMIT 1`,
      [result.insertId]
    );

    return sanitizeCourt(rows[0]);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listAdminReservations(actor) {
  if (!isAdminLike(actor)) {
    throw new Error("Admin access required");
  }

  const [rows] = await pool.query(
    `SELECT
       reservations.id,
       reservations.reservation_date,
       reservations.start_time,
       reservations.end_time,
       reservations.status,
       reservations.notes,
       reservations.created_at,
       reservations.qr_token,
       courts.name AS court_name,
       arenas.name AS arena_name,
       creator.email AS owner_email,
       CONCAT(creator.first_name, ' ', creator.last_name) AS owner_name
     FROM reservations
     JOIN courts ON courts.id = reservations.court_id
     JOIN arenas ON arenas.id = courts.arena_id
     JOIN users AS creator ON creator.id = reservations.user_id
     ${actor.effective_role === "super_admin" ? "" : "WHERE courts.arena_id = ?"}
     ORDER BY reservations.reservation_date DESC, reservations.start_time DESC`,
    actor.effective_role === "super_admin" ? [] : [actor.arena_id]
  );

  return rows.map((row) => ({
    ...row,
    created_at: toIso(row.created_at),
    reservation_date: row.reservation_date instanceof Date ? row.reservation_date.toISOString().split("T")[0] : String(row.reservation_date).split("T")[0],
    start_time: String(row.start_time).slice(0, 5),
    end_time: String(row.end_time).slice(0, 5),
    special_code: `ULT-${row.id}-${createHmac("sha256", BILLING_SECRET).update(`${row.id}|${row.qr_token}|${row.reservation_date}|${String(row.start_time).slice(0, 8)}|${String(row.end_time).slice(0, 8)}`).digest("hex").slice(0, 8).toUpperCase()}`,
  }));
}

export async function updateAdminReservationStatus(actor, reservationId, nextStatus) {
  if (!["confirmed", "cancelled"].includes(nextStatus)) {
    throw new Error("Invalid reservation status");
  }

  if (!isAdminLike(actor)) {
    throw new Error("Admin access required");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT
         reservations.*,
         courts.arena_id,
         courts.name AS court_name
       FROM reservations
       JOIN courts ON courts.id = reservations.court_id
       WHERE reservations.id = ?
       LIMIT 1`,
      [reservationId]
    );

    const reservation = rows[0];
    if (!reservation) {
      throw new Error("Reservation not found");
    }

    if (actor.effective_role === "admin" && reservation.arena_id !== actor.arena_id) {
      throw new Error("You can only manage reservations in your arena");
    }

    await connection.query(
      `UPDATE reservations
       SET status = ?
       WHERE id = ?`,
      [nextStatus, reservationId]
    );

    await addActivityLog(connection, {
      arenaId: reservation.arena_id,
      actorUserId: actor.id,
      actorName: `${actor.first_name} ${actor.last_name}`,
      action: nextStatus === "cancelled" ? "Reservation annulee (admin)" : "Reservation reactivee (admin)",
      detail: `${reservation.court_name} - ${reservation.reservation_date} ${String(reservation.start_time).slice(0, 5)}`,
    });

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateMembershipStatus(actor, targetUserId, nextStatus) {
  if (!["active", "inactive"].includes(nextStatus)) {
    throw new Error("Invalid status");
  }

  if (!isAdminLike(actor)) {
    throw new Error("Admin access required");
  }

  if (actor.id === targetUserId) {
    throw new Error("You cannot change your own status");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const target = await findUserById(targetUserId, connection);
    if (!target) {
      throw new Error("User not found");
    }

    if (actor.effective_role === "admin") {
      if (target.platform_role === "super_admin" || target.membership_role === "admin") {
        throw new Error("Only a super admin can activate or deactivate admins");
      }

      if (target.arena_id !== actor.arena_id) {
        throw new Error("You can only manage users in your arena");
      }
    }

    if (target.platform_role === "super_admin") {
      throw new Error("Super admin status cannot be changed here");
    }

    await connection.query("UPDATE users SET status = ? WHERE id = ?", [nextStatus, targetUserId]);
    await connection.query("UPDATE arena_memberships SET status = ? WHERE user_id = ?", [nextStatus, targetUserId]);

    await addActivityLog(connection, {
      arenaId: target.arena_id,
      actorUserId: actor.id,
      actorName: `${actor.first_name} ${actor.last_name}`,
      action: nextStatus === "active" ? "Compte reactive" : "Compte desactive",
      detail: `${target.first_name} ${target.last_name}`,
    });

    await connection.commit();
    return findUserById(targetUserId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateMembershipRole(actor, targetUserId, nextRole, nextArenaId = null) {
  if (!["player", "coach", "admin"].includes(nextRole)) {
    throw new Error("Invalid role");
  }

  if (!isAdminLike(actor)) {
    throw new Error("Admin access required");
  }

  if (actor.id === targetUserId) {
    throw new Error("You cannot change your own role");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const target = await findUserById(targetUserId, connection);
    if (!target) {
      throw new Error("User not found");
    }

    if (target.platform_role === "super_admin") {
      throw new Error("Super admin roles cannot be changed here");
    }

    let resolvedArenaId = nextArenaId ? Number(nextArenaId) : Number(target.arena_id);
    if (actor.effective_role === "super_admin") {
      if (!resolvedArenaId) throw new Error("Arena is required");
    } else {
      if (target.arena_id !== actor.arena_id) throw new Error("You can only manage users in your arena");
      if (!["player", "coach"].includes(nextRole)) throw new Error("Arena admins can only assign player or coach roles");
      if (target.membership_role === "admin") throw new Error("Only a super admin can change admin roles");
      resolvedArenaId = Number(actor.arena_id);
    }

    if (target.membership_role === nextRole && Number(target.arena_id) === Number(resolvedArenaId)) {
      await connection.commit();
      return target;
    }

    await assertCanAddArenaMember(resolvedArenaId, nextRole, connection);

    await connection.query("UPDATE users SET role = ? WHERE id = ?", [nextRole, targetUserId]);
    const [membershipRows] = await connection.query("SELECT id, arena_id FROM arena_memberships WHERE user_id = ? ORDER BY id ASC", [targetUserId]);
    const existingForArena = membershipRows.find((row) => Number(row.arena_id) === Number(resolvedArenaId));
    const keptMembership = existingForArena ?? membershipRows[0] ?? null;
    if (keptMembership?.id) {
      await connection.query("UPDATE arena_memberships SET arena_id = ?, role = ?, status = 'active' WHERE id = ?", [resolvedArenaId, nextRole, keptMembership.id]);
      await connection.query("DELETE FROM arena_memberships WHERE user_id = ? AND id <> ?", [targetUserId, keptMembership.id]);
    } else {
      await connection.query("INSERT INTO arena_memberships (arena_id, user_id, role, status, created_at) VALUES (?, ?, ?, 'active', NOW())", [resolvedArenaId, targetUserId, nextRole]);
    }

    await addActivityLog(connection, {
      arenaId: resolvedArenaId,
      actorUserId: actor.id,
      actorName: `${actor.first_name} ${actor.last_name}`,
      action: "Role utilisateur mis a jour",
      detail: `${target.first_name} ${target.last_name}: ${target.membership_role} -> ${nextRole}`,
    });

    await connection.commit();
    return findUserById(targetUserId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteUser(actor, targetUserId) {
  if (!isAdminLike(actor)) {
    throw new Error("Admin access required");
  }

  if (actor.id === targetUserId) {
    throw new Error("You cannot delete your own account");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const target = await findUserById(targetUserId, connection);
    if (!target) {
      throw new Error("User not found");
    }

    if (target.effective_status !== "inactive") {
      throw new Error("Only inactive users can be deleted");
    }

    if (actor.effective_role === "admin") {
      if (target.platform_role === "super_admin" || target.membership_role === "admin") {
        throw new Error("Only a super admin can delete admins");
      }
      if (target.arena_id !== actor.arena_id) {
        throw new Error("You can only delete users in your arena");
      }
    }

    if (target.platform_role === "super_admin") {
      throw new Error("Super admin accounts cannot be deleted");
    }

    // Attempt to delete (if there are foreign key constraints like reservations, we must delete those too or rely on CASCADE)
    // Actually, in the demo schema, usually reservation_participants CASCADE, but reservations themselves don't.
    await connection.query("DELETE FROM reservation_participants WHERE user_id = ?", [targetUserId]);
    await connection.query("DELETE FROM reservations WHERE user_id = ?", [targetUserId]);
    await connection.query("DELETE FROM competition_registrations WHERE user_id = ?", [targetUserId]);
    await connection.query("DELETE FROM performance_snapshots WHERE user_id = ?", [targetUserId]);
    await connection.query("DELETE FROM performance_profiles WHERE user_id = ?", [targetUserId]);
    await connection.query("DELETE FROM ai_analyses WHERE user_id = ?", [targetUserId]);
    await connection.query("DELETE FROM activity_logs WHERE actor_user_id = ?", [targetUserId]);
    
    await connection.query("DELETE FROM arena_memberships WHERE user_id = ?", [targetUserId]);
    await connection.query("DELETE FROM users WHERE id = ?", [targetUserId]);

    await addActivityLog(connection, {
      arenaId: target.arena_id,
      actorUserId: actor.id,
      actorName: `${actor.first_name} ${actor.last_name}`,
      action: "Compte supprime",
      detail: `${target.first_name} ${target.last_name}`,
    });

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getPerformanceForUser(userId) {
  const [snapshotRows] = await pool.query(
    `SELECT week_label, ranking_score, wins, losses, created_at
     FROM performance_snapshots
     WHERE user_id = ?
     ORDER BY id ASC`,
    [userId]
  );
  const [profileRows] = await pool.query(
    `SELECT service, return_skill, volley, endurance, strategy, mental, updated_at
     FROM performance_profiles
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );

  const latest = snapshotRows.at(-1) ?? null;
  const profile = profileRows[0] ?? null;

  return {
    summary: latest
      ? {
          rankingScore: latest.ranking_score,
          winRate: `${Math.max(60, 70 + snapshotRows.length)}%`,
          streak: `${Math.min(5, snapshotRows.length)} victoires`,
          matchesThisMonth: snapshotRows.length,
        }
      : null,
    progress: snapshotRows.map((row) => ({
      semaine: row.week_label,
      score: row.ranking_score,
      victoires: row.wins,
      defaites: row.losses,
    })),
    radar: profile
      ? [
          { skill: "Service", value: profile.service },
          { skill: "Retour", value: profile.return_skill },
          { skill: "Volee", value: profile.volley },
          { skill: "Endurance", value: profile.endurance },
          { skill: "Strategie", value: profile.strategy },
          { skill: "Mental", value: profile.mental },
        ]
      : [],
  };
}

export async function listAnalysesForUser(userId) {
  try {
    const [rows] = await pool.query(
      `SELECT id, user_id AS userId, title, video_name AS videoName, status, summary,
              uploader_user_id AS uploaderUserId, subject_user_id AS subjectUserId, match_id AS matchId,
              storage_path AS storagePath, uploaded_at AS uploadedAt, created_at AS createdAt
       FROM ai_analyses
       WHERE user_id = ? OR subject_user_id = ?
       ORDER BY created_at DESC`,
      [userId, userId]
    );

    return rows.map((row) => ({ ...row, uploadedAt: toIso(row.uploadedAt), createdAt: toIso(row.createdAt) }));
  } catch {
    return [];
  }
}

export async function persistRefreshToken(userId, token, expiresAt) {
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at, created_at)
     VALUES (?, ?, ?, NOW(3))`,
    [userId, token, expiresAt]
  );
}

export async function consumeRefreshToken(token) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT * FROM refresh_tokens
       WHERE token = ?
         AND revoked_at IS NULL
         AND expires_at > NOW(3)
       LIMIT 1
       FOR UPDATE`,
      [token]
    );
    if (!rows[0]) {
      await connection.rollback();
      return null;
    }
    await connection.query("UPDATE refresh_tokens SET revoked_at = NOW(3) WHERE id = ?", [rows[0].id]);
    await connection.commit();
    return rows[0];
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function revokeRefreshTokensForUser(userId) {
  await pool.query("UPDATE refresh_tokens SET revoked_at = NOW(3) WHERE user_id = ? AND revoked_at IS NULL", [userId]);
}

export async function listNotificationsForUser(userId) {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, body, type, link_url AS linkUrl, read_at AS readAt, created_at AS createdAt
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );
    return rows.map((row) => ({ ...row, readAt: toIso(row.readAt), createdAt: toIso(row.createdAt) }));
  } catch {
    return [];
  }
}

export async function createNotification({ userId, title, body, type = "info", linkUrl = null }) {
  const [result] = await pool.query(
    `INSERT INTO notifications (user_id, title, body, type, link_url, created_at)
     VALUES (?, ?, ?, ?, ?, NOW(3))`,
    [userId, title, body, type, linkUrl]
  );
  const [rows] = await pool.query(
    `SELECT id, title, body, type, link_url AS linkUrl, read_at AS readAt, created_at AS createdAt
     FROM notifications
     WHERE id = ?`,
    [result.insertId]
  );
  return rows[0] ? { ...rows[0], readAt: toIso(rows[0].readAt), createdAt: toIso(rows[0].createdAt) } : null;
}

export async function markNotificationRead(userId, notificationId) {
  await pool.query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, NOW(3))
     WHERE id = ? AND user_id = ?`,
    [notificationId, userId]
  );
  const [rows] = await pool.query(
    `SELECT id, title, body, type, link_url AS linkUrl, read_at AS readAt, created_at AS createdAt
     FROM notifications
     WHERE id = ? AND user_id = ?`,
    [notificationId, userId]
  );
  return rows[0] ? { ...rows[0], readAt: toIso(rows[0].readAt), createdAt: toIso(rows[0].createdAt) } : null;
}

export async function createAnalysis({ userId, title, videoName, uploaderUserId = null, subjectUserId = null, matchId = null, storagePath = null, status = "queued", summary = null }) {
  const [result] = await pool.query(
    `INSERT INTO ai_analyses (user_id, title, video_name, status, summary, uploader_user_id, subject_user_id, match_id, storage_path, uploaded_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
    [userId, title, videoName, status, summary ?? "Analyse en attente de traitement par le module IA.", uploaderUserId ?? userId, subjectUserId ?? userId, matchId, storagePath]
  );

  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, title, video_name AS videoName, status, summary,
            uploader_user_id AS uploaderUserId, subject_user_id AS subjectUserId, match_id AS matchId,
            storage_path AS storagePath, uploaded_at AS uploadedAt, created_at AS createdAt
     FROM ai_analyses
     WHERE id = ?`,
    [result.insertId]
  );

  return {
    ...rows[0],
    uploadedAt: toIso(rows[0].uploadedAt),
    createdAt: toIso(rows[0].createdAt),
  };
}

export async function getPlayerDashboardData(userId) {
  const [matchStats] = await pool.query(
    `SELECT 
       COUNT(*) as totalMatches,
       SUM(CASE WHEN winner_team = (CASE WHEN team1_player1_id = ? OR team1_player2_id = ? THEN 1 ELSE 2 END) THEN 1 ELSE 0 END) as wins,
       SUM(CASE WHEN winner_team != (CASE WHEN team1_player1_id = ? OR team1_player2_id = ? THEN 1 ELSE 2 END) THEN 1 ELSE 0 END) as losses
     FROM matches 
     WHERE (team1_player1_id = ? OR team1_player2_id = ? OR team2_player1_id = ? OR team2_player2_id = ?)
     AND status = 'finished'`,
    [userId, userId, userId, userId, userId, userId, userId, userId]
  );

  const [upcoming] = await pool.query(
    `SELECT COUNT(*) as count 
     FROM reservations 
     WHERE id IN (SELECT reservation_id FROM reservation_participants WHERE user_id = ?)
     AND reservation_date >= CURRENT_DATE()
     AND status = 'confirmed'`,
    [userId]
  );

  const [ranking] = await pool.query(
    `SELECT ranking_score FROM performance_snapshots WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
    [userId]
  );

  const stats = matchStats[0] || { totalMatches: 0, wins: 0, losses: 0 };
  const winRate = stats.totalMatches > 0 ? Math.round((stats.wins / stats.totalMatches) * 100) : 0;

  return {
    totalMatches: stats.totalMatches,
    winRate: `${winRate}%`,
    ranking: ranking[0]?.ranking_score || 1000,
    upcomingBookings: upcoming[0]?.count || 0,
    wins: stats.wins,
    losses: stats.losses
  };
}

export async function listPlayerMatches(userId) {
  const [rows] = await pool.query(
    `SELECT 
       matches.*,
       courts.name as court_name,
       arenas.name as arena_name
     FROM matches
     JOIN courts ON courts.id = matches.court_id
     JOIN arenas ON arenas.id = matches.arena_id
     WHERE (team1_player1_id = ? OR team1_player2_id = ? OR team2_player1_id = ? OR team2_player2_id = ?)
     ORDER BY scheduled_at DESC`,
    [userId, userId, userId, userId]
  );
  return rows.map(r => ({
    ...r,
    scheduled_at: toIso(r.scheduled_at),
    score1: parseJsonColumn(r.score1),
    score2: parseJsonColumn(r.score2)
  }));
}

const normalizeRelationshipPermissions = (permissions = {}) => ({
  canViewPerformance: permissions.canViewPerformance !== false,
  canViewReservations: permissions.canViewReservations !== false,
  canScheduleSessions: permissions.canScheduleSessions !== false,
  canViewNotes: permissions.canViewNotes === true,
});

const normalizeRelationship = (row) => {
  const startDate =
    row.start_date instanceof Date ? row.start_date.toISOString().split("T")[0] : String(row.start_date).split("T")[0];
  const endDate = row.end_date
    ? row.end_date instanceof Date
      ? row.end_date.toISOString().split("T")[0]
      : String(row.end_date).split("T")[0]
    : null;

  return {
    id: row.id,
    arenaId: row.arena_id,
    coachUserId: row.coach_user_id,
    coachName: row.coach_name ?? null,
    playerUserId: row.player_user_id,
    playerName: row.player_name ?? null,
    status: row.status,
    requestedByUserId: row.requested_by_user_id,
    respondedByUserId: row.responded_by_user_id ?? null,
    permissions: {
      canViewPerformance: Boolean(row.can_view_performance),
      canViewReservations: Boolean(row.can_view_reservations),
      canScheduleSessions: Boolean(row.can_schedule_sessions),
      canViewNotes: Boolean(row.can_view_notes),
    },
    consentVersion: Number(row.consent_version ?? 1),
    consentGrantedAt: toIso(row.consent_granted_at),
    startDate,
    endDate,
    notes: row.notes ?? "",
    respondedAt: toIso(row.responded_at),
    lastReminderAt: toIso(row.last_reminder_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
};

async function getActiveCoachRelationshipForStudent(coachUserId, studentId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT *
     FROM coach_player_relationships
     WHERE coach_user_id = ?
       AND player_user_id = ?
       AND status = 'active'
       AND start_date <= CURRENT_DATE()
       AND (end_date IS NULL OR end_date >= CURRENT_DATE())
     ORDER BY updated_at DESC
     LIMIT 1`,
    [coachUserId, studentId]
  );
  return rows[0] ?? null;
}

async function getCoachActor(userId) {
  const actor = await findUserById(userId);
  if (!actor) {
    throw new Error("Coach not found");
  }

  if (actor.effective_status !== "active") {
    throw new Error("This account is inactive");
  }

  if (!isCoachLike(actor)) {
    throw new Error("Coach access required");
  }

  if (!actor.arena_id) {
    throw new Error("Coach must belong to an arena");
  }

  return actor;
}

export async function listCoachesForPlayer(playerUserId) {
  const actor = await requireActiveActor(playerUserId, pool);
  if (!actor.arena_id) {
    throw new Error("Player must belong to an arena");
  }

  const [rows] = await pool.query(
    `SELECT
       users.id,
       users.first_name,
       users.last_name,
       users.email,
       arena_memberships.role AS membership_role
     FROM users
     JOIN arena_memberships ON arena_memberships.user_id = users.id
     WHERE arena_memberships.arena_id = ?
       AND arena_memberships.status = 'active'
       AND users.status = 'active'
       AND arena_memberships.role IN ('coach', 'admin')
     ORDER BY users.first_name ASC, users.last_name ASC`,
    [actor.arena_id]
  );

  return rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    role: row.membership_role,
  }));
}

export async function listCoachRelationshipsForUser(userId) {
  const actor = await requireActiveActor(userId, pool);

  const [rows] = await pool.query(
    `SELECT
       links.*,
       CONCAT(coach.first_name, ' ', coach.last_name) AS coach_name,
       CONCAT(player.first_name, ' ', player.last_name) AS player_name
     FROM coach_player_relationships links
     JOIN users coach ON coach.id = links.coach_user_id
     JOIN users player ON player.id = links.player_user_id
     WHERE links.coach_user_id = ? OR links.player_user_id = ?
     ORDER BY links.updated_at DESC`,
    [actor.id, actor.id]
  );

  return rows.map(normalizeRelationship);
}

export async function requestCoachRelationship(
  playerUserId,
  {
    coachUserId,
    startDate = null,
    endDate = null,
    notes = "",
    permissions = {},
    consentVersion = 1,
  }
) {
  const player = await requireActiveActor(playerUserId, pool);
  if (!player.arena_id) {
    throw new Error("Player must belong to an arena");
  }

  const coach = await findUserById(Number(coachUserId));
  if (!coach) {
    throw new Error("Coach not found");
  }

  if (coach.arena_id !== player.arena_id) {
    throw new Error("Coach must be in the same arena");
  }

  if (!["coach", "admin", "super_admin"].includes(coach.effective_role)) {
    throw new Error("Selected user is not a coach");
  }

  if (coach.effective_status !== "active") {
    throw new Error("Selected coach is inactive");
  }

  if (coach.id === player.id) {
    throw new Error("You cannot request yourself as coach");
  }

  const normalizedPermissions = normalizeRelationshipPermissions(permissions);
  const resolvedStartDate = startDate || new Date().toISOString().split("T")[0];
  if (endDate && endDate < resolvedStartDate) {
    throw new Error("End date must be greater than or equal to start date");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existing] = await connection.query(
      `SELECT id, status
       FROM coach_player_relationships
       WHERE coach_user_id = ?
         AND player_user_id = ?
         AND status IN ('pending', 'active', 'paused')
       ORDER BY updated_at DESC
       LIMIT 1`,
      [coach.id, player.id]
    );

    if (existing[0]) {
      throw new Error("A relationship request already exists with this coach");
    }

    const [result] = await connection.query(
      `INSERT INTO coach_player_relationships
        (arena_id, coach_user_id, player_user_id, status, requested_by_user_id, can_view_performance, can_view_reservations, can_schedule_sessions, can_view_notes, consent_version, start_date, end_date, notes, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
      [
        player.arena_id,
        coach.id,
        player.id,
        player.id,
        normalizedPermissions.canViewPerformance ? 1 : 0,
        normalizedPermissions.canViewReservations ? 1 : 0,
        normalizedPermissions.canScheduleSessions ? 1 : 0,
        normalizedPermissions.canViewNotes ? 1 : 0,
        Number(consentVersion) || 1,
        resolvedStartDate,
        endDate || null,
        String(notes || "").trim(),
      ]
    );

    await addActivityLog(connection, {
      arenaId: player.arena_id,
      actorUserId: player.id,
      actorName: `${player.first_name} ${player.last_name}`,
      action: "Coach request",
      detail: `Player requested coach ${coach.first_name} ${coach.last_name}`,
    });

    await connection.commit();

    const [rows] = await pool.query(
      `SELECT
         links.*,
         CONCAT(coach.first_name, ' ', coach.last_name) AS coach_name,
         CONCAT(player.first_name, ' ', player.last_name) AS player_name
       FROM coach_player_relationships links
       JOIN users coach ON coach.id = links.coach_user_id
       JOIN users player ON player.id = links.player_user_id
       WHERE links.id = ?`,
      [result.insertId]
    );

    return normalizeRelationship(rows[0]);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function respondCoachRelationship(responderUserId, relationshipId, decision) {
  const responder = await requireActiveActor(responderUserId, pool);
  const normalizedDecision = String(decision || "").toLowerCase();
  if (!["accept", "reject"].includes(normalizedDecision)) {
    throw new Error("Decision must be accept or reject");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT * FROM coach_player_relationships WHERE id = ? LIMIT 1`,
      [Number(relationshipId)]
    );
    const relationship = rows[0];
    if (!relationship) {
      throw new Error("Relationship not found");
    }

    const canRespond =
      responder.id === relationship.coach_user_id ||
      (isAdminLike(responder) && responder.arena_id === relationship.arena_id);
    if (!canRespond) {
      throw new Error("You cannot respond to this relationship request");
    }

    if (relationship.status !== "pending") {
      throw new Error("Only pending requests can be responded to");
    }

    const nextStatus = normalizedDecision === "accept" ? "active" : "rejected";
    await connection.query(
      `UPDATE coach_player_relationships
       SET status = ?,
           responded_by_user_id = ?,
           responded_at = NOW(3),
           consent_granted_at = CASE WHEN ? = 'active' THEN NOW(3) ELSE consent_granted_at END,
           updated_at = NOW(3)
       WHERE id = ?`,
      [nextStatus, responder.id, nextStatus, relationship.id]
    );

    await addActivityLog(connection, {
      arenaId: relationship.arena_id,
      actorUserId: responder.id,
      actorName: `${responder.first_name} ${responder.last_name}`,
      action: nextStatus === "active" ? "Coach request accepted" : "Coach request rejected",
      detail: `Relationship #${relationship.id}`,
    });

    await connection.commit();
    const [updatedRows] = await pool.query(
      `SELECT
         links.*,
         CONCAT(coach.first_name, ' ', coach.last_name) AS coach_name,
         CONCAT(player.first_name, ' ', player.last_name) AS player_name
       FROM coach_player_relationships links
       JOIN users coach ON coach.id = links.coach_user_id
       JOIN users player ON player.id = links.player_user_id
       WHERE links.id = ?`,
      [relationship.id]
    );
    return normalizeRelationship(updatedRows[0]);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateCoachRelationshipSettings(
  actorUserId,
  relationshipId,
  { status, endDate, permissions, notes }
) {
  const actor = await requireActiveActor(actorUserId, pool);

  const [rows] = await pool.query(
    `SELECT * FROM coach_player_relationships WHERE id = ? LIMIT 1`,
    [Number(relationshipId)]
  );
  const relationship = rows[0];
  if (!relationship) {
    throw new Error("Relationship not found");
  }

  const isOwner = actor.id === relationship.player_user_id || actor.id === relationship.coach_user_id;
  const isArenaAdmin = isAdminLike(actor) && actor.arena_id === relationship.arena_id;
  if (!isOwner && !isArenaAdmin) {
    throw new Error("Not allowed to update this relationship");
  }

  const updates = [];
  const params = [];

  if (status) {
    const allowedStatuses = ["active", "paused", "ended"];
    if (!allowedStatuses.includes(status)) {
      throw new Error("Invalid relationship status");
    }
    updates.push("status = ?");
    params.push(status);
  }

  if (typeof endDate !== "undefined") {
    updates.push("end_date = ?");
    params.push(endDate || null);
  }

  if (typeof notes !== "undefined") {
    updates.push("notes = ?");
    params.push(String(notes || "").trim());
  }

  if (permissions && typeof permissions === "object") {
    const normalizedPermissions = normalizeRelationshipPermissions(permissions);
    updates.push("can_view_performance = ?");
    params.push(normalizedPermissions.canViewPerformance ? 1 : 0);
    updates.push("can_view_reservations = ?");
    params.push(normalizedPermissions.canViewReservations ? 1 : 0);
    updates.push("can_schedule_sessions = ?");
    params.push(normalizedPermissions.canScheduleSessions ? 1 : 0);
    updates.push("can_view_notes = ?");
    params.push(normalizedPermissions.canViewNotes ? 1 : 0);
  }

  if (!updates.length) {
    throw new Error("No changes submitted");
  }

  params.push(Number(relationshipId));
  await pool.query(
    `UPDATE coach_player_relationships
     SET ${updates.join(", ")}, updated_at = NOW(3)
     WHERE id = ?`,
    params
  );

  const [updatedRows] = await pool.query(
    `SELECT
       links.*,
       CONCAT(coach.first_name, ' ', coach.last_name) AS coach_name,
       CONCAT(player.first_name, ' ', player.last_name) AS player_name
     FROM coach_player_relationships links
     JOIN users coach ON coach.id = links.coach_user_id
     JOIN users player ON player.id = links.player_user_id
     WHERE links.id = ?`,
    [Number(relationshipId)]
  );

  return normalizeRelationship(updatedRows[0]);
}

export async function listCoachRelationshipExpiryReminders(userId, days = 7) {
  const actor = await requireActiveActor(userId, pool);
  const safeDays = Math.min(60, Math.max(1, Number(days) || 7));

  const [rows] = await pool.query(
    `SELECT
       links.*,
       CONCAT(coach.first_name, ' ', coach.last_name) AS coach_name,
       CONCAT(player.first_name, ' ', player.last_name) AS player_name
     FROM coach_player_relationships links
     JOIN users coach ON coach.id = links.coach_user_id
     JOIN users player ON player.id = links.player_user_id
     WHERE links.status = 'active'
       AND links.end_date IS NOT NULL
       AND links.end_date >= CURRENT_DATE()
       AND links.end_date <= DATE_ADD(CURRENT_DATE(), INTERVAL ? DAY)
       AND (
         ( ? IN (links.coach_user_id, links.player_user_id) )
         OR ( ? = 'super_admin' )
         OR ( ? = 'admin' AND ? = links.arena_id )
       )
     ORDER BY links.end_date ASC`,
    [safeDays, actor.id, actor.effective_role, actor.effective_role, actor.arena_id]
  );

  return rows.map((row) => ({
    ...normalizeRelationship(row),
    reminder: `Relationship expires on ${row.end_date instanceof Date ? row.end_date.toISOString().split("T")[0] : String(row.end_date).split("T")[0]}`,
  }));
}

export async function createOrUpdateCoachRelationshipSeed({
  coachUserId,
  playerUserId,
  status = "active",
  requestedByUserId = null,
  startDate = null,
  endDate = null,
  notes = "Seeded relationship",
}) {
  const coach = await findUserById(Number(coachUserId));
  const player = await findUserById(Number(playerUserId));
  if (!coach || !player) {
    throw new Error("Seed relationship users not found");
  }

  const resolvedStartDate = startDate || new Date().toISOString().split("T")[0];
  const [existing] = await pool.query(
    `SELECT id FROM coach_player_relationships WHERE coach_user_id = ? AND player_user_id = ? ORDER BY id DESC LIMIT 1`,
    [coach.id, player.id]
  );

  if (existing[0]) {
    await pool.query(
      `UPDATE coach_player_relationships
       SET status = ?,
           requested_by_user_id = ?,
           start_date = ?,
           end_date = ?,
           notes = ?,
           consent_granted_at = CASE WHEN ? = 'active' THEN NOW(3) ELSE consent_granted_at END,
           updated_at = NOW(3)
       WHERE id = ?`,
      [status, requestedByUserId || player.id, resolvedStartDate, endDate || null, String(notes || "").trim(), status, existing[0].id]
    );
    return existing[0].id;
  }

  const [result] = await pool.query(
    `INSERT INTO coach_player_relationships
      (arena_id, coach_user_id, player_user_id, status, requested_by_user_id, can_view_performance, can_view_reservations, can_schedule_sessions, can_view_notes, consent_version, consent_granted_at, start_date, end_date, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 1, 1, 0, 1, CASE WHEN ? = 'active' THEN NOW(3) ELSE NULL END, ?, ?, ?, NOW(3), NOW(3))`,
    [player.arena_id, coach.id, player.id, status, requestedByUserId || player.id, status, resolvedStartDate, endDate || null, String(notes || "").trim()]
  );
  return result.insertId;
}

export async function listCoachStudents(coachUserId) {
  const actor = await getCoachActor(coachUserId);

  const [rows] = await pool.query(
    `SELECT
       users.id,
       users.first_name,
       users.last_name,
       users.email,
       users.created_at,
       COALESCE(latest_snapshot.ranking_score, 1000) AS ranking_score,
       COALESCE(match_stats.matches_played, 0) AS matches_played,
       COALESCE(match_stats.wins, 0) AS wins,
       COALESCE(match_stats.losses, 0) AS losses
       links.id AS relationship_id,
       links.start_date,
       links.end_date,
       links.can_view_performance,
       links.can_view_reservations,
       links.can_schedule_sessions,
       links.can_view_notes
     FROM coach_player_relationships links
     JOIN users ON users.id = links.player_user_id
     JOIN arena_memberships ON arena_memberships.user_id = users.id
     LEFT JOIN (
       SELECT ps.user_id, ps.ranking_score
       FROM performance_snapshots ps
       JOIN (
         SELECT user_id, MAX(id) AS max_id
         FROM performance_snapshots
         GROUP BY user_id
       ) latest_ids ON latest_ids.user_id = ps.user_id AND latest_ids.max_id = ps.id
     ) latest_snapshot ON latest_snapshot.user_id = users.id
     LEFT JOIN (
       SELECT
         p.user_id,
         COUNT(*) AS matches_played,
         SUM(
           CASE
             WHEN matches.winner_team = 1 AND (matches.team1_player1_id = p.user_id OR matches.team1_player2_id = p.user_id) THEN 1
             WHEN matches.winner_team = 2 AND (matches.team2_player1_id = p.user_id OR matches.team2_player2_id = p.user_id) THEN 1
             ELSE 0
           END
         ) AS wins,
         SUM(
           CASE
             WHEN matches.status = 'finished'
              AND (
                (matches.winner_team = 1 AND (matches.team2_player1_id = p.user_id OR matches.team2_player2_id = p.user_id))
                OR
                (matches.winner_team = 2 AND (matches.team1_player1_id = p.user_id OR matches.team1_player2_id = p.user_id))
              )
             THEN 1 ELSE 0
           END
         ) AS losses
       FROM (
         SELECT team1_player1_id AS user_id FROM matches WHERE status = 'finished'
         UNION ALL SELECT team1_player2_id FROM matches WHERE status = 'finished'
         UNION ALL SELECT team2_player1_id FROM matches WHERE status = 'finished'
         UNION ALL SELECT team2_player2_id FROM matches WHERE status = 'finished'
       ) p
       JOIN matches
         ON matches.status = 'finished'
        AND (matches.team1_player1_id = p.user_id OR matches.team1_player2_id = p.user_id OR matches.team2_player1_id = p.user_id OR matches.team2_player2_id = p.user_id)
       WHERE p.user_id IS NOT NULL
       GROUP BY p.user_id
     ) match_stats ON match_stats.user_id = users.id
     WHERE links.coach_user_id = ?
       AND links.arena_id = ?
       AND links.status = 'active'
       AND links.start_date <= CURRENT_DATE()
       AND (links.end_date IS NULL OR links.end_date >= CURRENT_DATE())
       AND links.can_view_performance = 1
       AND arena_memberships.role = 'player'
       AND arena_memberships.status = 'active'
       AND users.status = 'active'
     ORDER BY match_stats.matches_played DESC, users.first_name ASC, users.last_name ASC`,
    [actor.id, actor.arena_id]
  );

  return rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    rankingScore: Number(row.ranking_score ?? 1000),
    matchesPlayed: Number(row.matches_played ?? 0),
    wins: Number(row.wins ?? 0),
    losses: Number(row.losses ?? 0),
    createdAt: toIso(row.created_at),
    relationship: {
      id: row.relationship_id,
      startDate: row.start_date instanceof Date ? row.start_date.toISOString().split("T")[0] : String(row.start_date),
      endDate: row.end_date ? (row.end_date instanceof Date ? row.end_date.toISOString().split("T")[0] : String(row.end_date)) : null,
      permissions: {
        canViewPerformance: Boolean(row.can_view_performance),
        canViewReservations: Boolean(row.can_view_reservations),
        canScheduleSessions: Boolean(row.can_schedule_sessions),
        canViewNotes: Boolean(row.can_view_notes),
      },
    },
  }));
}

export async function getCoachStudentStats(coachUserId, studentId) {
  const actor = await getCoachActor(coachUserId);
  const relationship = await getActiveCoachRelationshipForStudent(actor.id, Number(studentId));
  if (!relationship) {
    throw new Error("This player is not assigned to you");
  }
  if (!relationship.can_view_performance) {
    throw new Error("Player did not grant performance access");
  }

  const [rows] = await pool.query(
    `SELECT
       users.id,
       users.first_name,
       users.last_name,
       users.email,
       users.created_at
     FROM users
     JOIN arena_memberships ON arena_memberships.user_id = users.id
     WHERE users.id = ?
       AND arena_memberships.arena_id = ?
       AND arena_memberships.role = 'player'
     LIMIT 1`,
    [studentId, actor.arena_id]
  );

  if (!rows[0]) {
    throw new Error("Student not found in your arena");
  }

  const dashboard = await getPlayerDashboardData(studentId);
  const performance = await getPerformanceForUser(studentId);
  const matches = await listPlayerMatches(studentId);

  return {
    student: {
      id: rows[0].id,
      firstName: rows[0].first_name,
      lastName: rows[0].last_name,
      email: rows[0].email,
      createdAt: toIso(rows[0].created_at),
    },
    dashboard,
    performance,
    recentMatches: matches.slice(0, 12),
  };
}

export async function createCoachSession(
  coachUserId,
  {
    courtId,
    reservationDate,
    startTime,
    endTime,
    studentIds,
    title = "Training Session",
    sessionType = "individual",
    focusAreas = "",
    notes = "",
  }
) {
  const actor = await getCoachActor(coachUserId);
  const normalizedStudentIds = [...new Set((Array.isArray(studentIds) ? studentIds : []).map(Number).filter((id) => Number.isFinite(id) && id > 0))];

  if (!courtId || !reservationDate || !startTime || !endTime || !normalizedStudentIds.length) {
    throw new Error("Court, date, times, and at least one student are required");
  }

  const court = await getCourtById(Number(courtId));
  if (!court) {
    throw new Error("Court not found");
  }

  if (court.arena_id !== actor.arena_id) {
    throw new Error("You can only schedule sessions in your arena");
  }

  const [studentRows] = await pool.query(
    `SELECT
       users.id,
       users.email,
       users.first_name,
       users.last_name,
       links.can_schedule_sessions
     FROM users
     JOIN arena_memberships ON arena_memberships.user_id = users.id
     JOIN coach_player_relationships links
       ON links.player_user_id = users.id
      AND links.coach_user_id = ?
      AND links.status = 'active'
      AND links.start_date <= CURRENT_DATE()
      AND (links.end_date IS NULL OR links.end_date >= CURRENT_DATE())
     WHERE users.id IN (${normalizedStudentIds.map(() => "?").join(", ")})
       AND arena_memberships.arena_id = ?
       AND arena_memberships.role = 'player'
       AND arena_memberships.status = 'active'
       AND users.status = 'active'`,
    [actor.id, ...normalizedStudentIds, actor.arena_id]
  );

  if (studentRows.length !== normalizedStudentIds.length) {
    throw new Error("Every selected student must be actively assigned to this coach");
  }

  const deniedStudent = studentRows.find((row) => !row.can_schedule_sessions);
  if (deniedStudent) {
    throw new Error("One or more players have not granted session scheduling permission");
  }

  const participantCount = studentRows.length + 1; // include coach
  if (participantCount < Number(court.min_players) || participantCount > Number(court.max_players)) {
    throw new Error(`This court accepts between ${court.min_players} and ${court.max_players} players`);
  }

  const reservation = await createReservation({
    userId: actor.id,
    courtId: Number(courtId),
    reservationDate,
    startTime,
    endTime,
    qrToken: `coach-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    notes: `[Coach Session] ${title}${notes ? ` - ${notes}` : ""}`,
    participantEmails: studentRows.map((student) => student.email),
  });

  const [result] = await pool.query(
    `INSERT INTO training_sessions
      (arena_id, coach_user_id, reservation_id, session_type, title, focus_areas, notes, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', NOW(3))`,
    [actor.arena_id, actor.id, reservation.id, sessionType, String(title).trim(), String(focusAreas || "").trim(), String(notes || "").trim()]
  );

  const [rows] = await pool.query(
    `SELECT
       training_sessions.id,
       training_sessions.session_type,
       training_sessions.title,
       training_sessions.focus_areas,
       training_sessions.notes,
       training_sessions.status,
       training_sessions.created_at,
       reservations.id AS reservation_id,
       reservations.reservation_date,
       reservations.start_time,
       reservations.end_time,
       courts.id AS court_id,
       courts.name AS court_name,
       arenas.name AS arena_name,
       JSON_ARRAYAGG(
         JSON_OBJECT(
           'id', participants.id,
           'firstName', participants.first_name,
           'lastName', participants.last_name,
           'email', participants.email
         )
       ) AS students
     FROM training_sessions
     JOIN reservations ON reservations.id = training_sessions.reservation_id
     JOIN courts ON courts.id = reservations.court_id
     JOIN arenas ON arenas.id = courts.arena_id
     JOIN reservation_participants ON reservation_participants.reservation_id = reservations.id
     JOIN users AS participants ON participants.id = reservation_participants.user_id
     WHERE training_sessions.id = ?
       AND participants.id <> training_sessions.coach_user_id
     GROUP BY
       training_sessions.id,
       training_sessions.session_type,
       training_sessions.title,
       training_sessions.focus_areas,
       training_sessions.notes,
       training_sessions.status,
       training_sessions.created_at,
       reservations.id,
       reservations.reservation_date,
       reservations.start_time,
       reservations.end_time,
       courts.id,
       courts.name,
       arenas.name`,
    [result.insertId]
  );

  const row = rows[0];
  return {
    id: row.id,
    sessionType: row.session_type,
    title: row.title,
    focusAreas: row.focus_areas,
    notes: row.notes,
    status: row.status,
    createdAt: toIso(row.created_at),
    reservationId: row.reservation_id,
    reservationDate: row.reservation_date instanceof Date ? row.reservation_date.toISOString().split("T")[0] : String(row.reservation_date).split("T")[0],
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    court: {
      id: row.court_id,
      name: row.court_name,
      arenaName: row.arena_name,
    },
    students: parseJsonColumn(row.students),
  };
}

export async function listCoachSessions(coachUserId) {
  const actor = await getCoachActor(coachUserId);
  const whereClause = actor.effective_role === "coach" ? "WHERE training_sessions.coach_user_id = ?" : "WHERE training_sessions.arena_id = ?";
  const whereParams = actor.effective_role === "coach" ? [actor.id] : [actor.arena_id];

  const [rows] = await pool.query(
    `SELECT
       training_sessions.id,
       training_sessions.coach_user_id,
       training_sessions.session_type,
       training_sessions.title,
       training_sessions.focus_areas,
       training_sessions.notes,
       training_sessions.status,
       training_sessions.created_at,
       reservations.id AS reservation_id,
       reservations.reservation_date,
       reservations.start_time,
       reservations.end_time,
       courts.id AS court_id,
       courts.name AS court_name,
       arenas.name AS arena_name,
       coach.first_name AS coach_first_name,
       coach.last_name AS coach_last_name,
       JSON_ARRAYAGG(
         JSON_OBJECT(
           'id', participants.id,
           'firstName', participants.first_name,
           'lastName', participants.last_name,
           'email', participants.email
         )
       ) AS students
     FROM training_sessions
     JOIN reservations ON reservations.id = training_sessions.reservation_id
     JOIN courts ON courts.id = reservations.court_id
     JOIN arenas ON arenas.id = courts.arena_id
     JOIN users AS coach ON coach.id = training_sessions.coach_user_id
     JOIN reservation_participants ON reservation_participants.reservation_id = reservations.id
     JOIN users AS participants ON participants.id = reservation_participants.user_id
     ${whereClause}
       AND participants.id <> training_sessions.coach_user_id
     GROUP BY
       training_sessions.id,
       training_sessions.coach_user_id,
       training_sessions.session_type,
       training_sessions.title,
       training_sessions.focus_areas,
       training_sessions.notes,
       training_sessions.status,
       training_sessions.created_at,
       reservations.id,
       reservations.reservation_date,
       reservations.start_time,
       reservations.end_time,
       courts.id,
       courts.name,
       arenas.name,
       coach.first_name,
       coach.last_name
     ORDER BY reservations.reservation_date DESC, reservations.start_time DESC`,
    whereParams
  );

  return rows.map((row) => ({
    id: row.id,
    coachUserId: row.coach_user_id,
    coachName: `${row.coach_first_name} ${row.coach_last_name}`,
    sessionType: row.session_type,
    title: row.title,
    focusAreas: row.focus_areas,
    notes: row.notes,
    status: row.status,
    createdAt: toIso(row.created_at),
    reservationId: row.reservation_id,
    reservationDate: row.reservation_date instanceof Date ? row.reservation_date.toISOString().split("T")[0] : String(row.reservation_date).split("T")[0],
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    court: {
      id: row.court_id,
      name: row.court_name,
      arenaName: row.arena_name,
    },
    students: parseJsonColumn(row.students),
  }));
}

export async function closePool() {
  await pool.end();
}
export async function finalizeMatch(reservationId, score1, score2) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [resRows] = await connection.query(
      `SELECT reservations.*, courts.arena_id 
       FROM reservations 
       JOIN courts ON courts.id = reservations.court_id 
       WHERE reservations.id = ? AND reservations.status = 'confirmed'`,
      [reservationId]
    );

    const reservation = resRows[0];
    if (!reservation) {
      throw new Error("Reservation non trouvee ou deja terminee");
    }

    const s1 = Array.isArray(score1) ? score1 : [0];
    const s2 = Array.isArray(score2) ? score2 : [0];
    const sum1 = s1.reduce((a, b) => a + b, 0);
    const sum2 = s2.reduce((a, b) => a + b, 0);
    const winnerTeam = sum1 > sum2 ? 1 : sum2 > sum1 ? 2 : 0;

    const [participants] = await connection.query(
      "SELECT user_id FROM reservation_participants WHERE reservation_id = ?",
      [reservationId]
    );

    const playerIds = participants.map((p) => p.user_id);
    const splitIndex = Math.ceil(playerIds.length / 2);
    const team1Ids = playerIds.slice(0, splitIndex);
    const team2Ids = playerIds.slice(splitIndex);

    await connection.query(
      `INSERT INTO matches 
        (reservation_id, court_id, arena_id, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, score1, score2, winner_team, status, scheduled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'finished', ?)`,
      [
        reservationId,
        reservation.court_id,
        reservation.arena_id,
        team1Ids[0] || null,
        team1Ids[1] || null,
        team2Ids[0] || null,
        team2Ids[1] || null,
        JSON.stringify(s1),
        JSON.stringify(s2),
        winnerTeam,
        `${reservation.reservation_date} ${reservation.start_time}`,
      ]
    );

    await connection.query(
      "UPDATE reservations SET status = 'completed' WHERE id = ?",
      [reservationId]
    );

    for (const pId of playerIds) {
      const isWinner = (winnerTeam === 1 && team1Ids.includes(pId)) || (winnerTeam === 2 && team2Ids.includes(pId));
      const [latest] = await connection.query(
        "SELECT ranking_score, wins, losses FROM performance_snapshots WHERE user_id = ? ORDER BY id DESC LIMIT 1",
        [pId]
      );

      const oldScore = latest[0]?.ranking_score || 1000;
      const oldWins = latest[0]?.wins || 0;
      const oldLosses = latest[0]?.losses || 0;

      await connection.query(
        `INSERT INTO performance_snapshots (user_id, ranking_score, wins, losses, streak, snapshot_date)
         VALUES (?, ?, ?, ?, ?, CURRENT_DATE())`,
        [
          pId,
          isWinner ? oldScore + 50 : Math.max(0, oldScore - 20),
          isWinner ? oldWins + 1 : oldWins,
          isWinner ? oldLosses : oldLosses + 1,
          isWinner ? "WIN" : "LOSS",
        ]
      );
    }

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
export async function getCompetitionDetails(competitionId) {
  const [compRows] = await pool.query(
    `SELECT competitions.*, arenas.name AS arena_name
     FROM competitions
     JOIN arenas ON arenas.id = competitions.arena_id
     WHERE competitions.id = ?`,
    [competitionId]
  );

  const competition = compRows[0];
  if (!competition) return null;

  const [participants] = await pool.query(
    `SELECT users.id, users.first_name, users.last_name, users.email, 
            performance_snapshots.ranking_score AS ranking
     FROM competition_registrations
     JOIN users ON users.id = competition_registrations.user_id
     LEFT JOIN (
       SELECT user_id, ranking_score, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY id DESC) as rn
       FROM performance_snapshots
     ) performance_snapshots ON performance_snapshots.user_id = users.id AND performance_snapshots.rn = 1
     WHERE competition_registrations.competition_id = ? 
     AND competition_registrations.status = 'registered'`,
    [competitionId]
  );

  return {
    ...sanitizeCompetition(competition),
    participants: participants.map(p => ({
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      ranking: p.ranking || 1000,
    })),
    rules: "Matchs en 2 sets gagnants. Point decisif a 40-40. Super tie-break en cas de 3eme set.",
    prizes: "1er: 500€ + Trophee | 2eme: 200€ | 3eme: 100€",
  };
}

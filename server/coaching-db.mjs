// Coaching system DB functions — imported by postgres-arena-db.mjs via re-export
// and by arena-db.mjs

import pkg from "pg";
const { Pool } = pkg;

// Re-use the same pool by importing config from env
const pool = new Pool({
  host: process.env.PG_HOST ?? "127.0.0.1",
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER ?? "postgres",
  password: process.env.PG_PASSWORD ?? "",
  database: process.env.PG_DATABASE ?? "ultima_demo",
});

// Import shared helpers from postgres-arena-db
import {
  requireActiveActor,
  addActivityLog,
  createNotification,
  findUserById,
} from "./postgres-arena-db.mjs";

const toIso = (v) => (v ? new Date(v).toISOString() : null);
const timeToMinutes = (v) => {
  if (!v || typeof v !== "string") return null;
  const p = v.split(":").map(Number);
  return p.length >= 2 && !p.some(Number.isNaN) ? p[0] * 60 + p[1] : null;
};
const minutesToTime = (v) => `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
const isAdminLike = (a) => a?.effective_role === "admin" || a?.effective_role === "super_admin";
const isCoachLike = (a) => ["coach", "admin", "super_admin"].includes(a?.effective_role);
const parseJsonbArray = (val) => {
  if (Array.isArray(val)) return val;
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
};

function normalizeCoachProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    arenaId: row.arena_id,
    arenaName: row.arena_name ?? null,
    arenaCity: row.arena_city ?? null,
    arenaRegion: row.arena_region ?? null,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    email: row.email ?? null,
    profileImageUrl: row.profile_image_url ?? null,
    headline: row.headline ?? null,
    bio: row.bio ?? null,
    expertise: parseJsonbArray(row.expertise),
    qualities: parseJsonbArray(row.qualities),
    certifications: parseJsonbArray(row.certifications),
    previousWorkplaces: parseJsonbArray(row.previous_workplaces),
    languages: parseJsonbArray(row.languages),
    yearsExperience: row.years_experience ?? null,
    hourlyRate: row.hourly_rate ? Number(row.hourly_rate) : null,
    currency: row.currency ?? "TND",
    isActive: row.is_active ?? true,
    isVerified: row.is_verified ?? false,
    userStatus: row.user_status ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function normalizeCoachingRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    playerUserId: row.player_user_id,
    playerName: row.player_name ?? null,
    coachUserId: row.coach_user_id,
    coachName: row.coach_name ?? null,
    arenaId: row.arena_id,
    arenaName: row.arena_name ?? null,
    requestedDate: row.requested_date ? String(row.requested_date).slice(0, 10) : null,
    requestedStartTime: row.requested_start_time ? String(row.requested_start_time).slice(0, 5) : null,
    requestedEndTime: row.requested_end_time ? String(row.requested_end_time).slice(0, 5) : null,
    playersCount: row.players_count,
    message: row.message ?? null,
    status: row.status,
    coachReplyMessage: row.coach_reply_message ?? null,
    counterProposedDate: row.counter_proposed_date ? String(row.counter_proposed_date).slice(0, 10) : null,
    counterProposedStartTime: row.counter_proposed_start_time ? String(row.counter_proposed_start_time).slice(0, 5) : null,
    counterProposedEndTime: row.counter_proposed_end_time ? String(row.counter_proposed_end_time).slice(0, 5) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function normalizeCoachingSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    coachingRequestId: row.coaching_request_id,
    playerUserId: row.player_user_id,
    playerName: row.player_name ?? null,
    coachUserId: row.coach_user_id,
    coachName: row.coach_name ?? null,
    arenaId: row.arena_id,
    arenaName: row.arena_name ?? null,
    sessionDate: row.session_date ? String(row.session_date).slice(0, 10) : null,
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : null,
    playersCount: row.players_count,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

// ── Coach Profiles ────────────────────────────────────────────────────────────

export async function getCoachProfile(coachUserId) {
  const { rows } = await pool.query(
    `SELECT cp.*, u.first_name, u.last_name, u.email, u.status AS user_status,
            a.name AS arena_name, a.city AS arena_city
     FROM users u
     LEFT JOIN coach_profiles cp ON cp.user_id = u.id
     LEFT JOIN arenas a ON a.id = cp.arena_id
     WHERE u.id = $1`,
    [Number(coachUserId)]
  );
  return normalizeCoachProfile(rows[0]);
}

export async function upsertCoachProfile(actorUserId, targetCoachUserId, data) {
  const actor = await requireActiveActor(actorUserId);
  const isSelf = Number(actorUserId) === Number(targetCoachUserId);
  if (!isSelf && !isAdminLike(actor)) throw new Error("Not allowed to edit this coach profile");

  const {
    arenaId, profileImageUrl, headline, bio,
    expertise, qualities, certifications, previousWorkplaces,
    languages, yearsExperience, hourlyRate, currency,
    isActive, isVerified,
  } = data;

  const safeArenaId = arenaId !== undefined ? (arenaId ? Number(arenaId) : null) : (actor.arena_id ?? null);

  const existing = await pool.query("SELECT id FROM coach_profiles WHERE user_id = $1", [Number(targetCoachUserId)]);

  if (existing.rows[0]) {
    const fields = [];
    const params = [];
    const set = (col, val) => { fields.push(`${col} = $${params.length + 1}`); params.push(val); };
    if (arenaId !== undefined) set("arena_id", safeArenaId);
    if (profileImageUrl !== undefined) set("profile_image_url", profileImageUrl);
    if (headline !== undefined) set("headline", String(headline || "").trim() || null);
    if (bio !== undefined) set("bio", String(bio || "").trim() || null);
    if (expertise !== undefined) set("expertise", JSON.stringify(Array.isArray(expertise) ? expertise : []));
    if (qualities !== undefined) set("qualities", JSON.stringify(Array.isArray(qualities) ? qualities : []));
    if (certifications !== undefined) set("certifications", JSON.stringify(Array.isArray(certifications) ? certifications : []));
    if (previousWorkplaces !== undefined) set("previous_workplaces", JSON.stringify(Array.isArray(previousWorkplaces) ? previousWorkplaces : []));
    if (languages !== undefined) set("languages", JSON.stringify(Array.isArray(languages) ? languages : []));
    if (yearsExperience !== undefined) set("years_experience", yearsExperience ? Number(yearsExperience) : null);
    if (hourlyRate !== undefined) set("hourly_rate", hourlyRate ? Number(hourlyRate) : null);
    if (currency !== undefined) set("currency", String(currency || "TND").trim());
    if (isActive !== undefined && isAdminLike(actor)) set("is_active", Boolean(isActive));
    if (isVerified !== undefined && isAdminLike(actor)) set("is_verified", Boolean(isVerified));
    fields.push("updated_at = NOW()");
    if (!params.length) return getCoachProfile(targetCoachUserId);
    params.push(Number(targetCoachUserId));
    await pool.query(`UPDATE coach_profiles SET ${fields.join(", ")} WHERE user_id = $${params.length}`, params);
  } else {
    await pool.query(
      `INSERT INTO coach_profiles
         (user_id, arena_id, profile_image_url, headline, bio, expertise, qualities,
          certifications, previous_workplaces, languages, years_experience, hourly_rate,
          currency, is_active, is_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        Number(targetCoachUserId), safeArenaId,
        profileImageUrl ?? null,
        headline ? String(headline).trim() : null,
        bio ? String(bio).trim() : null,
        JSON.stringify(Array.isArray(expertise) ? expertise : []),
        JSON.stringify(Array.isArray(qualities) ? qualities : []),
        JSON.stringify(Array.isArray(certifications) ? certifications : []),
        JSON.stringify(Array.isArray(previousWorkplaces) ? previousWorkplaces : []),
        JSON.stringify(Array.isArray(languages) ? languages : []),
        yearsExperience ? Number(yearsExperience) : null,
        hourlyRate ? Number(hourlyRate) : null,
        String(currency || "TND").trim(),
        isActive !== undefined ? Boolean(isActive) : true,
        isVerified !== undefined ? Boolean(isVerified) : false,
      ]
    );
  }

  return getCoachProfile(targetCoachUserId);
}

export async function updateCoachAvatar(coachUserId, imageUrl) {
  await pool.query(
    `INSERT INTO coach_profiles (user_id, profile_image_url)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET profile_image_url = $2, updated_at = NOW()`,
    [Number(coachUserId), imageUrl]
  );
}

export async function listCoachProfiles(filters = {}) {
  const { arenaId, city, search } = filters;
  const params = [];
  const where = ["u.role = 'coach'", "u.status = 'active'"];

  if (arenaId) { params.push(Number(arenaId)); where.push(`cp.arena_id = $${params.length}`); }
  if (city) { params.push(`%${city}%`); where.push(`a.city ILIKE $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    where.push(`(u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx} OR cp.headline ILIKE $${idx} OR a.name ILIKE $${idx} OR a.city ILIKE $${idx} OR a.region ILIKE $${idx})`);
  }

  const { rows } = await pool.query(
    `SELECT cp.*, u.first_name, u.last_name, u.email, u.status AS user_status,
            a.name AS arena_name, a.city AS arena_city, a.region AS arena_region
     FROM users u
     LEFT JOIN coach_profiles cp ON cp.user_id = u.id
     LEFT JOIN arenas a ON a.id = cp.arena_id
     WHERE ${where.join(" AND ")}
     ORDER BY cp.is_verified DESC NULLS LAST, u.first_name ASC`,
    params
  );

  let result = rows.map(normalizeCoachProfile);
  const { expertise, language } = filters;
  if (expertise) {
    const exp = expertise.toLowerCase();
    result = result.filter((c) => c.expertise.some((e) => String(e).toLowerCase().includes(exp)));
  }
  if (language) {
    const lang = language.toLowerCase();
    result = result.filter((c) => c.languages.some((l) => String(l).toLowerCase().includes(lang)));
  }
  return result;
}

export async function getCoachPublicProfile(coachUserId) {
  const { rows } = await pool.query(
    `SELECT cp.*, u.first_name, u.last_name, u.email, u.status AS user_status,
            a.name AS arena_name, a.city AS arena_city, a.region AS arena_region
     FROM users u
     LEFT JOIN coach_profiles cp ON cp.user_id = u.id
     LEFT JOIN arenas a ON a.id = cp.arena_id
     WHERE u.id = $1 AND u.role = 'coach' AND u.status = 'active'`,
    [Number(coachUserId)]
  );
  if (!rows[0]) return null;
  return normalizeCoachProfile(rows[0]);
}

// ── Coach Availability ────────────────────────────────────────────────────────

export async function getCoachAvailability(coachUserId) {
  const [rulesRes, exceptionsRes] = await Promise.all([
    pool.query(
      `SELECT * FROM coach_availability_rules WHERE coach_user_id = $1 ORDER BY day_of_week, start_time`,
      [Number(coachUserId)]
    ),
    pool.query(
      `SELECT * FROM coach_availability_exceptions WHERE coach_user_id = $1 AND exception_date >= CURRENT_DATE ORDER BY exception_date`,
      [Number(coachUserId)]
    ),
  ]);
  return {
    rules: rulesRes.rows.map((r) => ({
      id: r.id,
      dayOfWeek: r.day_of_week,
      startTime: String(r.start_time).slice(0, 5),
      endTime: String(r.end_time).slice(0, 5),
      isAvailable: r.is_available,
    })),
    exceptions: exceptionsRes.rows.map((r) => ({
      id: r.id,
      date: String(r.exception_date).slice(0, 10),
      startTime: r.start_time ? String(r.start_time).slice(0, 5) : null,
      endTime: r.end_time ? String(r.end_time).slice(0, 5) : null,
      isAvailable: r.is_available,
      reason: r.reason ?? null,
    })),
  };
}

export async function setCoachAvailabilityRules(coachUserId, rules) {
  const actor = await requireActiveActor(coachUserId);
  if (!isCoachLike(actor)) throw new Error("Coach access required");
  if (!Array.isArray(rules)) throw new Error("rules must be an array");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM coach_availability_rules WHERE coach_user_id = $1", [actor.id]);
    for (const rule of rules) {
      const dow = Number(rule.dayOfWeek);
      if (dow < 0 || dow > 6 || !rule.startTime || !rule.endTime) continue;
      await client.query(
        `INSERT INTO coach_availability_rules (coach_user_id, arena_id, day_of_week, start_time, end_time, is_available)
         VALUES ($1, $2, $3, $4::time, $5::time, $6)`,
        [actor.id, actor.arena_id ?? null, dow, rule.startTime, rule.endTime, rule.isAvailable !== false]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getCoachAvailability(coachUserId);
}

export async function addCoachAvailabilityException(coachUserId, { date, startTime, endTime, isAvailable, reason }) {
  const actor = await requireActiveActor(coachUserId);
  if (!isCoachLike(actor)) throw new Error("Coach access required");
  if (!date) throw new Error("date is required");
  await pool.query(
    `INSERT INTO coach_availability_exceptions (coach_user_id, exception_date, start_time, end_time, is_available, reason)
     VALUES ($1, $2::date, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING`,
    [actor.id, date, startTime ?? null, endTime ?? null, isAvailable !== false, String(reason ?? "").trim() || null]
  );
  return getCoachAvailability(coachUserId);
}

export async function getCoachAvailableSlots(coachUserId, date) {
  if (!date) throw new Error("date is required");
  const SLOT_DURATION = 60;
  const d = new Date(date + "T00:00:00Z");
  const dayOfWeek = d.getUTCDay();

  const [rulesRes, excRes, sessionsRes] = await Promise.all([
    pool.query(
      `SELECT start_time, end_time FROM coach_availability_rules
       WHERE coach_user_id = $1 AND day_of_week = $2 AND is_available = true ORDER BY start_time`,
      [Number(coachUserId), dayOfWeek]
    ),
    pool.query(
      `SELECT is_available, start_time, end_time FROM coach_availability_exceptions
       WHERE coach_user_id = $1 AND exception_date = $2::date`,
      [Number(coachUserId), date]
    ),
    pool.query(
      `SELECT start_time, end_time FROM coaching_sessions
       WHERE coach_user_id = $1 AND session_date = $2::date AND status = 'scheduled'`,
      [Number(coachUserId), date]
    ),
  ]);

  let baseSlots;
  if (excRes.rows.length > 0) {
    const exc = excRes.rows[0];
    if (!exc.is_available) return [];
    baseSlots = exc.start_time && exc.end_time ? [{ start_time: exc.start_time, end_time: exc.end_time }] : rulesRes.rows;
  } else {
    baseSlots = rulesRes.rows;
  }
  if (!baseSlots.length) return [];

  const bookedMins = sessionsRes.rows.map((s) => ({
    start: timeToMinutes(String(s.start_time).slice(0, 5)),
    end: timeToMinutes(String(s.end_time).slice(0, 5)),
  }));

  const slots = [];
  for (const base of baseSlots) {
    const startMins = timeToMinutes(String(base.start_time).slice(0, 5));
    const endMins = timeToMinutes(String(base.end_time).slice(0, 5));
    if (startMins === null || endMins === null) continue;
    for (let t = startMins; t + SLOT_DURATION <= endMins; t += SLOT_DURATION) {
      const slotEnd = t + SLOT_DURATION;
      const overlaps = bookedMins.some((b) => t < b.end && slotEnd > b.start);
      if (!overlaps) slots.push({ start: minutesToTime(t), end: minutesToTime(slotEnd) });
    }
  }
  return slots;
}

// ── Coaching Requests ─────────────────────────────────────────────────────────

export async function createCoachingRequest(playerUserId, {
  coachUserId, arenaId, requestedDate, requestedStartTime,
  requestedEndTime, playersCount, message,
}) {
  const player = await requireActiveActor(playerUserId);
  const pc = Number(playersCount) || 1;
  if (pc < 1 || pc > 4) throw new Error("playersCount must be between 1 and 4");
  if (!requestedDate || !requestedStartTime || !requestedEndTime) throw new Error("Date and times are required");

  const slots = await getCoachAvailableSlots(Number(coachUserId), requestedDate);
  const reqStart = requestedStartTime.slice(0, 5);
  const slotMatch = slots.find((s) => s.start === reqStart);
  if (!slotMatch) throw new Error("The requested time slot is not available for this coach");

  const { rows } = await pool.query(
    `INSERT INTO coaching_requests
       (player_user_id, coach_user_id, arena_id, requested_date, requested_start_time,
        requested_end_time, players_count, message)
     VALUES ($1, $2, $3, $4::date, $5::time, $6::time, $7, $8) RETURNING *`,
    [player.id, Number(coachUserId), arenaId ? Number(arenaId) : null,
     requestedDate, requestedStartTime, requestedEndTime, pc, String(message ?? "").trim() || null]
  );
  const req = rows[0];

  try {
    const coachUser = await findUserById(Number(coachUserId));
    if (coachUser) {
      await createNotification({
        userId: coachUser.id,
        title: "New coaching request",
        body: `${player.first_name} ${player.last_name} requested a session on ${requestedDate} at ${requestedStartTime.slice(0, 5)}`,
        type: "coaching_request_created",
        linkUrl: "/coach/requests",
      });
    }
  } catch (_) { /* non-critical */ }

  return normalizeCoachingRequest({ ...req, player_name: `${player.first_name} ${player.last_name}` });
}

export async function respondToCoachingRequest(coachUserId, requestId, {
  action, message, counterProposedDate, counterProposedStartTime, counterProposedEndTime,
}) {
  const coach = await requireActiveActor(coachUserId);
  if (!isCoachLike(coach)) throw new Error("Coach access required");

  const { rows } = await pool.query("SELECT * FROM coaching_requests WHERE id = $1 LIMIT 1", [Number(requestId)]);
  const req = rows[0];
  if (!req) throw new Error("Request not found");
  if (Number(req.coach_user_id) !== Number(coach.id)) throw new Error("This request is not for you");
  if (req.status !== "pending") throw new Error("Only pending requests can be responded to");

  const validActions = ["accept", "reject", "counter_propose"];
  if (!validActions.includes(action)) throw new Error("Invalid action");

  let newStatus;
  let session = null;

  if (action === "accept") {
    newStatus = "accepted";
    const { rows: sessRows } = await pool.query(
      `INSERT INTO coaching_sessions
         (coaching_request_id, player_user_id, coach_user_id, arena_id, session_date,
          start_time, end_time, players_count)
       VALUES ($1,$2,$3,$4,$5::date,$6::time,$7::time,$8) RETURNING *`,
      [req.id, req.player_user_id, req.coach_user_id, req.arena_id,
       req.requested_date, req.requested_start_time, req.requested_end_time, req.players_count]
    );
    session = sessRows[0];
    try {
      await createNotification({
        userId: req.player_user_id,
        title: "Coaching request accepted",
        body: `${coach.first_name} ${coach.last_name} accepted your session for ${String(req.requested_date).slice(0, 10)}`,
        type: "coaching_request_accepted",
        linkUrl: "/coaching-requests",
      });
    } catch (_) { /* non-critical */ }
  } else if (action === "reject") {
    newStatus = "rejected";
    try {
      await createNotification({
        userId: req.player_user_id,
        title: "Coaching request declined",
        body: `${coach.first_name} ${coach.last_name} declined your session request`,
        type: "coaching_request_rejected",
        linkUrl: "/coaching-requests",
      });
    } catch (_) { /* non-critical */ }
  } else {
    if (!counterProposedDate || !counterProposedStartTime || !counterProposedEndTime) {
      throw new Error("Counter-proposal requires date and times");
    }
    newStatus = "counter_proposed";
    try {
      await createNotification({
        userId: req.player_user_id,
        title: "Coach proposed another time",
        body: `${coach.first_name} ${coach.last_name} proposed ${counterProposedDate} at ${counterProposedStartTime}`,
        type: "coaching_request_counter_proposed",
        linkUrl: "/coaching-requests",
      });
    } catch (_) { /* non-critical */ }
  }

  const { rows: updated } = await pool.query(
    `UPDATE coaching_requests SET
       status = $1, coach_reply_message = $2,
       counter_proposed_date = $3, counter_proposed_start_time = $4, counter_proposed_end_time = $5,
       updated_at = NOW()
     WHERE id = $6 RETURNING *`,
    [
      newStatus,
      String(message ?? "").trim() || null,
      action === "counter_propose" ? counterProposedDate : null,
      action === "counter_propose" ? counterProposedStartTime : null,
      action === "counter_propose" ? counterProposedEndTime : null,
      req.id,
    ]
  );

  return {
    request: normalizeCoachingRequest(updated[0]),
    session: session ? normalizeCoachingSession(session) : null,
  };
}

export async function listCoachingRequestsForCoach(coachUserId) {
  const { rows } = await pool.query(
    `SELECT cr.*,
       CONCAT(p.first_name, ' ', p.last_name) AS player_name,
       CONCAT(c.first_name, ' ', c.last_name) AS coach_name,
       a.name AS arena_name
     FROM coaching_requests cr
     JOIN users p ON p.id = cr.player_user_id
     JOIN users c ON c.id = cr.coach_user_id
     LEFT JOIN arenas a ON a.id = cr.arena_id
     WHERE cr.coach_user_id = $1
     ORDER BY cr.created_at DESC`,
    [Number(coachUserId)]
  );
  return rows.map(normalizeCoachingRequest);
}

export async function listCoachingRequestsForPlayer(playerUserId) {
  const { rows } = await pool.query(
    `SELECT cr.*,
       CONCAT(p.first_name, ' ', p.last_name) AS player_name,
       CONCAT(c.first_name, ' ', c.last_name) AS coach_name,
       a.name AS arena_name
     FROM coaching_requests cr
     JOIN users p ON p.id = cr.player_user_id
     JOIN users c ON c.id = cr.coach_user_id
     LEFT JOIN arenas a ON a.id = cr.arena_id
     WHERE cr.player_user_id = $1
     ORDER BY cr.created_at DESC`,
    [Number(playerUserId)]
  );
  return rows.map(normalizeCoachingRequest);
}

// ── Coaching Sessions ─────────────────────────────────────────────────────────

export async function listCoachingSessionsForUser(userId) {
  const actor = await requireActiveActor(userId);
  const isCoach = isCoachLike(actor) && actor.effective_role !== "player";
  const col = isCoach ? "coach_user_id" : "player_user_id";

  const { rows } = await pool.query(
    `SELECT cs.*,
       CONCAT(p.first_name, ' ', p.last_name) AS player_name,
       CONCAT(c.first_name, ' ', c.last_name) AS coach_name,
       a.name AS arena_name
     FROM coaching_sessions cs
     JOIN users p ON p.id = cs.player_user_id
     JOIN users c ON c.id = cs.coach_user_id
     LEFT JOIN arenas a ON a.id = cs.arena_id
     WHERE cs.${col} = $1
     ORDER BY cs.session_date DESC, cs.start_time DESC`,
    [actor.id]
  );
  return rows.map(normalizeCoachingSession);
}

// ── Admin Coach Management ────────────────────────────────────────────────────

export async function listAdminCoaches(actorUserId) {
  const actor = await requireActiveActor(actorUserId);
  if (!isAdminLike(actor)) throw new Error("Admin access required");

  const params = [];
  const where = ["u.role = 'coach'"];
  if (actor.effective_role !== "super_admin") {
    params.push(actor.arena_id);
    where.push(`(cp.arena_id = $${params.length} OR am.arena_id = $${params.length})`);
  }

  const { rows } = await pool.query(
    `SELECT DISTINCT ON (u.id) cp.*, u.first_name, u.last_name, u.email, u.status AS user_status,
            a.name AS arena_name, a.city AS arena_city
     FROM users u
     LEFT JOIN coach_profiles cp ON cp.user_id = u.id
     LEFT JOIN arenas a ON a.id = cp.arena_id
     LEFT JOIN arena_memberships am ON am.user_id = u.id AND am.role = 'coach'
     WHERE ${where.join(" AND ")}
     ORDER BY u.id, u.first_name`,
    params
  );
  return rows.map((r) => ({ ...normalizeCoachProfile(r), userStatus: r.user_status }));
}

export async function assignCoachToArena(actorUserId, coachUserId, arenaId) {
  const actor = await requireActiveActor(actorUserId);
  if (!isAdminLike(actor)) throw new Error("Admin access required");
  if (actor.effective_role === "admin" && Number(actor.arena_id) !== Number(arenaId)) {
    throw new Error("You can only assign coaches to your own arena");
  }
  await pool.query(
    `INSERT INTO arena_memberships (arena_id, user_id, role, status)
     VALUES ($1, $2, 'coach', 'active')
     ON CONFLICT (arena_id, user_id) DO UPDATE SET role = 'coach', status = 'active'`,
    [Number(arenaId), Number(coachUserId)]
  );
  await pool.query(
    `INSERT INTO coach_profiles (user_id, arena_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET arena_id = $2, updated_at = NOW()`,
    [Number(coachUserId), Number(arenaId)]
  );
}

export async function closeCoachingPool() {
  await pool.end();
}

import pool from "./pg-pool.mjs";
import fs from "node:fs";
import path from "node:path";

const ACTIVE_STATUSES = ["created", "starting", "running", "error"];
function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRowPayload(row) {
  if (!row) return null;
  return {
    id: row.id,
    arenaId: row.arena_id,
    arenaName: row.arena_name ?? null,
    courtId: row.court_id,
    courtName: row.court_name ?? null,
    cameraId: row.camera_id,
    cameraName: row.camera_name ?? null,
    cameraUrl: row.camera_url ?? null,
    cameraType: row.camera_type ?? null,
    matchId: row.match_id,
    competitionId: row.competition_id,
    reservationId: row.reservation_id,
    status: row.status,
    mode: row.mode,
    startedByUserId: row.started_by_user_id,
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    aiSessionId: row.ai_session_id,
    aiStatusMessage: row.ai_status_message,
    fps: row.fps === null ? null : Number(row.fps),
    lastFrame: row.last_frame,
    lastUpdateAt: row.last_update_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getActorArenaIds(actor, client = pool) {
  if (!actor?.id) return [];
  if (actor.arena_id) return [Number(actor.arena_id)].filter(Number.isFinite);
  const { rows } = await client.query(
    `SELECT arena_id
     FROM arena_memberships
     WHERE user_id = $1 AND status = 'active'`,
    [actor.id]
  );
  return rows.map((row) => Number(row.arena_id)).filter(Number.isFinite);
}

export async function getCourtForLive(courtId) {
  const { rows } = await pool.query(
    `SELECT c.*, a.name AS arena_name
     FROM courts c
     JOIN arenas a ON a.id = c.arena_id
     WHERE c.id = $1`,
    [toNumber(courtId)]
  );
  return rows[0] ?? null;
}

export async function canManageLiveSession(actor, arenaId) {
  const role = actor?.effective_role ?? actor?.role;
  if (!["admin", "super_admin"].includes(role)) return false;
  if (role === "super_admin") return true;
  const arenaIds = await getActorArenaIds(actor);
  return arenaIds.includes(Number(arenaId));
}

export async function canViewLiveSession(actor, session) {
  if (!session) return false;
  if (!actor) {
    const competitionId = session.competition_id ?? session.competitionId;
    if (!competitionId) return false;
    const { rows } = await pool.query(
      "SELECT status FROM competitions WHERE id = $1 AND status IN ('open', 'live', 'ongoing') LIMIT 1",
      [competitionId]
    );
    return rows.length > 0;
  }
  // Dev/demo sessions are viewable by any authenticated user
  const sessionMode = String(session.mode ?? "").toLowerCase();
  const cameraType = String(session.cameraType ?? session.camera_type ?? "").toLowerCase();
  if (["mock", "file_demo", "local_demo"].includes(sessionMode) || cameraType === "file_demo") return true;

  const role = actor.effective_role ?? actor.role;
  if (["admin", "super_admin"].includes(role)) {
    return canManageLiveSession(actor, session.arena_id ?? session.arenaId);
  }
  const sessionId = session.id;
  const arenaId = session.arena_id ?? session.arenaId;
  const { rows: assigned } = await pool.query(
    "SELECT 1 FROM live_session_players WHERE live_session_id = $1 AND user_id = $2 LIMIT 1",
    [sessionId, actor.id]
  );
  if (assigned.length) return true;
  if (role === "coach") {
    const arenaIds = await getActorArenaIds(actor);
    if (arenaIds.includes(Number(arenaId))) return true;
    const { rows: linked } = await pool.query(
      `SELECT 1
       FROM live_session_players lsp
       JOIN coach_player_relationships cpr ON cpr.player_user_id = lsp.user_id
       WHERE lsp.live_session_id = $1
         AND cpr.coach_user_id = $2
         AND cpr.status = 'active'
       LIMIT 1`,
      [sessionId, actor.id]
    );
    return linked.length > 0;
  }
  return false;
}

export async function listCourtCameras(courtId, actor) {
  const court = await getCourtForLive(courtId);
  if (!court) return { court: null, cameras: [] };
  if (!(await canManageLiveSession(actor, court.arena_id))) {
    const error = new Error("Admin access required for this court");
    error.statusCode = 403;
    throw error;
  }
  const { rows } = await pool.query(
    `SELECT * FROM court_cameras
     WHERE court_id = $1
     ORDER BY is_active DESC, created_at DESC`,
    [court.id]
  );
  return { court, cameras: rows };
}

export async function getActiveCourtCamera(courtId) {
  const { rows } = await pool.query(
    `SELECT *
     FROM court_cameras
     WHERE court_id = $1 AND is_active = TRUE
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [toNumber(courtId)]
  );
  return rows[0] ?? null;
}

export async function createCourtCamera(args) {
  const { courtId, name, actor } = args;
  const cameraUrl = args.cameraUrl ?? args.camera_url;
  const cameraType = args.cameraType ?? args.camera_type;
  const court = await getCourtForLive(courtId);
  if (!court) {
    const error = new Error("Court not found");
    error.statusCode = 404;
    throw error;
  }
  if (!(await canManageLiveSession(actor, court.arena_id))) {
    const error = new Error("Admin access required for this court");
    error.statusCode = 403;
    throw error;
  }
  const { rows } = await pool.query(
    `INSERT INTO court_cameras (arena_id, court_id, name, camera_url, camera_type)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      court.arena_id,
      court.id,
      String(name ?? "Main camera").trim(),
      String(cameraUrl ?? "").trim(),
      String(cameraType ?? "rtsp").trim(),
    ]
  );
  return rows[0];
}

export async function getCourtLiveCalibration(courtId, cameraId = null) {
  const values = [toNumber(courtId)];
  let cameraFilter = "";
  if (cameraId) {
    values.push(toNumber(cameraId));
    cameraFilter = "AND (camera_id = $2 OR camera_id IS NULL)";
  }
  const { rows } = await pool.query(
    `SELECT *
     FROM court_calibrations
     WHERE court_id = $1 ${cameraFilter}
     ORDER BY
       CASE
         WHEN lower(COALESCE(calibration_status, '')) = 'valid' THEN 0
         WHEN is_active = TRUE AND homography_json_path IS NOT NULL THEN 1
         WHEN lower(COALESCE(status, '')) = 'active' AND homography_json_path IS NOT NULL THEN 2
         ELSE 3
       END,
       updated_at DESC
     LIMIT 1`,
    values
  );
  const row = rows[0] ?? null;
  const fallbackHomographyPath = `uploads/homography/court_${toNumber(courtId)}.json`;
  const fallbackHomographyExists = fs.existsSync(path.resolve(process.cwd(), fallbackHomographyPath));
  if (!row) {
    return {
      calibration_status: "missing",
      calibrationStatus: "missing",
      isValidForLive: false,
      homography_json_path: fallbackHomographyExists ? fallbackHomographyPath : null,
      sport: "padel",
    };
  }
  const homographyJsonPath = row.homography_json_path ?? (fallbackHomographyExists ? fallbackHomographyPath : null);
  const hasHomographyPath = Boolean(homographyJsonPath);
  const statusValue = String(row.calibration_status ?? row.status ?? "").toLowerCase();
  const isActiveCalibration = row.is_active === true || String(row.status ?? "").toLowerCase() === "active";
  const isValidForLive = hasHomographyPath && (["valid", "active"].includes(statusValue) || isActiveCalibration);
  const status = isValidForLive ? "valid" : (row.homography_json_path ? "pending" : "missing");
  return {
    ...row,
    homography_json_path: homographyJsonPath,
    calibration_status: row.calibration_status ?? status,
    calibrationStatus: status,
    isValidForLive,
    hasHomographyPath,
  };
}

export async function saveCourtLiveCalibration(args) {
  const {
    courtId,
    cameraId = args.camera_id ?? null,
    sport = args.sport_type ?? "padel",
    homographyJsonPath = args.homography_json_path ?? null,
    calibrationStatus = args.calibration_status ?? "draft",
    actor,
  } = args;
  const court = await getCourtForLive(courtId);
  if (!court) {
    const error = new Error("Court not found");
    error.statusCode = 404;
    throw error;
  }
  if (!(await canManageLiveSession(actor, court.arena_id))) {
    const error = new Error("Admin access required for this court");
    error.statusCode = 403;
    throw error;
  }
  const { rows } = await pool.query(
    `INSERT INTO court_calibrations (
       arena_id, court_id, camera_id, sport, sport_type, homography_json_path,
       calibration_status, status, created_by_user_id, updated_at
     )
     VALUES ($1, $2, $3, $4, $4, $5, $6, $6, $7, NOW())
     RETURNING *`,
    [court.arena_id, court.id, toNumber(cameraId), String(sport || "padel"), homographyJsonPath, calibrationStatus, actor?.id ?? null]
  );
  return rows[0];
}

export async function createLiveSession(args) {
  const {
    actor,
    courtId = args.court_id,
    cameraId = args.camera_id ?? null,
    matchId = args.match_id ?? null,
    competitionId = args.competition_id ?? null,
    reservationId = args.reservation_id ?? null,
    mode = "real",
    players = [],
  } = args;
  const court = await getCourtForLive(courtId);
  if (!court) {
    const error = new Error("Court not found");
    error.statusCode = 404;
    throw error;
  }
  if (!(await canManageLiveSession(actor, court.arena_id))) {
    const error = new Error("Admin access required for this court");
    error.statusCode = 403;
    throw error;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO live_sessions (
         arena_id, court_id, camera_id, match_id, competition_id, reservation_id,
         status, mode, started_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'created', $7, $8)
       RETURNING *`,
      [court.arena_id, court.id, toNumber(cameraId), toNumber(matchId), toNumber(competitionId), toNumber(reservationId), mode, actor.id]
    );
    const session = rows[0];
    let slotIndex = 1;
    for (const player of Array.isArray(players) ? players : []) {
      await client.query(
        `INSERT INTO live_session_players (live_session_id, user_id, slot, team, side_hint)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          session.id,
          toNumber(player.userId),
          String(player.slot ?? `P${slotIndex++}`),
          player.team ? String(player.team) : null,
          player.sideHint ? String(player.sideHint) : null,
        ]
      );
    }
    await client.query("COMMIT");
    return getLiveSessionById(session.id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createSystemLiveSessionForReservation({ reservation, camera, players = [] }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO live_sessions (
         arena_id, court_id, camera_id, match_id, competition_id, reservation_id,
         status, mode, started_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'created', 'real', NULL)
       RETURNING *`,
      [
        reservation.arena_id,
        reservation.court_id,
        camera?.id ?? null,
        reservation.match_id ?? null,
        reservation.competition_id ?? null,
        reservation.id,
      ]
    );
    const session = rows[0];
    let slotIndex = 1;
    for (const player of players) {
      await client.query(
        `INSERT INTO live_session_players (live_session_id, user_id, slot, team, side_hint)
         VALUES ($1, $2, $3, $4, $5)`,
        [session.id, toNumber(player.user_id ?? player.userId), `P${slotIndex++}`, player.team ?? null, player.side_hint ?? null]
      );
    }
    await client.query("COMMIT");
    return getLiveSessionById(session.id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listLiveSessions({ actor, status = null } = {}) {
  const role = actor?.effective_role ?? actor?.role;
  const values = [];
  const clauses = [];
  if (status) {
    values.push(String(status));
    clauses.push(`ls.status = $${values.length}`);
  }
  if (["admin", "super_admin"].includes(role)) {
    if (role !== "super_admin") {
      const arenaIds = await getActorArenaIds(actor);
      if (!arenaIds.length) return [];
      values.push(arenaIds);
      clauses.push(`ls.arena_id = ANY($${values.length}::int[])`);
    }
  } else if (role === "coach") {
    const arenaIds = await getActorArenaIds(actor);
    values.push(actor.id);
    const coachUserParam = values.length;
    values.push(arenaIds);
    const arenaParam = values.length;
    clauses.push(
      `(ls.arena_id = ANY($${arenaParam}::int[])
        OR EXISTS (SELECT 1 FROM live_session_players lsp WHERE lsp.live_session_id = ls.id AND lsp.user_id = $${coachUserParam})
        OR EXISTS (
          SELECT 1 FROM live_session_players lsp
          JOIN coach_player_relationships cpr ON cpr.player_user_id = lsp.user_id
          WHERE lsp.live_session_id = ls.id AND cpr.coach_user_id = $${coachUserParam} AND cpr.status = 'active'
        ))`
    );
  } else {
    values.push(actor?.id ?? -1);
    clauses.push(`EXISTS (SELECT 1 FROM live_session_players lsp WHERE lsp.live_session_id = ls.id AND lsp.user_id = $${values.length})`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT ls.*, a.name AS arena_name, c.name AS court_name, cc.name AS camera_name, cc.camera_url, cc.camera_type
     FROM live_sessions ls
     JOIN arenas a ON a.id = ls.arena_id
     JOIN courts c ON c.id = ls.court_id
     LEFT JOIN court_cameras cc ON cc.id = ls.camera_id
     ${where}
     ORDER BY ls.created_at DESC
     LIMIT 100`,
    values
  );
  return rows.map(toRowPayload);
}

export async function getLiveSessionById(id) {
  const { rows } = await pool.query(
    `SELECT ls.*, a.name AS arena_name, c.name AS court_name, cc.name AS camera_name, cc.camera_url, cc.camera_type
     FROM live_sessions ls
     JOIN arenas a ON a.id = ls.arena_id
     JOIN courts c ON c.id = ls.court_id
     LEFT JOIN court_cameras cc ON cc.id = ls.camera_id
     WHERE ls.id = $1`,
    [toNumber(id)]
  );
  const session = rows[0];
  if (!session) return null;
  const { rows: players } = await pool.query(
    `SELECT lsp.*, u.first_name, u.last_name, u.email
     FROM live_session_players lsp
     LEFT JOIN users u ON u.id = lsp.user_id
     WHERE lsp.live_session_id = $1
     ORDER BY lsp.id ASC`,
    [session.id]
  );
  return {
    ...toRowPayload(session),
    players: players.map((row) => ({
      id: row.id,
      userId: row.user_id,
      slot: row.slot,
      team: row.team,
      sideHint: row.side_hint,
      name: row.first_name ? `${row.first_name} ${row.last_name ?? ""}`.trim() : row.email ?? row.slot,
    })),
  };
}

export async function deleteLiveSession(sessionId) {
  await pool.query("DELETE FROM live_sessions WHERE id = $1", [toNumber(sessionId)]);
}

export async function patchLiveSession(sessionId, updates) {
  const fields = [];
  const vals = [];
  if (updates.mode !== undefined) { vals.push(updates.mode); fields.push(`mode = $${vals.length}`); }
  if (updates.courtId !== undefined) { vals.push(Number(updates.courtId)); fields.push(`court_id = $${vals.length}`); }
  if (!fields.length) return;
  vals.push(toNumber(sessionId));
  await pool.query(`UPDATE live_sessions SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${vals.length}`, vals);
}

export async function updateLiveSessionStatus({ sessionId, status, message = null, aiSessionId = null, fps = null, lastFrame = null, stopped = false }) {
  const { rows } = await pool.query(
    `UPDATE live_sessions
     SET status = COALESCE($2, status),
         ai_status_message = COALESCE($3, ai_status_message),
         ai_session_id = COALESCE($4, ai_session_id),
         fps = COALESCE($5, fps),
         last_frame = COALESCE($6, last_frame),
         started_at = CASE WHEN $2 IN ('starting', 'running') AND started_at IS NULL THEN NOW() ELSE started_at END,
         stopped_at = CASE WHEN $7 THEN NOW() ELSE stopped_at END,
         last_update_at = CASE WHEN $5 IS NOT NULL OR $6 IS NOT NULL THEN NOW() ELSE last_update_at END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [toNumber(sessionId), status, message, aiSessionId, toNumber(fps), toNumber(lastFrame), stopped]
  );
  return rows[0] ?? null;
}

export async function listReservationsNeedingLiveStart() {
  const { rows } = await pool.query(
    `SELECT r.*, c.arena_id, m.id AS match_id, m.competition_id
     FROM reservations r
     JOIN courts c ON c.id = r.court_id
     LEFT JOIN matches m ON m.reservation_id = r.id
     WHERE r.status = 'confirmed'
       AND COALESCE(r.live_analysis_enabled, TRUE) = TRUE
       AND (r.reservation_date::timestamp + r.start_time) <= NOW()
       AND (r.reservation_date::timestamp + r.end_time) > NOW()
       AND NOT EXISTS (
         SELECT 1 FROM live_sessions ls
         WHERE ls.reservation_id = r.id
           AND ls.status IN ('created', 'starting', 'running')
       )
     ORDER BY r.reservation_date ASC, r.start_time ASC
     LIMIT 10`
  );
  return rows;
}

export async function listLiveSessionsNeedingStop() {
  const { rows } = await pool.query(
    `SELECT ls.*
     FROM live_sessions ls
     JOIN reservations r ON r.id = ls.reservation_id
     WHERE ls.status IN ('created', 'starting', 'running')
       AND (r.reservation_date::timestamp + r.end_time) <= NOW()
     LIMIT 20`
  );
  return rows;
}

export async function listReservationLivePlayers(reservationId) {
  const { rows } = await pool.query(
    `SELECT user_id FROM reservation_participants WHERE reservation_id = $1 ORDER BY id ASC`,
    [toNumber(reservationId)]
  );
  return rows;
}

export async function recordLiveUpdate({ sessionId, payload, sample = false }) {
  const frame = toNumber(payload?.frame);
  const fps = toNumber(payload?.fps);
  const timestampMs = toNumber(payload?.timestamp_ms ?? payload?.timestampMs);
  const session = await updateLiveSessionStatus({
    sessionId,
    status: "running",
    fps,
    lastFrame: frame,
    message: payload?.status_message ?? payload?.statusMessage ?? null,
  });
  if (sample || frame === null || frame % 10 === 0) {
    await pool.query(
      `INSERT INTO live_ai_events (live_session_id, frame, timestamp_ms, event_type, payload_json)
       VALUES ($1, $2, $3, 'visual_update', $4)`,
      [toNumber(sessionId), frame, timestampMs, payload ?? {}]
    );
  }
  return session;
}

export async function getLatestLiveUpdate(sessionId) {
  const { rows } = await pool.query(
    `SELECT payload_json
     FROM live_ai_events
     WHERE live_session_id = $1
       AND event_type = 'visual_update'
     ORDER BY id DESC
     LIMIT 1`,
    [toNumber(sessionId)]
  );
  return rows[0]?.payload_json ?? null;
}

export async function ensureActiveStatus(status) {
  return ACTIVE_STATUSES.includes(String(status));
}

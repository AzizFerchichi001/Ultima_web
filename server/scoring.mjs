/**
 * Smart Scoring Module
 * Handles match scores, score events, and correction audit trail.
 * PostgreSQL via shared pg-pool.
 */
import pool from "./pg-pool.mjs";

/** Get match with current score */
export async function getMatchScore(matchId) {
  const result = await pool.query(
    `SELECT m.id, m.status, m.score1, m.score2, m.current_set, m.score_source,
            m.player1_name, m.player2_name, m.scheduled_at, m.winner_team,
            c.name AS court_name, a.name AS arena_name
     FROM matches m
     LEFT JOIN courts c ON c.id = m.court_id
     LEFT JOIN arenas a ON a.id = m.arena_id
     WHERE m.id = $1`,
    [matchId]
  );
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    ...row,
    score1: Array.isArray(row.score1) ? row.score1 : (typeof row.score1 === "string" ? JSON.parse(row.score1) : []),
    score2: Array.isArray(row.score2) ? row.score2 : (typeof row.score2 === "string" ? JSON.parse(row.score2) : []),
  };
}

/** Update match score and log the correction */
export async function updateMatchScore({ matchId, score1, score2, status, actorId, actorRole, reason }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query("SELECT score1, score2, status FROM matches WHERE id = $1", [matchId]);
    if (!existing.rows.length) throw new Error("Match not found");

    const old = existing.rows[0];
    const oldScore1 = Array.isArray(old.score1) ? old.score1 : (typeof old.score1 === "string" ? JSON.parse(old.score1) : []);
    const oldScore2 = Array.isArray(old.score2) ? old.score2 : (typeof old.score2 === "string" ? JSON.parse(old.score2) : []);
    const newScore1 = Array.isArray(score1) ? score1 : oldScore1;
    const newScore2 = Array.isArray(score2) ? score2 : oldScore2;

    const updateFields = ["score1 = $1", "score2 = $2", "score_source = 'corrected'"];
    const updateValues = [JSON.stringify(newScore1), JSON.stringify(newScore2)];

    if (status && ["live", "finished", "upcoming", "paused"].includes(status)) {
      updateValues.push(status);
      updateFields.push(`status = $${updateValues.length}`);
    }
    updateValues.push(matchId);
    await client.query(`UPDATE matches SET ${updateFields.join(", ")} WHERE id = $${updateValues.length}`, updateValues);

    await client.query(
      `INSERT INTO score_correction_logs
         (match_id, old_score1, old_score2, new_score1, new_score2, reason, changed_by_user_id, changed_by_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [matchId, JSON.stringify(oldScore1), JSON.stringify(oldScore2),
       JSON.stringify(newScore1), JSON.stringify(newScore2),
       reason ?? null, actorId, actorRole]
    );

    await client.query("COMMIT");
    return await getMatchScore(matchId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Get score events for a match */
export async function getScoreEvents(matchId, limit = 50) {
  const result = await pool.query(
    `SELECT * FROM score_events WHERE match_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [matchId, limit]
  );
  return result.rows;
}

/** Create a score event */
export async function createScoreEvent({ matchId, eventType, playerName, team, setNumber, source, confidence, metadata }) {
  const result = await pool.query(
    `INSERT INTO score_events (match_id, event_type, player_name, team, set_number, source, confidence, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [matchId, eventType ?? "point", playerName ?? null, team ?? null,
     setNumber ?? 1, source ?? "manual", confidence ?? null,
     metadata ? JSON.stringify(metadata) : null]
  );
  return { id: result.rows[0].id, matchId, eventType, playerName, team, setNumber };
}

/** Get correction log for a match */
export async function getScoreCorrectionLogs(matchId) {
  const result = await pool.query(
    `SELECT scl.*, u.first_name, u.last_name, u.email
     FROM score_correction_logs scl
     LEFT JOIN users u ON u.id = scl.changed_by_user_id
     WHERE scl.match_id = $1
     ORDER BY scl.created_at DESC`,
    [matchId]
  );
  return result.rows.map((row) => ({
    ...row,
    old_score1: Array.isArray(row.old_score1) ? row.old_score1 : (typeof row.old_score1 === "string" ? JSON.parse(row.old_score1) : row.old_score1),
    old_score2: Array.isArray(row.old_score2) ? row.old_score2 : (typeof row.old_score2 === "string" ? JSON.parse(row.old_score2) : row.old_score2),
    new_score1: Array.isArray(row.new_score1) ? row.new_score1 : (typeof row.new_score1 === "string" ? JSON.parse(row.new_score1) : row.new_score1),
    new_score2: Array.isArray(row.new_score2) ? row.new_score2 : (typeof row.new_score2 === "string" ? JSON.parse(row.new_score2) : row.new_score2),
  }));
}

/** Get all matches for admin scoring view */
export async function listScoringMatches(actor, limit = 50) {
  const params = [];
  let whereClause = "";

  if (actor?.platform_role !== "super_admin" && actor?.arena_id) {
    params.push(actor.arena_id);
    whereClause = `WHERE m.arena_id = $${params.length}`;
  }

  params.push(limit);
  const result = await pool.query(
    `SELECT m.id, m.status, m.score1, m.score2, m.current_set, m.score_source,
            m.player1_name, m.player2_name, m.scheduled_at, m.winner_team,
            c.name AS court_name, a.name AS arena_name,
            comp.name AS competition_name
     FROM matches m
     LEFT JOIN courts c ON c.id = m.court_id
     LEFT JOIN arenas a ON a.id = m.arena_id
     LEFT JOIN competitions comp ON comp.id = m.competition_id
     ${whereClause}
     ORDER BY CASE m.status WHEN 'live' THEN 0 WHEN 'upcoming' THEN 1 ELSE 2 END ASC,
              m.scheduled_at DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows.map((row) => ({
    ...row,
    score1: Array.isArray(row.score1) ? row.score1 : (typeof row.score1 === "string" ? JSON.parse(row.score1) : []),
    score2: Array.isArray(row.score2) ? row.score2 : (typeof row.score2 === "string" ? JSON.parse(row.score2) : []),
  }));
}

/** Recent correction activity for admin dashboard */
export async function getRecentScoreActivity(limit = 10) {
  const result = await pool.query(
    `SELECT scl.id, scl.match_id, scl.reason, scl.changed_by_role, scl.created_at,
            u.first_name, u.last_name,
            m.player1_name, m.player2_name
     FROM score_correction_logs scl
     LEFT JOIN users u ON u.id = scl.changed_by_user_id
     LEFT JOIN matches m ON m.id = scl.match_id
     ORDER BY scl.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

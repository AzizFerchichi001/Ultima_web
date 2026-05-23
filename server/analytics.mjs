/**
 * Player Analytics Module
 * Aggregates real DB data into player performance insights.
 * Future SmartPlay AI data will be injected via player_analysis table.
 * PostgreSQL via shared pg-pool.
 */
import pool from "./pg-pool.mjs";

/** Full player stats overview */
export async function getPlayerStats(userId) {
  const snapshots = await pool.query(
    `SELECT ranking_score, wins, losses, week_label, created_at
     FROM performance_snapshots
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 24`,
    [userId]
  );

  const profile = await pool.query(
    `SELECT service, return_skill, volley, endurance, strategy, mental
     FROM performance_profiles WHERE user_id = $1`,
    [userId]
  );

  const matchStats = await pool.query(
    `SELECT
       COUNT(*) AS total_matches,
       SUM(CASE WHEN winner_team IS NOT NULL THEN 1 ELSE 0 END) AS finished_matches
     FROM matches
     WHERE (player1_id = $1 OR player2_id = $2) AND status = 'finished'`,
    [userId, userId]
  );

  const reservationStats = await pool.query(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN payment_status='paid' THEN 1 ELSE 0 END) AS paid
     FROM reservations WHERE user_id = $1 AND status = 'confirmed'`,
    [userId]
  );

  const competitionStats = await pool.query(
    `SELECT COUNT(*) AS total_competitions
     FROM competition_registrations
     WHERE user_id = $1 AND status = 'registered'`,
    [userId]
  );

  const rows = snapshots.rows;
  const latest = rows[0] ?? null;
  const totalWins = Number(latest?.wins ?? 0);
  const totalLosses = Number(latest?.losses ?? 0);
  const totalPlayed = totalWins + totalLosses;

  return {
    ranking_score: Number(latest?.ranking_score ?? 0),
    wins: totalWins,
    losses: totalLosses,
    total_played: totalPlayed,
    win_rate: totalPlayed > 0 ? Math.round((totalWins / totalPlayed) * 100) : 0,
    matches_total: Number(matchStats.rows[0]?.total_matches ?? 0),
    reservations_total: Number(reservationStats.rows[0]?.total ?? 0),
    reservations_paid: Number(reservationStats.rows[0]?.paid ?? 0),
    competitions_total: Number(competitionStats.rows[0]?.total_competitions ?? 0),
    profile: profile.rows[0] ?? null,
    progress: [...rows].reverse().map((s) => ({
      label: s.week_label,
      score: Number(s.ranking_score),
      wins: Number(s.wins),
      losses: Number(s.losses),
    })),
  };
}

/** Player match history enriched with arena and court info */
export async function getPlayerMatchHistory(userId, limit = 20) {
  const result = await pool.query(
    `SELECT m.id, m.status, m.score1, m.score2, m.scheduled_at, m.winner_team,
            m.player1_name, m.player2_name, m.player1_id, m.player2_id,
            m.score_source, m.current_set,
            c.name AS court_name, a.name AS arena_name,
            comp.name AS competition_name
     FROM matches m
     LEFT JOIN courts c ON c.id = m.court_id
     LEFT JOIN arenas a ON a.id = m.arena_id
     LEFT JOIN competitions comp ON comp.id = m.competition_id
     WHERE (m.player1_id = $1 OR m.player2_id = $2) AND m.status IN ('finished','live')
     ORDER BY m.scheduled_at DESC
     LIMIT $3`,
    [userId, userId, limit]
  );

  return result.rows.map((row) => ({
    ...row,
    score1: Array.isArray(row.score1) ? row.score1 : (typeof row.score1 === "string" ? JSON.parse(row.score1) : []),
    score2: Array.isArray(row.score2) ? row.score2 : (typeof row.score2 === "string" ? JSON.parse(row.score2) : []),
    is_winner: row.winner_team === 1 ? row.player1_id === userId : row.player2_id === userId,
  }));
}

/** Reservation history with payment info */
export async function getPlayerReservationHistory(userId, limit = 20) {
  const result = await pool.query(
    `SELECT r.id, r.reservation_date, r.start_time, r.end_time, r.status,
            r.payment_status, r.booking_type, r.total_price, r.num_players, r.notes, r.qr_token, r.created_at,
            c.name AS court_name, c.court_type, c.surface_type, c.has_lighting,
            a.name AS arena_name, a.city AS arena_city,
            rp.amount, rp.currency, rp.method AS payment_method, rp.paid_at,
            CONCAT(coach_u.first_name, ' ', coach_u.last_name) AS coach_name,
            cp.headline AS coach_specialization
     FROM reservations r
     LEFT JOIN courts c ON c.id = r.court_id
     LEFT JOIN arenas a ON a.id = c.arena_id
     LEFT JOIN reservation_payments rp ON rp.reservation_id = r.id
     LEFT JOIN coaching_requests cr ON cr.coaching_reservation_id = r.id
     LEFT JOIN users coach_u ON coach_u.id = cr.coach_user_id
     LEFT JOIN coach_profiles cp ON cp.user_id = cr.coach_user_id
     WHERE r.user_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

/** Competition history for player */
export async function getPlayerCompetitionHistory(userId) {
  const result = await pool.query(
    `SELECT cr.id, cr.status AS registration_status, cr.created_at AS registered_at,
            comp.id AS competition_id, comp.name, comp.sport, comp.start_date,
            comp.status AS competition_status, comp.location,
            a.name AS arena_name
     FROM competition_registrations cr
     JOIN competitions comp ON comp.id = cr.competition_id
     LEFT JOIN arenas a ON a.id = comp.arena_id
     WHERE cr.user_id = $1
     ORDER BY comp.start_date DESC`,
    [userId]
  );
  return result.rows;
}

/** AI analysis placeholder data for player */
export async function getPlayerAiAnalysis(userId) {
  const jobs = await pool.query(
    `SELECT sj.id, sj.job_type, sj.status, sj.created_at, sj.updated_at,
            m.player1_name, m.player2_name, m.scheduled_at AS match_date
     FROM smartplay_analysis_jobs sj
     LEFT JOIN matches m ON m.id = sj.match_id
     WHERE sj.user_id = $1
     ORDER BY sj.created_at DESC
     LIMIT 10`,
    [userId]
  );

  const analysis = await pool.query(
    `SELECT pa.*, m.player1_name, m.player2_name, m.scheduled_at
     FROM player_analysis pa
     LEFT JOIN matches m ON m.id = pa.match_id
     WHERE pa.user_id = $1
     ORDER BY pa.created_at DESC
     LIMIT 5`,
    [userId]
  );

  return { jobs: jobs.rows, analysis: analysis.rows };
}

/** Platform-wide stats for super admin */
export async function getPlatformStats() {
  const [users, courts, reservations, matches, revenue] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total, role, status FROM users GROUP BY role, status`),
    pool.query(`SELECT COUNT(*) AS total, status FROM courts GROUP BY status`),
    pool.query(
      `SELECT COUNT(*) AS total, payment_status FROM reservations WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY payment_status`
    ),
    pool.query(`SELECT COUNT(*) AS total, status FROM matches GROUP BY status`),
    pool.query(`SELECT SUM(amount) AS total, currency FROM reservation_payments WHERE status='paid' GROUP BY currency`),
  ]);

  return {
    users: users.rows,
    courts: courts.rows,
    reservations: reservations.rows,
    matches: matches.rows,
    revenue: revenue.rows,
  };
}

/** Revenue summary for admin billing section */
export async function getRevenueSummary(arenaId = null) {
  const params = [];
  let arenaFilter = "";
  if (arenaId) {
    params.push(arenaId);
    arenaFilter = `AND c.arena_id = $${params.length}`;
  }

  const summary = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN rp.status='paid' THEN rp.amount ELSE 0 END), 0) AS total_revenue,
       COUNT(CASE WHEN rp.status='paid' THEN 1 END) AS paid_count,
       COUNT(CASE WHEN rp.status='pending' THEN 1 END) AS pending_count,
       COUNT(CASE WHEN rp.status='refunded' THEN 1 END) AS refunded_count,
       COUNT(rp.id) AS total_payments
     FROM reservation_payments rp
     JOIN reservations r ON r.id = rp.reservation_id
     JOIN courts c ON c.id = r.court_id
     WHERE 1=1 ${arenaFilter}`,
    params
  );

  const monthlyParams = [...params];
  const monthly = await pool.query(
    `SELECT TO_CHAR(rp.paid_at, 'YYYY-MM') AS month, SUM(rp.amount) AS revenue, COUNT(*) AS payments
     FROM reservation_payments rp
     JOIN reservations r ON r.id = rp.reservation_id
     JOIN courts c ON c.id = r.court_id
     WHERE rp.status='paid' AND rp.paid_at > NOW() - INTERVAL '6 months'
     ${arenaFilter.replace(`$${params.length}`, `$${monthlyParams.length}`)}
     GROUP BY TO_CHAR(rp.paid_at, 'YYYY-MM')
     ORDER BY month ASC`,
    monthlyParams
  );

  return { summary: summary.rows[0] ?? {}, monthly: monthly.rows };
}

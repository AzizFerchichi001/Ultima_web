import pool from "../server/pg-pool.mjs";

const waitMs = Number(process.env.LIVE_SCHEDULER_VERIFY_WAIT_MS ?? 35000);

const created = await pool.query(
  `INSERT INTO reservations (
     user_id, court_id, reservation_date, start_time, end_time,
     status, qr_token, live_analysis_enabled
   )
   VALUES (
     5, 1, CURRENT_DATE,
     (CURRENT_TIME - interval '1 minute')::time,
     (CURRENT_TIME + interval '3 minutes')::time,
     'confirmed', gen_random_uuid()::text, TRUE
   )
   RETURNING id`
);
const reservationId = Number(created.rows[0].id);
await pool.query(
  "INSERT INTO reservation_participants (reservation_id, user_id) VALUES ($1, 5) ON CONFLICT DO NOTHING",
  [reservationId]
);

console.log(`Created live scheduler verification reservation ${reservationId}. Waiting ${waitMs}ms...`);
await new Promise((resolve) => setTimeout(resolve, waitMs));

const { rows } = await pool.query(
  `SELECT id, status, mode, reservation_id, fps, last_frame
   FROM live_sessions
   WHERE reservation_id = $1
   ORDER BY id DESC
   LIMIT 1`,
  [reservationId]
);

console.log(JSON.stringify({ reservationId, session: rows[0] ?? null }, null, 2));
await pool.end();

if (!rows[0]) {
  process.exitCode = 1;
}

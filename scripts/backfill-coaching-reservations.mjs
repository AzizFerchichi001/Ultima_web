import pool from '../server/pg-pool.mjs';
import { randomUUID } from 'node:crypto';
const { rows } = await pool.query("SELECT * FROM coaching_requests WHERE payment_status='paid' ORDER BY id DESC");
console.log('Paid requests:', rows.length);
for (const cr of rows) {
  if (!cr.coaching_reservation_id && cr.preferred_court_id) {
    const qrToken = randomUUID();
    const { rows: r } = await pool.query(
      `INSERT INTO reservations (user_id, arena_id, court_id, reservation_date, start_time, end_time, sport, players_count, status, payment_status, booking_type, qr_token, created_at)
       VALUES ($1,$2,$3,$4::date,$5::time,$6::time,'padel',$7,'confirmed','paid','coaching_session',$8,NOW()) RETURNING id`,
      [cr.player_user_id, cr.arena_id, cr.preferred_court_id, cr.requested_date, cr.requested_start_time, cr.requested_end_time, cr.players_count ?? 2, qrToken]
    );
    console.log('Created reservation', r[0].id, 'for coaching request', cr.id);
    await pool.query('UPDATE coaching_requests SET coaching_reservation_id=$1 WHERE id=$2', [r[0].id, cr.id]);
  } else {
    console.log('Request', cr.id, 'reservation:', cr.coaching_reservation_id ?? 'none (no court selected)');
  }
}
await pool.end();

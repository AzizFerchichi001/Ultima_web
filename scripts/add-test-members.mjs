import pkg from "../node_modules/pg/lib/index.js";
const { Pool } = pkg;
const pool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});
const r = await pool.query(`
  INSERT INTO arena_memberships (user_id, arena_id, role, status)
  SELECT u.id, a.id, 'player', 'active'
  FROM users u CROSS JOIN arenas a
  WHERE u.email IN ('dada@gmail.com','mariemtr28@gmail.com')
  ON CONFLICT DO NOTHING
`);
console.log(`Done — inserted ${r.rowCount} memberships`);
await pool.end();

/**
 * Creates SmartPlay uploaded clip pipeline tables.
 *
 * Usage:
 *   node --env-file=.env scripts/migrate-smartplay-clip-pipeline.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "pg";

const { Pool } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const sqlPath = path.join(projectRoot, "database", "smartplay_clip_pipeline.sql");

const pool = new Pool({
  host: process.env.PG_HOST ?? "127.0.0.1",
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER ?? "postgres",
  password: process.env.PG_PASSWORD ?? "",
  database: process.env.PG_DATABASE ?? "ultima_demo",
});

try {
  await pool.query(fs.readFileSync(sqlPath, "utf8"));
  console.log("SmartPlay clip pipeline migration complete.");
} catch (error) {
  console.error("SmartPlay clip pipeline migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}

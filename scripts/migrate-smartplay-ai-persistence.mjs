/**
 * Creates SmartPlay AI FastAPI persistence tables.
 *
 * Usage:
 *   node --env-file=.env scripts/migrate-smartplay-ai-persistence.mjs
 *   PG_PORT=5433 PG_PASSWORD=admin PG_DATABASE=ultima_web node scripts/migrate-smartplay-ai-persistence.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "pg";

const { Pool } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const sqlPath = path.join(projectRoot, "database", "smartplay_ai_persistence.sql");

const pool = new Pool({
  host: process.env.PG_HOST ?? "127.0.0.1",
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER ?? "postgres",
  password: process.env.PG_PASSWORD ?? "",
  database: process.env.PG_DATABASE ?? "ultima_demo",
});

try {
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(sql);
  console.log("SmartPlay AI persistence migration complete.");
} catch (error) {
  console.error("SmartPlay AI persistence migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}

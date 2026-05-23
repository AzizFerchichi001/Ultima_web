/**
 * Creates live SmartPlay visual analysis tables.
 *
 * Usage:
 *   node --env-file=.env.dockerdb scripts/migrate-live-visual-analysis.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "../server/pg-pool.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "..", "database", "live_visual_analysis.sql");

try {
  await pool.query(fs.readFileSync(sqlPath, "utf8"));
  console.log("Live visual analysis migration complete.");
} catch (error) {
  console.error("Live visual analysis migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}

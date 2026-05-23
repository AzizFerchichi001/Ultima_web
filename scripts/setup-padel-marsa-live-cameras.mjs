import pool from "../server/pg-pool.mjs";
import fs from "node:fs";
import path from "node:path";

const COURT_SOURCES = [
  {
    courtNumber: 1,
    cameras: [
      {
        cameraName: "Court 1 Camera 01",
        cameraUrl: "C:\\Users\\USER\\OneDrive\\Documents\\GitHub\\workspace\\smartplay_ai\\data\\processed\\matches\\match_0007_padel\\cameras\\camera_01_main.mp4",
        isActive: true,
      },
      {
        cameraName: "Court 1 Camera 02",
        cameraUrl: "C:\\Users\\USER\\OneDrive\\Documents\\GitHub\\workspace\\smartplay_ai\\data\\processed\\matches\\match_0007_padel\\cameras\\camera_02_main.mp4",
        isActive: false,
      },
    ],
  },
  {
    courtNumber: 2,
    cameras: [
      {
        cameraName: "Court 2 Camera 01",
        cameraUrl: "C:\\Users\\USER\\OneDrive\\Documents\\GitHub\\workspace\\smartplay_ai\\data\\processed\\matches\\match_0004_padel\\cameras\\camera_01_main.mp4",
        isActive: true,
      },
      {
        cameraName: "Court 2 Camera 02",
        cameraUrl: "C:\\Users\\USER\\OneDrive\\Documents\\GitHub\\workspace\\smartplay_ai\\data\\processed\\matches\\match_0004_padel\\cameras\\camera_02_main.mp4",
        isActive: false,
      },
    ],
  },
];

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

async function findPadelMarsaArena() {
  const { rows } = await pool.query("SELECT * FROM arenas ORDER BY id ASC");
  return rows.find((arena) => {
    const slug = normalize(arena.slug);
    const name = normalize(arena.name);
    return slug === "padel_marsa" || slug === "padel-marsa" || name === "padel_marsa" || name === "padel_marsa";
  }) ?? rows.find((arena) => normalize(arena.slug).includes("padel_marsa") || normalize(arena.name).includes("padel_marsa"));
}

async function findCourt(arenaId, courtNumber) {
  const { rows } = await pool.query(
    "SELECT * FROM courts WHERE arena_id = $1 ORDER BY id ASC",
    [arenaId]
  );
  const exact = rows.find((court) => {
    const name = normalize(court.name);
    return name === `court_${courtNumber}` || name.endsWith(`_court_${courtNumber}`) || name.includes(`court_${courtNumber}`);
  });
  return exact ?? rows[courtNumber - 1] ?? null;
}

async function upsertCamera({ arena, court, source }) {
  const { rows: existing } = await pool.query(
    `SELECT * FROM court_cameras
     WHERE court_id = $1 AND (name = $2 OR camera_url = $3)
     ORDER BY id ASC
     LIMIT 1`,
    [court.id, source.cameraName, source.cameraUrl]
  );

  if (existing[0]) {
    const { rows } = await pool.query(
      `UPDATE court_cameras
       SET arena_id = $1,
           name = $2,
           camera_type = 'file_demo',
           camera_url = $3,
           is_active = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [arena.id, source.cameraName, source.cameraUrl, source.isActive === true, existing[0].id]
    );
    return rows[0];
  }

  const { rows } = await pool.query(
    `INSERT INTO court_cameras (arena_id, court_id, name, camera_type, camera_url, is_active)
     VALUES ($1, $2, $3, 'file_demo', $4, $5)
     RETURNING *`,
    [arena.id, court.id, source.cameraName, source.cameraUrl, source.isActive === true]
  );
  return rows[0];
}

async function getCalibrationStatus(courtId) {
  const { rows } = await pool.query(
    `SELECT id, calibration_status, status, is_active, homography_json_path, updated_at
     FROM court_calibrations
     WHERE court_id = $1
     ORDER BY
       CASE
         WHEN lower(COALESCE(calibration_status, '')) = 'valid' AND homography_json_path IS NOT NULL THEN 0
         WHEN is_active = TRUE AND homography_json_path IS NOT NULL THEN 1
         ELSE 2
       END,
       updated_at DESC
     LIMIT 1`,
    [courtId]
  );
  const calibration = rows[0] ?? null;
  const fallbackHomographyPath = `uploads/homography/court_${courtId}.json`;
  const fallbackHomographyExists = fs.existsSync(path.resolve(process.cwd(), fallbackHomographyPath));
  if (!calibration) return { status: "missing", calibration: null };
  const homographyJsonPath = calibration.homography_json_path ?? (fallbackHomographyExists ? fallbackHomographyPath : null);
  const valid = Boolean(homographyJsonPath)
    && (
      ["valid", "active"].includes(String(calibration.calibration_status ?? "").toLowerCase())
      || ["valid", "active"].includes(String(calibration.status ?? "").toLowerCase())
      || calibration.is_active === true
    );
  return { status: valid ? "valid" : (homographyJsonPath ? "pending" : "missing"), calibration: { ...calibration, homography_json_path: homographyJsonPath } };
}

try {
  const arena = await findPadelMarsaArena();
  if (!arena) {
    throw new Error("Arena padel_marsa / padel-marsa was not found.");
  }
  console.log(`Arena: ${arena.name} (id=${arena.id}, slug=${arena.slug})`);

  for (const courtSource of COURT_SOURCES) {
    const court = await findCourt(arena.id, courtSource.courtNumber);
    if (!court) {
      throw new Error(`Court ${courtSource.courtNumber} was not found under arena ${arena.name}.`);
    }
    const calibration = await getCalibrationStatus(court.id);
    for (const source of courtSource.cameras) {
      const camera = await upsertCamera({ arena, court, source });
      const fileExists = fs.existsSync(source.cameraUrl);
      console.log([
        `Court ${courtSource.courtNumber}: ${court.name} (id=${court.id})`,
        `camera id=${camera.id}`,
        `name=${camera.name}`,
        `type=${camera.camera_type}`,
        `active=${camera.is_active}`,
        `file=${fileExists ? "exists" : "missing"}`,
        `url=${camera.camera_url}`,
        `calibration=${calibration.status}`,
        calibration.calibration?.id ? `calibration_id=${calibration.calibration.id}` : "calibration_id=none",
      ].join(" | "));
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}

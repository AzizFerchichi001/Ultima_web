/**
 * SmartPlay AI Integration Service
 * Placeholder / stub module for future AI microservice integration.
 * The actual AI backend is NOT ready. This module provides safe fallbacks.
 * PostgreSQL via shared pg-pool.
 *
 * FastAPI service integration uses SMARTPLAY_AI_URL.
 * Current service endpoints include:
 *   GET  /health
 *   POST /jobs/scoring-v2
 *   GET  /jobs/:jobId
 *   GET  /matches/:matchId/:cameraId/events
 *   GET  /matches/:matchId/:cameraId/debug-video
 */
import pool from "./pg-pool.mjs";

const AI_SERVICE_URL = process.env.SMARTPLAY_AI_URL ?? null;

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Check AI microservice connectivity */
export async function getSmartPlayStatus() {
  const base = {
    connected: false,
    version: null,
    message: "SmartPlay AI microservice is not yet connected. Analytics features will be available once the AI backend is deployed.",
    features: {
      court_detection: false,
      player_tracking: false,
      ball_tracking: false,
      smart_scoring: false,
      heatmap: false,
      performance_analysis: false,
    },
  };

  if (!AI_SERVICE_URL) {
    return base;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${AI_SERVICE_URL.replace(/\/+$/, "")}/health`, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      return {
        connected: true,
        version: data.version ?? null,
        message: "SmartPlay AI microservice is connected.",
        service: data.service ?? "smartplay_ai",
        features: {
          court_detection: false,
          player_tracking: false,
          ball_tracking: false,
          smart_scoring: true,
          heatmap: false,
          performance_analysis: false,
        },
      };
    }
  } catch {
    // AI service unavailable — return safe placeholder
  }

  return base;
}

/** Create an analysis job (queued for AI processing) */
export async function createAnalysisJob({ userId, matchId, jobType, sourceVideoPath, requestedByUserId }) {
  const result = await pool.query(
    `INSERT INTO smartplay_analysis_jobs (user_id, match_id, job_type, source_video_path, status, requested_by_user_id)
     VALUES ($1, $2, $3, $4, 'queued', $5)
     RETURNING id`,
    [userId, matchId ?? null, jobType ?? "full_match", sourceVideoPath ?? null, requestedByUserId ?? userId]
  );
  return { id: result.rows[0].id, userId, matchId, jobType, status: "queued" };
}

export async function createAiAnalysisJobRecord({
  matchId = null,
  externalMatchKey,
  cameraId,
  requestedByUserId = null,
  jobId,
  status = "queued",
  aiServiceUrl = null,
  inputVideoPath = null,
  ballTracksPath = null,
  playerTracksPath = null,
  outputDir = null,
  debugVideoPath = null,
}) {
  const result = await pool.query(
    `INSERT INTO ai_analysis_jobs (
       match_id, external_match_key, camera_id, requested_by_user_id, job_id, status,
       ai_service_url, input_video_path, ball_tracks_path, player_tracks_path,
       output_dir, debug_video_path
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (job_id) DO UPDATE SET
       status = EXCLUDED.status,
       updated_at = NOW()
     RETURNING *`,
    [
      nullableNumber(matchId),
      externalMatchKey,
      cameraId ?? "camera_01",
      nullableNumber(requestedByUserId),
      jobId,
      status,
      aiServiceUrl,
      inputVideoPath,
      ballTracksPath,
      playerTracksPath,
      outputDir,
      debugVideoPath,
    ]
  );
  return result.rows[0];
}

export async function getAiAnalysisJobByExternalJobId(jobId) {
  const result = await pool.query("SELECT * FROM ai_analysis_jobs WHERE job_id = $1", [jobId]);
  return result.rows[0] ?? null;
}

export async function getLatestAiAnalysisJobForMatch(externalMatchKey, cameraId = "camera_01") {
  const result = await pool.query(
    `SELECT *
     FROM ai_analysis_jobs
     WHERE external_match_key = $1 AND camera_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [externalMatchKey, cameraId]
  );
  return result.rows[0] ?? null;
}

export async function updateAiAnalysisJobFromService(jobId, serviceJob) {
  const result = await pool.query(
    `UPDATE ai_analysis_jobs
     SET status = COALESCE($2, status),
         error_message = $3,
         started_at = COALESCE($4, started_at),
         finished_at = COALESCE($5, finished_at),
         updated_at = NOW()
     WHERE job_id = $1
     RETURNING *`,
    [
      jobId,
      serviceJob?.status ?? null,
      serviceJob?.error_message ?? null,
      nullableDate(serviceJob?.started_at),
      nullableDate(serviceJob?.finished_at),
    ]
  );
  return result.rows[0] ?? null;
}

export async function saveAiScoringEventsForJob({ jobId, events = [] }) {
  const job = await getAiAnalysisJobByExternalJobId(jobId);
  if (!job) return { saved: 0, job: null };

  await pool.query("DELETE FROM ai_scoring_events WHERE analysis_job_id = $1", [job.id]);
  if (!Array.isArray(events) || events.length === 0) {
    return { saved: 0, job };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let saved = 0;
    for (const event of events) {
      const frame = nullableNumber(event?.frame);
      const eventType = event?.event_type ? String(event.event_type) : null;
      if (frame === null || !eventType) continue;
      await client.query(
        `INSERT INTO ai_scoring_events (
           analysis_job_id, match_id, external_match_key, camera_id, frame,
           time_sec, event_type, winner_side, confidence, reason, raw
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          job.id,
          job.match_id,
          job.external_match_key,
          job.camera_id,
          frame,
          nullableNumber(event?.time_sec),
          eventType,
          event?.winner_side ? String(event.winner_side) : null,
          nullableNumber(event?.confidence),
          event?.reason ? String(event.reason) : null,
          event ?? {},
        ]
      );
      saved += 1;
    }
    await client.query("DELETE FROM ai_performance_summaries WHERE analysis_job_id = $1", [job.id]);
    await client.query(
      `INSERT INTO ai_performance_summaries (analysis_job_id, match_id, summary)
       VALUES ($1, $2, $3)`,
      [
        job.id,
        job.match_id,
        {
          external_match_key: job.external_match_key,
          camera_id: job.camera_id,
          events_count: saved,
          event_types: events.reduce((acc, event) => {
            const key = event?.event_type ? String(event.event_type) : "unknown";
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
          }, {}),
        },
      ]
    );
    await client.query("COMMIT");
    return { saved, job };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listAiScoringEventsForMatch(externalMatchKey, cameraId = "camera_01") {
  const result = await pool.query(
    `SELECT frame, time_sec, event_type, winner_side, confidence, reason, raw
     FROM ai_scoring_events
     WHERE external_match_key = $1 AND camera_id = $2
     ORDER BY frame ASC`,
    [externalMatchKey, cameraId]
  );
  return result.rows.map((row) => ({
    frame: row.frame,
    time_sec: row.time_sec === null ? null : Number(row.time_sec),
    event_type: row.event_type,
    winner_side: row.winner_side,
    confidence: row.confidence === null ? null : Number(row.confidence),
    reason: row.reason,
    raw: row.raw,
  }));
}

function toClip(row) {
  if (!row) return null;
  let assignedPlayerIds = [];
  try {
    const raw = row.assigned_player_ids;
    assignedPlayerIds = typeof raw === "string" ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
  } catch {}
  return {
    id: row.id,
    matchId: row.match_id,
    externalMatchKey: row.external_match_key,
    playerUserId: row.player_user_id,
    uploadedByUserId: row.uploaded_by_user_id,
    cameraId: row.camera_id,
    sportType: row.sport_type,
    originalFilename: row.original_filename,
    storedVideoPath: row.stored_video_path,
    durationSec: row.duration_sec === null ? null : Number(row.duration_sec),
    fps: row.fps === null ? null : Number(row.fps),
    frameCount: row.frame_count,
    width: row.width,
    height: row.height,
    status: row.status,
    courtId: row.court_id ?? null,
    assignedPlayerIds: assignedPlayerIds.map(Number),
    sharedAt: row.shared_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Add shared_at column if it doesn't exist (safe one-time migration)
pool.query("ALTER TABLE ai_uploaded_clips ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ").catch(() => {});

function toClipJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    clipId: row.clip_id,
    externalJobId: row.external_job_id,
    jobType: row.job_type,
    status: row.status,
    currentStep: row.current_step,
    aiServiceUrl: row.ai_service_url,
    inputVideoPath: row.input_video_path,
    homographyPath: row.homography_path,
    courtSurfacesPath: row.court_surfaces_path,
    ballTracksPath: row.ball_tracks_path,
    playerTracksPath: row.player_tracks_path,
    scoringOutDir: row.scoring_out_dir,
    renderedVideoPath: row.rendered_video_path,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createAiUploadedClip({
  matchId = null,
  externalMatchKey = null,
  playerUserId,
  uploadedByUserId,
  cameraId = "camera_01",
  sportType = "padel",
  originalFilename,
  storedVideoPath,
  durationSec = null,
  fps = null,
  frameCount = null,
  width = null,
  height = null,
  status = "awaiting_court_annotation",
  courtId = null,
  assignedPlayerIds = [],
}) {
  const result = await pool.query(
    `INSERT INTO ai_uploaded_clips (
       match_id, external_match_key, player_user_id, uploaded_by_user_id, camera_id, sport_type,
       original_filename, stored_video_path, duration_sec, fps, frame_count, width, height, status,
       court_id, assigned_player_ids
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      nullableNumber(matchId),
      externalMatchKey,
      nullableNumber(playerUserId),
      nullableNumber(uploadedByUserId),
      cameraId,
      sportType,
      originalFilename,
      storedVideoPath,
      nullableNumber(durationSec),
      nullableNumber(fps),
      nullableNumber(frameCount),
      nullableNumber(width),
      nullableNumber(height),
      status,
      nullableNumber(courtId),
      JSON.stringify(Array.isArray(assignedPlayerIds) ? assignedPlayerIds.map(Number) : []),
    ]
  );
  return toClip(result.rows[0]);
}

export async function updateAiUploadedClipStatus(clipId, status) {
  const result = await pool.query(
    "UPDATE ai_uploaded_clips SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *",
    [nullableNumber(clipId), status]
  );
  return toClip(result.rows[0]);
}

export async function updateAiUploadedClipStorage(clipId, storedVideoPath) {
  const result = await pool.query(
    "UPDATE ai_uploaded_clips SET stored_video_path = $2, updated_at = NOW() WHERE id = $1 RETURNING *",
    [nullableNumber(clipId), storedVideoPath]
  );
  return toClip(result.rows[0]);
}

export async function listAiUploadedClips({ matchId = null, playerUserId = null, status = null } = {}) {
  const where = [];
  const params = [];
  if (matchId) {
    params.push(nullableNumber(matchId));
    where.push(`c.match_id = $${params.length}`);
  }
  if (playerUserId) {
    params.push(nullableNumber(playerUserId));
    where.push(`c.player_user_id = $${params.length}`);
  }
  if (status) {
    params.push(String(status));
    where.push(`c.status = $${params.length}`);
  }
  where.push("c.deleted_at IS NULL");
  const result = await pool.query(
    `SELECT c.*
     FROM ai_uploaded_clips c
     WHERE ${where.join(" AND ")}
     ORDER BY c.created_at DESC
     LIMIT 100`,
    params
  );
  return result.rows.map(toClip);
}

export async function getAiClipDetails(clipId) {
  const clipResult = await pool.query("SELECT * FROM ai_uploaded_clips WHERE id = $1", [nullableNumber(clipId)]);
  const clip = toClip(clipResult.rows[0]);
  if (!clip) return null;
  const jobResult = await pool.query(
    "SELECT * FROM ai_clip_jobs WHERE clip_id = $1 ORDER BY created_at DESC LIMIT 1",
    [clip.id]
  );
  const eventsResult = await pool.query(
    `SELECT id, frame, time_sec, event_type, winner_side, confidence, reason, raw, created_at
     FROM ai_clip_events
     WHERE clip_id = $1
     ORDER BY frame ASC`,
    [clip.id]
  );
  return {
    clip,
    job: toClipJob(jobResult.rows[0]),
    events: eventsResult.rows.map((row) => ({
      id: row.id,
      frame: row.frame,
      time_sec: row.time_sec === null ? null : Number(row.time_sec),
      event_type: row.event_type,
      winner_side: row.winner_side,
      confidence: row.confidence === null ? null : Number(row.confidence),
      reason: row.reason,
      raw: row.raw,
      created_at: row.created_at,
    })),
  };
}

export async function createOrUpdateAiClipJob({
  clipId,
  externalJobId = null,
  jobType = "clip_full_pipeline",
  status = "uploaded",
  currentStep = "upload",
  aiServiceUrl = null,
  inputVideoPath = null,
  homographyPath = null,
  courtSurfacesPath = null,
  ballTracksPath = null,
  playerTracksPath = null,
  scoringOutDir = null,
  renderedVideoPath = null,
  errorMessage = null,
  startedAt = null,
  finishedAt = null,
}) {
  const existing = externalJobId
    ? await pool.query("SELECT id FROM ai_clip_jobs WHERE external_job_id = $1", [externalJobId])
    : await pool.query("SELECT id FROM ai_clip_jobs WHERE clip_id = $1 ORDER BY created_at DESC LIMIT 1", [nullableNumber(clipId)]);

  if (existing.rows[0]?.id) {
    const result = await pool.query(
      `UPDATE ai_clip_jobs
       SET external_job_id = COALESCE($2, external_job_id),
           job_type = COALESCE($3, job_type),
           status = COALESCE($4, status),
           current_step = COALESCE($5, current_step),
           ai_service_url = COALESCE($6, ai_service_url),
           input_video_path = COALESCE($7, input_video_path),
           homography_path = COALESCE($8, homography_path),
           court_surfaces_path = COALESCE($9, court_surfaces_path),
           ball_tracks_path = COALESCE($10, ball_tracks_path),
           player_tracks_path = COALESCE($11, player_tracks_path),
           scoring_out_dir = COALESCE($12, scoring_out_dir),
           rendered_video_path = COALESCE($13, rendered_video_path),
           error_message = $14,
           started_at = COALESCE($15, started_at),
           finished_at = COALESCE($16, finished_at),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        existing.rows[0].id,
        externalJobId,
        jobType,
        status,
        currentStep,
        aiServiceUrl,
        inputVideoPath,
        homographyPath,
        courtSurfacesPath,
        ballTracksPath,
        playerTracksPath,
        scoringOutDir,
        renderedVideoPath,
        errorMessage,
        nullableDate(startedAt),
        nullableDate(finishedAt),
      ]
    );
    return toClipJob(result.rows[0]);
  }

  const result = await pool.query(
    `INSERT INTO ai_clip_jobs (
       clip_id, external_job_id, job_type, status, current_step, ai_service_url,
       input_video_path, homography_path, court_surfaces_path, ball_tracks_path,
       player_tracks_path, scoring_out_dir, rendered_video_path, error_message,
       started_at, finished_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      nullableNumber(clipId),
      externalJobId,
      jobType,
      status,
      currentStep,
      aiServiceUrl,
      inputVideoPath,
      homographyPath,
      courtSurfacesPath,
      ballTracksPath,
      playerTracksPath,
      scoringOutDir,
      renderedVideoPath,
      errorMessage,
      nullableDate(startedAt),
      nullableDate(finishedAt),
    ]
  );
  return toClipJob(result.rows[0]);
}

export async function saveAiClipEvents({ clipId, externalJobId = null, events = [] }) {
  const details = await getAiClipDetails(clipId);
  if (!details?.clip) return { saved: 0 };
  const job = details.job;
  await pool.query("DELETE FROM ai_clip_events WHERE clip_id = $1", [details.clip.id]);
  if (!Array.isArray(events) || events.length === 0) return { saved: 0 };

  let saved = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const event of events) {
      const frame = nullableNumber(event?.frame);
      const eventType = event?.event_type ? String(event.event_type) : null;
      if (frame === null || !eventType) continue;
      await client.query(
        `INSERT INTO ai_clip_events (
           clip_id, job_id, frame, time_sec, event_type, winner_side,
           confidence, reason, raw
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          details.clip.id,
          job?.id ?? null,
          frame,
          nullableNumber(event?.time_sec),
          eventType,
          event?.winner_side ? String(event.winner_side) : null,
          nullableNumber(event?.confidence),
          event?.reason ? String(event.reason) : null,
          { ...event, external_job_id: externalJobId },
        ]
      );
      saved += 1;
    }
    await client.query("COMMIT");
    return { saved };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** List analysis jobs for a user */
export async function listAnalysisJobs(userId, limit = 20) {
  const result = await pool.query(
    `SELECT sj.*,
            CONCAT(p1.first_name, ' ', p1.last_name) AS player1_name,
            CONCAT(p2.first_name, ' ', p2.last_name) AS player2_name,
            m.scheduled_at AS match_date,
            u.first_name AS requested_by_first, u.last_name AS requested_by_last
     FROM smartplay_analysis_jobs sj
     LEFT JOIN matches m ON m.id = sj.match_id
     LEFT JOIN users p1 ON p1.id = COALESCE(m.player1_id, m.team1_player1_id)
     LEFT JOIN users p2 ON p2.id = COALESCE(m.player2_id, m.team2_player1_id)
     LEFT JOIN users u ON u.id = sj.requested_by_user_id
     WHERE sj.user_id = $1
     ORDER BY sj.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

/** Get match analysis (real if available, placeholder if not) */
export async function getMatchAnalysis(matchId) {
  const result = await pool.query(
    "SELECT * FROM match_analysis WHERE match_id = $1",
    [matchId]
  );
  if (result.rows.length) {
    const row = result.rows[0];
    return {
      available: true,
      source: "database",
      data: {
        ...row,
        heatmap_data: row.heatmap_data ?? null,
        raw_analysis: row.raw_analysis ?? null,
      },
    };
  }

  return {
    available: false,
    source: "placeholder",
    message: "AI analysis for this match is not yet available. SmartPlay AI will generate detailed metrics once processing is complete.",
    // TODO: Call AI microservice here when ready
    placeholder: {
      rally_count: null,
      avg_rally_length: null,
      court_coverage: null,
      heatmap: null,
      ball_speed: null,
    },
  };
}

/** Get player AI analysis data */
export async function getPlayerAiMetrics(userId, matchId = null) {
  const params = [userId];
  let query = "SELECT * FROM player_analysis WHERE user_id = $1";
  if (matchId) {
    params.push(matchId);
    query += ` AND match_id = $${params.length}`;
  }
  query += " ORDER BY created_at DESC LIMIT 5";

  const result = await pool.query(query, params);

  if (result.rows.length) {
    return {
      available: true,
      source: "database",
      metrics: result.rows.map((row) => ({
        ...row,
        heatmap_json: row.heatmap_json ?? null,
        raw_metrics: row.raw_metrics ?? null,
      })),
    };
  }

  return {
    available: false,
    source: "placeholder",
    message: "AI performance metrics will appear here once SmartPlay AI processes your matches.",
    // TODO: Request analysis from AI microservice here
    placeholder: {
      movement_coverage: null,
      reaction_speed_ms: null,
      shot_accuracy: null,
      winners: null,
      errors: null,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Share clip with assigned players (create in-app notifications)
// ─────────────────────────────────────────────────────────────────────────────

export async function shareClipWithPlayers(clipId, sharedByUserId, { createNotification }) {
  const clipResult = await pool.query("SELECT * FROM ai_uploaded_clips WHERE id = $1", [nullableNumber(clipId)]);
  const clip = toClip(clipResult.rows[0]);
  if (!clip) throw new Error("Clip not found");
  if (!clip.assignedPlayerIds.length) throw new Error("No players assigned to this clip");

  // Load court info
  let courtName = "the court";
  if (clip.courtId) {
    const courtResult = await pool.query("SELECT name FROM courts WHERE id = $1", [clip.courtId]);
    if (courtResult.rows[0]) courtName = courtResult.rows[0].name;
  }

  // Load match date via reservation if match_id is set
  let playedDate = null;
  let playedTime = null;
  if (clip.matchId) {
    const matchResult = await pool.query(
      `SELECT r.reservation_date, r.start_time
       FROM matches m
       JOIN reservations r ON r.id = m.reservation_id
       WHERE m.id = $1`,
      [clip.matchId]
    );
    if (matchResult.rows[0]) {
      playedDate = matchResult.rows[0].reservation_date;
      playedTime = String(matchResult.rows[0].start_time).slice(0, 5);
    }
  }
  // Fall back to clip creation date
  if (!playedDate) {
    const d = new Date(clip.createdAt);
    playedDate = d.toISOString().slice(0, 10);
    playedTime = d.toISOString().slice(11, 16);
  }

  const dateStr = new Date(playedDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const body = `Your match on ${dateStr} at ${playedTime} on ${courtName} has been analyzed. Watch your SmartPlay performance video now!`;

  for (const userId of clip.assignedPlayerIds) {
    await createNotification({
      userId,
      title: "Your SmartPlay analysis is ready!",
      body,
      type: "smartplay",
      linkUrl: `/performance?tab=smartplay`,
    });
  }

  // Mark clip as shared
  await pool.query(
    "UPDATE ai_uploaded_clips SET shared_at = NOW(), updated_at = NOW() WHERE id = $1",
    [nullableNumber(clipId)]
  );

  return { shared: clip.assignedPlayerIds.length, courtName, playedDate, playedTime };
}

// ─────────────────────────────────────────────────────────────────────────────
// Player-facing: clips assigned to a specific user
// ─────────────────────────────────────────────────────────────────────────────

export async function listMySmartPlayClips(userId) {
  const result = await pool.query(
    `SELECT c.*,
            crt.name AS court_name,
            r.reservation_date AS played_date,
            r.start_time AS played_time,
            j.status AS job_status,
            j.rendered_video_path,
            j.error_message
     FROM ai_uploaded_clips c
     LEFT JOIN courts crt ON crt.id = c.court_id
     LEFT JOIN matches m ON m.id = c.match_id
     LEFT JOIN reservations r ON r.id = m.reservation_id
     LEFT JOIN LATERAL (
       SELECT status, rendered_video_path, error_message
       FROM ai_clip_jobs
       WHERE clip_id = c.id
       ORDER BY created_at DESC LIMIT 1
     ) j ON TRUE
     WHERE c.deleted_at IS NULL
       AND c.status = 'done'
       AND c.shared_at IS NOT NULL
       AND (c.player_user_id = $1 OR c.assigned_player_ids::jsonb @> to_jsonb($1::int))
     ORDER BY c.shared_at DESC
     LIMIT 50`,
    [Number(userId)]
  );
  return result.rows.map((row) => ({
    ...toClip(row),
    courtName: row.court_name ?? null,
    playedDate: row.played_date ?? null,
    playedTime: row.played_time ? String(row.played_time).slice(0, 5) : null,
    jobStatus: row.job_status ?? null,
    renderedVideoPath: row.rendered_video_path ?? null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Clip soft-delete
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteAiUploadedClip(clipId) {
  await pool.query(
    "UPDATE ai_uploaded_clips SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1",
    [nullableNumber(clipId)]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Court Calibrations
// ─────────────────────────────────────────────────────────────────────────────

export async function listCourtsWithCalibrations(arenaId) {
  if (arenaId) {
    const result = await pool.query(
      `SELECT c.id, c.name, c.sport, c.court_type, c.surface_type, c.is_active,
              a.name AS arena_name, a.location AS arena_location,
              cc.id AS calib_id, cc.status AS calib_status, cc.is_active AS calib_is_active,
              cc.computed_at, cc.updated_at AS calib_updated_at
       FROM courts c
       JOIN arenas a ON a.id = c.arena_id
       LEFT JOIN court_calibrations cc ON cc.court_id = c.id AND cc.is_active = TRUE
       WHERE c.arena_id = $1 AND c.is_active = TRUE
       ORDER BY c.name`,
      [nullableNumber(arenaId)]
    );
    return result.rows;
  }
  // Super admin: return all courts across all arenas
  const result = await pool.query(
    `SELECT c.id, c.name, c.sport, c.court_type, c.surface_type, c.is_active,
            a.name AS arena_name,
            cc.id AS calib_id, cc.status AS calib_status, cc.is_active AS calib_is_active,
            cc.computed_at, cc.updated_at AS calib_updated_at
     FROM courts c
     JOIN arenas a ON a.id = c.arena_id
     LEFT JOIN court_calibrations cc ON cc.court_id = c.id AND cc.is_active = TRUE
     WHERE c.is_active = TRUE
     ORDER BY a.name, c.name`
  );
  return result.rows;
}

export async function listCourtCalibrations(courtId) {
  const result = await pool.query(
    `SELECT id, court_id, sport_type, calibration_image_path,
            jsonb_array_length(image_points) AS point_count,
            homography_matrix IS NOT NULL AS has_homography,
            status, is_active, version, computed_at, created_at, updated_at
     FROM court_calibrations
     WHERE court_id = $1
     ORDER BY created_at DESC`,
    [nullableNumber(courtId)]
  );
  return result.rows;
}

export async function getCourtCalibration(calibId) {
  const result = await pool.query(
    "SELECT * FROM court_calibrations WHERE id = $1",
    [nullableNumber(calibId)]
  );
  return result.rows[0] ?? null;
}

export async function getActiveCalibrationForCourt(courtId) {
  // Prefer is_active=true; fall back to any calibration with a computed homography_matrix
  const result = await pool.query(
    `SELECT * FROM court_calibrations
     WHERE court_id = $1 AND homography_matrix IS NOT NULL
     ORDER BY is_active DESC, computed_at DESC
     LIMIT 1`,
    [nullableNumber(courtId)]
  );
  return result.rows[0] ?? null;
}

export async function createCourtCalibration({ courtId, arenaId, sportType = "padel", calibrationImagePath = null, createdByUserId = null }) {
  const result = await pool.query(
    `INSERT INTO court_calibrations (court_id, arena_id, sport_type, calibration_image_path, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [nullableNumber(courtId), nullableNumber(arenaId), sportType, calibrationImagePath, nullableNumber(createdByUserId)]
  );
  return result.rows[0];
}

export async function saveCalibrationKeypoints({ calibId, imagePoints, worldPoints, keypointLabels, homographyMatrix = null }) {
  const status = homographyMatrix ? "computed" : "draft";
  const computedAt = homographyMatrix ? new Date().toISOString() : null;
  const result = await pool.query(
    `UPDATE court_calibrations
     SET image_points = $2, world_points = $3, keypoint_labels = $4,
         homography_matrix = $5, status = $6, computed_at = $7, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      nullableNumber(calibId),
      JSON.stringify(imagePoints),
      JSON.stringify(worldPoints),
      JSON.stringify(keypointLabels),
      homographyMatrix ? JSON.stringify(homographyMatrix) : null,
      status,
      computedAt,
    ]
  );
  return result.rows[0];
}

export async function activateCourtCalibration(calibId, courtId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE court_calibrations SET is_active = FALSE, status = 'computed', updated_at = NOW() WHERE court_id = $1",
      [nullableNumber(courtId)]
    );
    const result = await client.query(
      "UPDATE court_calibrations SET is_active = TRUE, status = 'active', updated_at = NOW() WHERE id = $1 RETURNING *",
      [nullableNumber(calibId)]
    );
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteCourtCalibration(calibId) {
  await pool.query("DELETE FROM court_calibrations WHERE id = $1", [nullableNumber(calibId)]);
}

import cors from "cors";
import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { initRedis } from "./redis.mjs";
import { setPool as setPermissionPool } from "./permissions/middleware.mjs";
import { initSocketIO } from "./realtime/socket.mjs";
import {
  requireAuth as _requireAuth,
  optionalAuth as _optionalAuth,
  requireAdmin as _requireAdmin,
  requireCoach as _requireCoach,
} from "./permissions/middleware.mjs";
import { invalidateRoleCache } from "./permissions/resolveRoles.mjs";
import { emitScoresUpdate, emitLiveUpdate, emitLiveStatus, emitBookingUpdate, emitUserNotification } from "./realtime/channels.mjs";
import {
  DB_CLIENT_REQUESTED,
  DB_CLIENT_SELECTED,
  cancelReservation,
  updateReservationRefund,
  closePool,
  createAnalysis,
  createArena,
  createCourt,
  createManagedUser,
  createReservation,
  createUser,
  requestEmailVerification,
  requestPasswordReset,
  resetPasswordWithCode,
  resetPasswordWithToken,
  verifyEmailWithCode,
  verifyEmailWithToken,
  findUserByEmail,
  getUserById,
  getAdminOverview,
  getArenaBillingSummary,
  listBillingPlans,
  changeArenaPlan,
  getCourtAvailability,
  getCourtById,
  getLeaderboard,
  getCompetitionDetails,
  createCompetition,
  updateCompetition,
  deleteCompetition,
  listCompetitionRegistrations,
  removeCompetitionRegistration,
  getReservationTicketDetails,
  getReservationTicketDetailsByQr,
  verifyReservationTicketSignature,
  generateReservationTicketPdfBuffer,
  getCoachStudentStats,
  listCoachRelationshipsForUser,
  listCoachesForPlayer,
  listCoachRelationshipExpiryReminders,
  listNotificationsForUser,
  getPerformanceForUser,
  initializeDatabase,
  listAnalysesForUser,
  listArenas,
  listCoachSessions,
  listCoachStudents,
  listCompetitions,
  listCourts,
  listAdminReservations,
  listMatches,
  listReservationsForUser,
  getReservationForUser,
  lookupParticipantsForArena,
  registerForCompetition,
  requestCoachRelationship,
  respondCoachRelationship,
  sanitizeUser,
  updateUserProfile,
  persistRefreshToken,
  consumeRefreshToken,
  revokeRefreshTokensForUser,
  tickLiveMatches,
  upsertArenaSubscriptionFromProvider,
  updateAdminReservationStatus,
  updateMembershipRole,
  updateMembershipStatus,
  deleteUser,
  getPlayerDashboardData,
  listPlayerMatches,
  finalizeMatch,
  createCoachSession,
  createOrUpdateCoachRelationshipSeed,
  createNotification,
  markNotificationRead,
  updateCoachRelationshipSettings,
  listPadelPlaces,
  getPadelPlace,
  listPadelTerrains,
  getPadelTerrain,
  getPadelAvailability,
  createPadelReservation,
  getCoachProfile,
  upsertCoachProfile,
  updateCoachAvatar,
  listArenasForCoachBooking,
  listCoachProfiles,
  getCoachPublicProfile,
  getCoachAvailability,
  setCoachAvailabilityRules,
  addCoachAvailabilityException,
  getCoachAvailableSlots,
  createCoachingRequest,
  respondToCoachingRequest,
  listCoachingRequestsForCoach,
  listCoachingRequestsForPlayer,
  listCoachingSessionsForUser,
  listAdminCoaches,
  assignCoachToArena,
} from "./arena-db.mjs";
import {
  isMailerConfigured,
  sendPasswordResetCodeEmail,
  sendPasswordResetEmail,
  sendVerificationCodeEmail,
  sendVerificationEmail,
} from "./mailer.mjs";
import {
  getMatchScore,
  updateMatchScore,
  getScoreEvents,
  createScoreEvent,
  getScoreCorrectionLogs,
  listScoringMatches,
  getRecentScoreActivity,
} from "./scoring.mjs";
import {
  getPlayerStats,
  getPlayerMatchHistory,
  getPlayerReservationHistory,
  getPlayerCompetitionHistory,
  getPlayerAiAnalysis,
  getPlatformStats,
  getRevenueSummary,
} from "./analytics.mjs";
import {
  getSmartPlayStatus,
  createAiAnalysisJobRecord,
  createAiUploadedClip,
  createOrUpdateAiClipJob,
  createAnalysisJob,
  getAiClipDetails,
  getAiAnalysisJobByExternalJobId,
  getLatestAiAnalysisJobForMatch,
  listAiUploadedClips,
  listAnalysisJobs,
  listAiScoringEventsForMatch,
  getMatchAnalysis,
  getPlayerAiMetrics,
  saveAiClipEvents,
  saveAiScoringEventsForJob,
  updateAiUploadedClipStorage,
  updateAiUploadedClipStatus,
  updateAiAnalysisJobFromService,
  deleteAiUploadedClip,
  shareClipWithPlayers,
  listMySmartPlayClips,
  listCourtsWithCalibrations,
  listCourtCalibrations,
  getCourtCalibration,
  getActiveCalibrationForCourt,
  createCourtCalibration,
  saveCalibrationKeypoints,
  activateCourtCalibration,
  deleteCourtCalibration,
} from "./smartplay.mjs";
import {
  canManageLiveSession,
  canViewLiveSession,
  createCourtCamera,
  createLiveSession,
  createSystemLiveSessionForReservation,
  deleteLiveSession,
  getActiveCourtCamera,
  getCourtLiveCalibration,
  getLatestLiveUpdate,
  getLiveSessionById,
  listCourtCameras,
  listLiveSessions,
  listLiveSessionsNeedingStop,
  listReservationLivePlayers,
  listReservationsNeedingLiveStart,
  patchLiveSession,
  recordLiveUpdate,
  saveCourtLiveCalibration,
  updateLiveSessionStatus,
} from "./live-sessions.mjs";

const app = express();
const httpServer = createServer(app);
let io = null;

const PORT = Number(process.env.PORT ?? 4001);
const JWT_SECRET = process.env.JWT_SECRET ?? "ultima-demo-secret";
const WEBHOOK_SECRET = process.env.BILLING_WEBHOOK_SECRET ?? "";
const WEBHOOK_SIGNATURE_SECRET = process.env.BILLING_WEBHOOK_SIGNATURE_SECRET ?? process.env.BILLING_SIGNATURE_SECRET ?? JWT_SECRET;
const ENABLE_TEST_SEED = process.env.ENABLE_TEST_SEED === "1";
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 14);
const MAX_VIDEO_UPLOAD_MB = Number(process.env.MAX_VIDEO_UPLOAD_MB ?? 2048);
const SMARTPLAY_CLIP_UPLOAD_MB = Number(process.env.SMARTPLAY_CLIP_UPLOAD_MB ?? 12288);
const LONG_UPLOAD_REQUEST_TIMEOUT_MS = Number(process.env.LONG_UPLOAD_REQUEST_TIMEOUT_MS ?? 3 * 60 * 60 * 1000);
const SMARTPLAY_GENERATE_BROWSER_PREVIEW = process.env.SMARTPLAY_GENERATE_BROWSER_PREVIEW !== "0";
const FFMPEG_PATH = String(process.env.FFMPEG_PATH ?? "ffmpeg").trim() || "ffmpeg";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CIN_REGEX = /^\d{8}$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const PUBLIC_WEB_BASE_URL = String(process.env.PUBLIC_WEB_BASE_URL ?? "").trim();
const LAN_IP = (() => {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
})();
// Public base URL for QR codes — set PUBLIC_SERVER_URL in .env when using a tunnel (ngrok/cloudflared)
const PUBLIC_APP_URL = String(process.env.PUBLIC_APP_URL ?? process.env.PUBLIC_SERVER_URL ?? "").trim().replace(/\/+$/, "");
const PUBLIC_SERVER_URL = PUBLIC_APP_URL || `http://${LAN_IP}:${PORT}`;
const SMARTPLAY_CALLBACK_BASE_URL = String(process.env.SMARTPLAY_CALLBACK_BASE_URL ?? process.env.API_URL ?? PUBLIC_SERVER_URL).trim().replace(/\/+$/, "");
httpServer.requestTimeout = LONG_UPLOAD_REQUEST_TIMEOUT_MS;
httpServer.timeout = LONG_UPLOAD_REQUEST_TIMEOUT_MS;
httpServer.headersTimeout = Math.max(120000, Math.min(LONG_UPLOAD_REQUEST_TIMEOUT_MS, 10 * 60 * 1000));

const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
const SMARTPLAY_AI_URL = String(process.env.SMARTPLAY_AI_URL ?? "").trim().replace(/\/+$/, "");
const SMARTPLAY_CALLBACK_SECRET = String(process.env.SMARTPLAY_CALLBACK_SECRET ?? "").trim();
const DEV_ENABLE_MOCK_LIVE = process.env.DEV_ENABLE_MOCK_LIVE === "1";
const SMARTPLAY_PROXY_TIMEOUT_MS = Number(process.env.SMARTPLAY_PROXY_TIMEOUT_MS ?? 120000);
const SMARTPLAY_V1_MATCH_CONFIG = {
  match_0004_padel: {
    match_id: "match_0004_padel",
    camera_id: "camera_01",
    ball_tracks: "data/processed/ball_yolo/match_0004_padel/camera_01_full_norender/ball_track.parquet",
    player_tracks: "data/processed/match_0004_padel/players_tracks_bytetrack_full/camera_01_tracks.parquet",
    out_dir: "data/processed/final_all_in_one/match_0004_padel_full_scoring_v2/camera_01",
    input_video_path: "data/processed/matches/match_0004_padel/cameras/camera_01_main.mp4",
    debug_video_path: "data/processed/final_all_in_one/match_0004_padel_full_scoring_v2/camera_01/scoring_v2_debug_full_with_frame_counter.mp4",
    max_frames: 45934,
  },
};
// TND is not a native Stripe currency — convert to EUR (approx 1 TND = 0.30 EUR)
const TND_TO_EUR_RATE = 0.30;
const uploadsDir = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
const liveMockTimers = new Map();
const fileDemoProcesses = new Map(); // sessionId → ChildProcess
let _fastApiProcess = null;

async function tryStartFastApiService() {
  if (!SMARTPLAY_AI_URL) return false;
  // Check already running
  try {
    const r = await fetch(`${SMARTPLAY_AI_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) { console.log("[smartplay-ai] FastAPI already running."); return true; }
  } catch {}

  const pythonExec = process.env.PYTHON_EXECUTABLE;
  if (!pythonExec || !fs.existsSync(pythonExec)) {
    console.warn("[smartplay-ai] PYTHON_EXECUTABLE not set or not found — cannot auto-start FastAPI.");
    return false;
  }
  const scriptPath = process.env.SMARTPLAY_PIPELINE_SCRIPT;
  if (!scriptPath) { console.warn("[smartplay-ai] SMARTPLAY_PIPELINE_SCRIPT not set — cannot locate smartplay root."); return false; }
  const smartplayRoot = path.resolve(path.dirname(scriptPath), "..", "..");
  const aiEnvPath = path.join(smartplayRoot, ".env");

  // Parse smartplay_ai/.env so FastAPI gets its own config
  const extraEnv = {};
  if (fs.existsSync(aiEnvPath)) {
    for (const line of fs.readFileSync(aiEnvPath, "utf-8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)/);
      if (m) extraEnv[m[1]] = m[2].replace(/^['"]|['"]$/g, "").trim();
    }
  }

  console.log(`[smartplay-ai] Starting FastAPI service (cwd: ${smartplayRoot})…`);
  const child = spawn(pythonExec, ["-m", "uvicorn", "ai_service.main:app", "--host", "127.0.0.1", "--port", "8000"], {
    cwd: smartplayRoot,
    detached: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...extraEnv, PYTHONPATH: smartplayRoot },
  });
  _fastApiProcess = child;
  child.stdout?.on("data", (d) => {
    const t = d.toString().trimEnd();
    if (t) console.log(`[smartplay-ai] ${t}`);
  });
  child.stderr?.on("data", (d) => {
    const t = d.toString().trimEnd();
    if (t) console.error(`[smartplay-ai] ${t}`);
  });
  child.on("exit", (code) => {
    console.log(`[smartplay-ai] FastAPI process exited (code ${code})`);
    _fastApiProcess = null;
  });

  // Poll until ready (up to 90s — model loading takes time)
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const r = await fetch(`${SMARTPLAY_AI_URL}/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) { console.log(`[smartplay-ai] FastAPI ready after ${i + 1}s.`); return true; }
    } catch {}
  }
  console.warn("[smartplay-ai] FastAPI did not become ready within 90 seconds.");
  return false;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const safeName = String(file.originalname ?? "upload.mp4").replace(/[^a-zA-Z0-9._-]/g, "-");
      cb(null, `${Date.now()}-${randomUUID()}-${safeName}`);
    },
  }),
  limits: {
    fileSize: MAX_VIDEO_UPLOAD_MB * 1024 * 1024,
  },
});

const uploadImage = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const safeName = String(file.originalname ?? "image.jpg").replace(/[^a-zA-Z0-9._-]/g, "-");
      cb(null, `${Date.now()}-${randomUUID()}-${safeName}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB cap for images
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "Only JPEG, PNG, WebP and GIF images are allowed"));
    }
  },
});

function getPublicWebBaseUrl(req) {
  if (PUBLIC_WEB_BASE_URL) {
    return PUBLIC_WEB_BASE_URL.replace(/\/+$/, "");
  }
  const origin = String(req.headers.origin ?? "").trim();
  if (origin) return origin.replace(/\/+$/, "");
  const host = req.headers.host ?? "localhost:5173";
  return `http://${host}`;
}

function isLocalRequest(req) {
  const host = String(req.hostname ?? "");
  const origin = String(req.headers.origin ?? "");
  return host.includes("localhost") || host.includes("127.0.0.1") || origin.includes("localhost") || origin.includes("127.0.0.1");
}

await initializeDatabase();

// Wire Redis, permission pool, and Socket.IO after DB is ready
{
  const { default: pgPool } = await import("./pg-pool.mjs");
  setPermissionPool(pgPool);        // inject pool into permission middleware
  initRedis();                       // connect Redis (no-op if REDIS_URL not set)
  io = initSocketIO(httpServer, pgPool);

  // Auto-migrate: arena extra fields (idempotent — safe to run on every start)
  await pgPool.query(`
    ALTER TABLE arenas
      ADD COLUMN IF NOT EXISTS image_url   TEXT,
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS phone       VARCHAR(50),
      ADD COLUMN IF NOT EXISTS website     TEXT,
      ADD COLUMN IF NOT EXISTS soft_deleted BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ
  `).then(() => console.log("[migration] arenas extra fields: ok"))
    .catch(err => console.warn("[migration] arenas extra fields:", err.message));

  // Auto-migrate: courts soft-delete columns
  await pgPool.query(`
    ALTER TABLE courts
      ADD COLUMN IF NOT EXISTS soft_deleted BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ
  `).then(() => console.log("[migration] courts soft-delete: ok"))
    .catch(err => console.warn("[migration] courts soft-delete:", err.message));

  // Auto-migrate: court_blocks table (admin-managed unavailability blocks)
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS court_blocks (
      id          SERIAL PRIMARY KEY,
      court_id    INTEGER NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
      block_date  DATE    NOT NULL,
      start_time  TIME    NOT NULL,
      end_time    TIME    NOT NULL,
      reason      TEXT,
      created_by  INTEGER REFERENCES users(id),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).then(() => console.log("[migration] court_blocks: ok"))
    .catch(err => console.warn("[migration] court_blocks:", err.message));
}

async function ensureTestAccount({
  firstName,
  lastName,
  email,
  password,
  arenaId,
  membershipRole,
}) {
  const existing = await findUserByEmail(email);
  if (existing) {
    return existing;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  return createUser({
    firstName,
    lastName,
    email,
    passwordHash,
    arenaId,
    membershipRole,
  });
}

async function ensureUltimaArenaTestSetup() {
  const arenas = await listArenas();
  let arena = arenas.find((item) => item.name === "ULTIMA Arena Test Lab");
  if (!arena) {
    arena = await createArena({
      name: "ULTIMA Arena Test Lab",
      location: "Demo City",
    });
  }

  const defaultPassword = process.env.ULTIMA_TEST_PASSWORD ?? "Ultima123!";
  const admin = await ensureTestAccount({
    firstName: "Arena",
    lastName: "Admin",
    email: "admin@ultima-arena.test",
    password: defaultPassword,
    arenaId: arena.id,
    membershipRole: "admin",
  });
  const coach = await ensureTestAccount({
    firstName: "Ryad",
    lastName: "Coach",
    email: "coach@ultima-arena.test",
    password: defaultPassword,
    arenaId: arena.id,
    membershipRole: "coach",
  });
  const playerA = await ensureTestAccount({
    firstName: "Nour",
    lastName: "Player",
    email: "player1@ultima-arena.test",
    password: defaultPassword,
    arenaId: arena.id,
    membershipRole: "player",
  });
  const playerB = await ensureTestAccount({
    firstName: "Ines",
    lastName: "Player",
    email: "player2@ultima-arena.test",
    password: defaultPassword,
    arenaId: arena.id,
    membershipRole: "player",
  });

  const today = new Date();
  const inFiveDays = new Date(today);
  inFiveDays.setDate(today.getDate() + 5);
  const isoToday = today.toISOString().split("T")[0];
  const isoInFiveDays = inFiveDays.toISOString().split("T")[0];

  await createOrUpdateCoachRelationshipSeed({
    coachUserId: coach.id,
    playerUserId: playerA.id,
    status: "active",
    requestedByUserId: playerA.id,
    startDate: isoToday,
    endDate: isoInFiveDays,
    notes: "Active test link (expires soon for reminder testing)",
  });

  await createOrUpdateCoachRelationshipSeed({
    coachUserId: coach.id,
    playerUserId: playerB.id,
    status: "pending",
    requestedByUserId: playerB.id,
    startDate: isoToday,
    notes: "Pending test request",
  });

  return { arena, admin, coach, playerA, playerB, password: defaultPassword };
}

const testSetup = ENABLE_TEST_SEED ? await ensureUltimaArenaTestSetup() : null;

app.use(cors());
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use("/uploads", express.static(uploadsDir));

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    smartplayClipApiVersion: 3,
    db: {
      requested: DB_CLIENT_REQUESTED,
      selected: DB_CLIENT_SELECTED,
    },
  });
});

function parseReservationDateTime(reservationDate, time) {
  if (
    typeof reservationDate !== "string" ||
    typeof time !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(reservationDate) ||
    !/^\d{2}:\d{2}$/.test(time)
  ) {
    return null;
  }

  const value = new Date(`${reservationDate}T${time}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function createToken(user) {
  const sanitized = sanitizeUser(user);
  return jwt.sign(
    { sub: sanitized.id, email: sanitized.email },  // role removed from JWT payload
    JWT_SECRET,
    { expiresIn: "8h" }
  );
}

async function issueSession(user) {
  const token = createToken(user);
  const refreshToken = randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await persistRefreshToken(user.id, refreshToken, expiresAt);
  return { token, refreshToken, user: sanitizeUser(user) };
}

const requireAuth  = _requireAuth;
const requireAdmin = _requireAdmin;
const requireCoach = _requireCoach;

async function attachActor(req) {
  const userId = req.userId ?? req.user?.id ?? Number(req.user?.sub);
  if (!userId) return null;
  return getUserById(userId);
}

const optionalAuth = _optionalAuth;

function requireAuthUnlessLocal(req, res, next) {
  if (isLocalRequest(req)) {
    return optionalAuth(req, res, next);
  }
  return requireAuth(req, res, next);
}

function getSmartPlayMatchConfig(matchId) {
  return SMARTPLAY_V1_MATCH_CONFIG[String(matchId ?? "").trim()] ?? null;
}

function sendSmartPlayNotConfigured(res) {
  return res.status(503).json({
    message: "SmartPlay AI service is not configured. Set SMARTPLAY_AI_URL to enable this endpoint.",
  });
}

function smartPlayPath(pathname) {
  return `${SMARTPLAY_AI_URL}${pathname}`;
}

async function fetchSmartPlay(pathname, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SMARTPLAY_PROXY_TIMEOUT_MS);
  try {
    return await fetch(smartPlayPath(pathname), {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readSmartPlayResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (!text) {
    return null;
  }
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }
  return { message: text };
}

function sendSmartPlayFetchError(res, error) {
  const isTimeout = error?.name === "AbortError";
  return res.status(isTimeout ? 504 : 502).json({
    message: isTimeout
      ? "SmartPlay AI service timed out."
      : "SmartPlay AI service is unavailable.",
    detail: error instanceof Error ? error.message : String(error),
  });
}

async function proxySmartPlayJson(res, pathname, options = {}) {
  if (!SMARTPLAY_AI_URL) {
    return sendSmartPlayNotConfigured(res);
  }

  try {
    const response = await fetchSmartPlay(pathname, options);
    const body = await readSmartPlayResponse(response);
    return res.status(response.status).json(body ?? {});
  } catch (error) {
    return sendSmartPlayFetchError(res, error);
  }
}

async function callSmartPlayJson(pathname, options = {}) {
  const response = await fetchSmartPlay(pathname, options);
  const body = await readSmartPlayResponse(response);
  return { response, body };
}

function liveRoom(sessionId) {
  return `live-session:${Number(sessionId)}`;
}

function requireSmartPlayCallback(req, res, next) {
  if (!SMARTPLAY_CALLBACK_SECRET) {
    return res.status(503).json({ message: "SMARTPLAY_CALLBACK_SECRET is not configured." });
  }
  const provided = String(req.headers["x-smartplay-callback-secret"] ?? req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "");
  if (provided !== SMARTPLAY_CALLBACK_SECRET) {
    return res.status(401).json({ message: "Invalid SmartPlay callback secret." });
  }
  return next();
}

function stopMockLiveSession(sessionId) {
  const timer = liveMockTimers.get(Number(sessionId));
  if (timer) {
    clearInterval(timer);
    liveMockTimers.delete(Number(sessionId));
  }
}

function startMockLiveSession(sessionId) {
  stopMockLiveSession(sessionId);
  let frame = 0;
  const startedAt = Date.now();
  const timer = setInterval(() => {
    frame += 3;
    const t = (Date.now() - startedAt) / 1000;
    const ballX = 0.5 + Math.sin(t * 1.7) * 0.36;
    const ballY = 0.5 + Math.cos(t * 1.3) * 0.28;
    const players = [0, 1, 2, 3].map((i) => {
      const angle = t * (0.35 + i * 0.04) + i * Math.PI * 0.5;
      return {
        trackId: `mock-p${i + 1}`,
        label: `P${i + 1}`,
        team: i < 2 ? "A" : "B",
        confidence: 0.91,
        bbox: {
          x: Math.max(0.02, Math.min(0.92, 0.5 + Math.cos(angle) * (0.16 + i * 0.025))),
          y: Math.max(0.04, Math.min(0.88, 0.5 + Math.sin(angle) * (0.22 + i * 0.015))),
          w: 0.055,
          h: 0.14,
        },
        poseStatus: frame % (12 + i) < 8 ? "tracked" : "estimated",
      };
    });
    const payload = {
      sessionId: Number(sessionId),
      frame,
      timestampMs: Date.now(),
      fps: 30,
      status: "running",
      source: "mock",
      players,
      ball: {
        x: Math.max(0.03, Math.min(0.97, ballX)),
        y: Math.max(0.04, Math.min(0.96, ballY)),
        confidence: 0.88,
      },
      minimap: {
        players: players.map((player) => ({
          id: player.trackId,
          label: player.label,
          team: player.team,
          x: player.bbox.x + player.bbox.w / 2,
          y: player.bbox.y + player.bbox.h,
        })),
        ball: { x: ballX, y: ballY },
      },
      pose: { status: "tracking", trackedPlayers: players.length },
    };
    if (io) emitLiveUpdate(io, sessionId, payload);
    if (frame % 30 === 0) {
      void recordLiveUpdate({ sessionId, payload }).catch((error) => {
        console.error("[live-mock] failed to persist update:", error);
      });
    }
  }, 100);
  liveMockTimers.set(Number(sessionId), timer);
}

function liveSessionPlayersForAi(session) {
  return (session?.players ?? []).map((player) => ({
    userId: player.userId,
    slot: player.slot,
    team: player.team,
    sideHint: player.sideHint,
    name: player.name,
  }));
}

function inferLiveMode(session) {
  const count = session?.players?.length ?? 0;
  return count <= 2 ? "singles" : "doubles";
}

async function startRealLiveSession(session) {
  if (!SMARTPLAY_AI_URL) {
    const error = new Error("SmartPlay AI service is not configured. Set SMARTPLAY_AI_URL to enable live analysis.");
    error.statusCode = 503;
    throw error;
  }
  let resolvedSession = session;
  const isFileDemoMode = ["file_demo", "local_demo"].includes(String(resolvedSession.mode ?? "").toLowerCase());

  if (!resolvedSession.cameraId || !resolvedSession.cameraUrl) {
    const activeCamera = await getActiveCourtCamera(resolvedSession.courtId);
    if (activeCamera) {
      const { default: pgPool } = await import("./pg-pool.mjs");
      await pgPool.query("UPDATE live_sessions SET camera_id = $1, updated_at = NOW() WHERE id = $2", [activeCamera.id, resolvedSession.id]);
      resolvedSession = await getLiveSessionById(resolvedSession.id);
    } else if (isFileDemoMode && process.env.SMARTPLAY_DEFAULT_FILE_DEMO_SOURCE) {
      // file_demo fallback: use env-var video source when no camera is configured for this court
      resolvedSession = { ...resolvedSession, cameraUrl: process.env.SMARTPLAY_DEFAULT_FILE_DEMO_SOURCE };
    } else {
      const error = new Error("No active live camera is configured for this court. Configure a court camera before starting live analysis.");
      error.statusCode = 400;
      throw error;
    }
  }
  if (!resolvedSession.cameraUrl) {
    if (isFileDemoMode && process.env.SMARTPLAY_DEFAULT_FILE_DEMO_SOURCE) {
      resolvedSession = { ...resolvedSession, cameraUrl: process.env.SMARTPLAY_DEFAULT_FILE_DEMO_SOURCE };
    } else {
      const error = new Error("No camera source configured for this live session.");
      error.statusCode = 400;
      throw error;
    }
  }

  await updateLiveSessionStatus({
    sessionId: resolvedSession.id,
    status: "starting",
    message: "Starting SmartPlay AI live visual analysis.",
  });

  let calibration = await getCourtLiveCalibration(resolvedSession.courtId, resolvedSession.cameraId);
  if (!calibration?.isValidForLive) {
    // file_demo fallback: use env-var homography when no DB calibration exists
    if (isFileDemoMode && process.env.SMARTPLAY_HOMOGRAPHY_JSON) {
      calibration = { isValidForLive: true, homography_json_path: process.env.SMARTPLAY_HOMOGRAPHY_JSON, sport: "padel" };
    } else {
      const error = new Error(
        calibration?.homography_json_path
          ? "Court calibration is not valid for live analysis. Re-annotate or mark the calibration valid."
          : "Court live calibration is missing. Annotate the court first so live analysis can reuse its homography."
      );
      error.statusCode = 400;
      throw error;
    }
  }
  const callbackBaseUrl = `${SMARTPLAY_CALLBACK_BASE_URL}/api/smartplay/live/${resolvedSession.id}`;
  const homographyJsonPath = calibration?.homography_json_path
    ? path.resolve(process.cwd(), calibration.homography_json_path)
    : null;
  const requestPayload = {
    sessionId: resolvedSession.id,
    source: resolvedSession.cameraUrl,
    camera_url: resolvedSession.cameraUrl,
    cameraType: resolvedSession.cameraType ?? "file_demo",
    camera_type: resolvedSession.cameraType ?? "file_demo",
    cameraId: resolvedSession.cameraId,
    courtId: resolvedSession.courtId,
    arenaId: resolvedSession.arenaId,
    reservationId: resolvedSession.reservationId,
    matchId: resolvedSession.matchId,
    competitionId: resolvedSession.competitionId,
    sport: calibration?.sport ?? calibration?.sport_type ?? "padel",
    homographyJson: homographyJsonPath,
    homography_json_path: homographyJsonPath,
    homographyJsonPath,
    callback_url: `${callbackBaseUrl}/update`,
    callbackUrl: `${callbackBaseUrl}/update`,
    callbacks: {
      update: `${callbackBaseUrl}/update`,
      status: `${callbackBaseUrl}/status`,
      error: `${callbackBaseUrl}/error`,
    },
    callbackSecretHeader: "x-smartplay-callback-secret",
    callbackSecret: SMARTPLAY_CALLBACK_SECRET || null,
    players: liveSessionPlayersForAi(resolvedSession),
    mode: inferLiveMode(resolvedSession),
    visual_only: true,
    scoring_enabled: false,
    // TODO: Finalize this contract with smartplay_ai once its live endpoint stabilizes.
  };

  const { response, body } = await callSmartPlayJson("/live/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SMARTPLAY_CALLBACK_SECRET ? { "x-smartplay-callback-secret": SMARTPLAY_CALLBACK_SECRET } : {}),
    },
    body: JSON.stringify(requestPayload),
  });

  if (!response.ok) {
    await updateLiveSessionStatus({
      sessionId: resolvedSession.id,
      status: "error",
      message: body?.message ?? "SmartPlay AI live start failed.",
    });
    const error = new Error(body?.message ?? "SmartPlay AI live start failed.");
    error.statusCode = response.status;
    error.body = body;
    throw error;
  }

  const aiSessionId = body?.ai_session_id ?? body?.aiSessionId ?? body?.session_id ?? null;
  await updateLiveSessionStatus({
    sessionId: resolvedSession.id,
    status: "running",
    message: body?.message ?? "SmartPlay AI live visual analysis running.",
    aiSessionId,
  });
  if (io) emitLiveStatus(io, resolvedSession.id, {
    sessionId: resolvedSession.id,
    status: "running",
    message: "SmartPlay AI live visual analysis running.",
    aiSessionId,
  });
  const updatedSession = await getLiveSessionById(resolvedSession.id);
  return {
    session: {
      ...updatedSession,
      aiSessionId: updatedSession?.aiSessionId ?? aiSessionId,
    },
    ai: body ?? {},
    requestPayload,
  };
}

function stopFileDemoProcess(sessionId) {
  const child = fileDemoProcesses.get(Number(sessionId));
  if (child) {
    try { child.kill("SIGTERM"); } catch { /* already dead */ }
    fileDemoProcesses.delete(Number(sessionId));
  }
}

function startFileDemoProcess(sessionId) {
  const pythonExec = process.env.PYTHON_EXECUTABLE || "python";
  const scriptPath = process.env.SMARTPLAY_PIPELINE_SCRIPT;
  if (!scriptPath) throw Object.assign(new Error("SMARTPLAY_PIPELINE_SCRIPT is not set in .env"), { statusCode: 500 });
  if (!fs.existsSync(scriptPath)) throw Object.assign(new Error(`Pipeline script not found: ${scriptPath}`), { statusCode: 500 });

  const source = process.env.SMARTPLAY_DEFAULT_FILE_DEMO_SOURCE;
  if (!source) throw Object.assign(new Error("SMARTPLAY_DEFAULT_FILE_DEMO_SOURCE is not set in .env"), { statusCode: 500 });
  if (!fs.existsSync(source)) throw Object.assign(new Error(`Source video not found: ${source}`), { statusCode: 400 });

  const homographyJson = process.env.SMARTPLAY_HOMOGRAPHY_JSON;
  if (!homographyJson) throw Object.assign(new Error("SMARTPLAY_HOMOGRAPHY_JSON is not set in .env"), { statusCode: 500 });
  if (!fs.existsSync(homographyJson)) throw Object.assign(new Error(`Homography JSON not found: ${homographyJson}`), { statusCode: 400 });

  const playerModel = process.env.SMARTPLAY_PLAYER_MODEL;
  if (!playerModel) throw Object.assign(new Error("SMARTPLAY_PLAYER_MODEL is not set in .env"), { statusCode: 500 });
  if (!fs.existsSync(playerModel)) throw Object.assign(new Error(`Player model not found: ${playerModel}`), { statusCode: 400 });

  const ballModel = process.env.SMARTPLAY_BALL_MODEL;
  if (!ballModel) throw Object.assign(new Error("SMARTPLAY_BALL_MODEL is not set in .env"), { statusCode: 500 });
  if (!fs.existsSync(ballModel)) throw Object.assign(new Error(`Ball model not found: ${ballModel}`), { statusCode: 400 });

  const poseModel = process.env.SMARTPLAY_POSE_MODEL || null;
  const apiUrl = process.env.API_URL || "http://localhost:4001";
  const callbackSecret = process.env.SMARTPLAY_CALLBACK_SECRET || "";

  // Speed settings: SMARTPLAY_LIVE_* takes priority over SMARTPLAY_* for subprocess mode
  const e = process.env;
  const imgsz_player  = e.SMARTPLAY_LIVE_IMGSZ_PLAYER  || e.SMARTPLAY_IMGSZ_PLAYER  || "640";
  const imgsz_ball    = e.SMARTPLAY_LIVE_IMGSZ_BALL    || e.SMARTPLAY_IMGSZ_BALL    || "640";
  const imgsz_pose    = e.SMARTPLAY_LIVE_IMGSZ_POSE    || e.SMARTPLAY_IMGSZ_POSE    || "384";
  const detectEvery   = e.SMARTPLAY_LIVE_DETECT_EVERY  || e.SMARTPLAY_DETECT_EVERY  || "3";
  const poseEvery     = e.SMARTPLAY_LIVE_POSE_EVERY    || e.SMARTPLAY_POSE_EVERY    || "15";
  const callbackEvery = e.SMARTPLAY_LIVE_CALLBACK_EVERY || e.SMARTPLAY_CALLBACK_EVERY || "3";
  const device        = e.SMARTPLAY_LIVE_DEVICE        || "0";
  const useHalf       = (e.SMARTPLAY_LIVE_HALF         || "1") === "1";
  const disablePose   = (e.SMARTPLAY_LIVE_DISABLE_POSE || "0") === "1";
  const maxPoseAge    = e.SMARTPLAY_LIVE_MAX_POSE_AGE  || "10";
  const drawStalePose = (e.SMARTPLAY_LIVE_DRAW_STALE_POSE || "0") === "1";
  const ballIgnoreZones  = e.SMARTPLAY_LIVE_BALL_IGNORE_ZONES || "";
  const ignoreRescueConf = e.SMARTPLAY_LIVE_IGNORE_RESCUE_CONF || "0.40";

  const smartplayRoot = path.resolve(path.dirname(scriptPath), "..", "..");

  const args = [
    scriptPath,
    "--source", source,
    "--homography_json", homographyJson,
    "--player_model", playerModel,
    "--ball_model", ballModel,
    "--no_display",
    "--realtime",
    "--device", device,
    "--detect_every", detectEvery,
    "--pose_every", poseEvery,
    "--imgsz_player", imgsz_player,
    "--imgsz_ball", imgsz_ball,
    "--imgsz_pose", imgsz_pose,
    "--api_url", apiUrl,
    "--session_id", String(sessionId),
    "--callback_secret", callbackSecret,
    "--callback_every", callbackEvery,
  ];
  if (useHalf) args.push("--half");
  if (poseModel && fs.existsSync(poseModel) && !disablePose) args.push("--pose_model", poseModel);
  args.push("--max_pose_age", maxPoseAge);
  if (drawStalePose) args.push("--draw_stale_pose");
  if (ballIgnoreZones && fs.existsSync(ballIgnoreZones)) {
    args.push("--ball_ignore_zones_json", ballIgnoreZones);
    args.push("--ignore_rescue_conf", ignoreRescueConf);
  } else if (ballIgnoreZones) {
    console.warn(`[file_demo:${sessionId}] SMARTPLAY_LIVE_BALL_IGNORE_ZONES set but file not found: ${ballIgnoreZones}`);
  }

  console.log(`[file_demo:${sessionId}] spawning: ${pythonExec} ${args[0]}`);
  console.log(`[file_demo:${sessionId}]   source=${source}`);
  console.log(`[file_demo:${sessionId}]   player_model=${playerModel}`);
  console.log(`[file_demo:${sessionId}]   ball_model=${ballModel}`);
  console.log(`[file_demo:${sessionId}]   homography=${homographyJson}`);
  console.log(`[file_demo:${sessionId}]   speed: imgsz_player=${imgsz_player} imgsz_ball=${imgsz_ball} imgsz_pose=${imgsz_pose}`);
  console.log(`[file_demo:${sessionId}]   speed: detect_every=${detectEvery} pose_every=${poseEvery} callback_every=${callbackEvery}`);
  console.log(`[file_demo:${sessionId}]   speed: device=${device} half=${useHalf} disable_pose=${disablePose}`);
  console.log(`[file_demo:${sessionId}]   ball_ignore_zones=${ballIgnoreZones || "(none)"} rescue_conf=${ignoreRescueConf}`);

  // Kill any existing process for this session
  stopFileDemoProcess(sessionId);

  const child = spawn(pythonExec, args, {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    cwd: smartplayRoot,
    env: { ...process.env, PYTHONPATH: smartplayRoot },
  });

  fileDemoProcesses.set(Number(sessionId), child);

  child.stdout.on("data", (d) => {
    const text = d.toString().trimEnd();
    if (text) console.log(`[file_demo:${sessionId}]`, text);
  });
  child.stderr.on("data", (d) => {
    const text = d.toString().trimEnd();
    if (text) console.error(`[file_demo:${sessionId}]`, text);
  });
  child.on("exit", async (code) => {
    fileDemoProcesses.delete(Number(sessionId));
    const status = code === 0 || code === null ? "stopped" : "error";
    const msg = code === 0 || code === null
      ? "File demo pipeline finished."
      : `Pipeline exited with code ${code}.`;
    await updateLiveSessionStatus({ sessionId: Number(sessionId), status, message: msg, stopped: status === "stopped" }).catch(() => {});
    if (io) io.to(liveRoom(Number(sessionId))).emit("live:stopped", { sessionId: Number(sessionId), status });
  });

  return child;
}

async function stopLiveSession(session, message = "Live analysis stopped.") {
  stopMockLiveSession(session.id);
  stopFileDemoProcess(session.id);
  // Call FastAPI stop for any session whose aiSessionId was issued by FastAPI (live- prefix).
  const fastapiPrefixes = ["filedemo-", "mock-", "local-"];
  const hasFastapiSession = SMARTPLAY_AI_URL && session.aiSessionId &&
    !fastapiPrefixes.some((p) => String(session.aiSessionId).startsWith(p));
  if (hasFastapiSession) {
    await callSmartPlayJson("/live/stop", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SMARTPLAY_CALLBACK_SECRET ? { "x-smartplay-callback-secret": SMARTPLAY_CALLBACK_SECRET } : {}),
      },
      body: JSON.stringify({ sessionId: session.id, aiSessionId: session.aiSessionId }),
    }).catch((error) => console.warn("[live] SmartPlay stop failed:", error));
  }
  await updateLiveSessionStatus({ sessionId: session.id, status: "stopped", message, stopped: true });
  if (io) io.to(liveRoom(session.id)).emit("live:stopped", { sessionId: session.id, status: "stopped" });
  return getLiveSessionById(session.id);
}

function toScoringV2Payload(matchConfig, requestBody = {}) {
  return {
    match_id: matchConfig.match_id,
    camera_id: matchConfig.camera_id,
    ball_tracks: matchConfig.ball_tracks,
    player_tracks: matchConfig.player_tracks,
    out_dir: matchConfig.out_dir,
    max_frames: matchConfig.max_frames,
    render_debug: Boolean(requestBody?.render_debug ?? requestBody?.renderDebug ?? false),
  };
}

async function persistAiEventsForServiceJob(serviceJob) {
  const storedJob = await getAiAnalysisJobByExternalJobId(serviceJob?.job_id);
  if (!storedJob || serviceJob?.status !== "done") {
    return { saved: 0 };
  }

  const { response, body } = await callSmartPlayJson(
    `/matches/${encodeURIComponent(storedJob.external_match_key)}/${encodeURIComponent(storedJob.camera_id)}/events`
  );
  if (!response.ok) {
    return { saved: 0, error: body?.message ?? body?.detail ?? "Unable to load SmartPlay events." };
  }

  const events = Array.isArray(body?.events) ? body.events : [];
  return saveAiScoringEventsForJob({ jobId: serviceJob.job_id, events });
}

function safePathSegment(value, fallback = "unknown") {
  const cleaned = String(value ?? "").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function smartplayClipPublicPath(storedVideoPath) {
  const rawPath = String(storedVideoPath ?? "");
  if (!rawPath) return "";
  const normalized = rawPath.replace(/\\/g, "/");
  if (normalized.startsWith("uploads/")) return `/${normalized}`;
  if (path.isAbsolute(rawPath)) {
    const relativeToUploads = path.relative(uploadsDir, rawPath).replace(/\\/g, "/");
    if (relativeToUploads && !relativeToUploads.startsWith("..") && !path.isAbsolute(relativeToUploads)) {
      return `/uploads/${relativeToUploads}`;
    }
    const relativeToProject = path.relative(process.cwd(), rawPath).replace(/\\/g, "/");
    if (relativeToProject && !relativeToProject.startsWith("..") && !path.isAbsolute(relativeToProject)) {
      return `/${relativeToProject}`;
    }
  }
  return `/${normalized.replace(/^\/+/, "")}`;
}

function smartplayClipPreviewPath(storedVideoPath) {
  const rawPath = String(storedVideoPath ?? "");
  if (!rawPath) return "";
  return path.join(path.dirname(rawPath), "preview.mp4");
}

function isSupportedHomographyFile(filePath) {
  return [".json", ".npy", ".npz"].includes(path.extname(filePath).toLowerCase());
}

function smartplayClipPayload(clip) {
  const previewPath = smartplayClipPreviewPath(clip.storedVideoPath);
  const hasPreview = Boolean(previewPath && fs.existsSync(path.resolve(previewPath)));
  return {
    ...clip,
    videoUrl: smartplayClipPublicPath(clip.storedVideoPath),
    previewVideoUrl: hasPreview ? smartplayClipPublicPath(previewPath) : null,
  };
}

async function createBrowserPreviewVideo(inputPath, outputPath) {
  if (!SMARTPLAY_GENERATE_BROWSER_PREVIEW) {
    return { created: false, reason: "disabled" };
  }

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  return new Promise((resolve) => {
    const args = [
      "-y",
      "-i", inputPath,
      "-map", "0:v:0",
      "-map", "0:a?",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-b:a", "128k",
      outputPath,
    ];
    const ffmpeg = spawn(FFMPEG_PATH, args, { windowsHide: true });
    let stderr = "";
    ffmpeg.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    ffmpeg.on("error", (error) => {
      resolve({ created: false, reason: error.code === "ENOENT" ? "ffmpeg_not_found" : error.message });
    });
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve({ created: true });
      } else {
        resolve({ created: false, reason: stderr.trim().slice(-800) || `ffmpeg exited with code ${code}` });
      }
    });
  });
}

function smartplayAnnotationCommand(clip, outputJsonl) {
  return [
    "cd C:\\Users\\USER\\OneDrive\\Documents\\GitHub\\workspace\\smartplay_ai",
    "conda activate smartplay_ai",
    "$env:PYTHONPATH=\".\"",
    `python scripts\\court_geometry\\17_manual_keypoints_video_annotator.py --sport ${clip.sportType ?? "padel"} --video_path "${path.resolve(clip.storedVideoPath)}" --output_jsonl "${outputJsonl}" --start_frame 0`,
  ].join("\n");
}

async function proxySmartPlayVideo(res, pathname, fallbackMessage = "Video not available.") {
  if (!SMARTPLAY_AI_URL) return sendSmartPlayNotConfigured(res);
  try {
    const response = await fetchSmartPlay(pathname);
    if (!response.ok) {
      const body = await readSmartPlayResponse(response);
      return res.status(response.status).json(body ?? { message: fallbackMessage });
    }
    if (!response.body) return res.status(502).json({ message: "SmartPlay AI returned an empty video response." });
    const contentType = response.headers.get("content-type");
    const contentLength = response.headers.get("content-length");
    if (contentType) res.setHeader("content-type", contentType);
    if (contentLength) res.setHeader("content-length", contentLength);
    return Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    return sendSmartPlayFetchError(res, error);
  }
}

function sendLocalVideoFile(res, filePath, fallbackMessage = "Video not available.") {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return res.status(404).json({ message: fallbackMessage, path: resolved });
  }
  return res.sendFile(resolved, {
    headers: {
      "content-type": "video/mp4",
      "content-disposition": `inline; filename="${path.basename(resolved)}"`,
    },
  });
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ultima-demo-api",
    smartplayClipApiVersion: 3,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/arenas", async (_req, res) => {
  res.json({ arenas: await listArenas() });
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { nom, prenom, email, password, cinNumber } = req.body ?? {};
    const normalizedEmail = String(email ?? "").trim().toLowerCase();

    if (!email || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    if (!PASSWORD_REGEX.test(String(password))) {
      return res.status(400).json({ message: "Password must be at least 8 chars, with upper/lowercase and a number" });
    }
    if (!nom || !prenom) {
      return res.status(400).json({ message: "First name and last name are required" });
    }

    if (await findUserByEmail(normalizedEmail)) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await createUser({
      firstName: prenom,
      lastName: nom,
      email: normalizedEmail,
      passwordHash,
      membershipRole: "player",
    });

    const newUser = await findUserByEmail(normalizedEmail);
    return res.status(201).json(await issueSession(newUser));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sign up";
    const lower = String(message).toLowerCase();
    const status =
      lower.includes("duplicate") || lower.includes("already") || lower.includes("unique")
        ? 409
        : lower.includes("invalid") || lower.includes("required")
          ? 400
          : 500;
    return res.status(status).json({ message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  if (sanitizeUser(user).status !== "active") {
    return res.status(403).json({ message: "This account is inactive" });
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  return res.json(await issueSession(user));
});

app.post("/api/auth/refresh", async (req, res) => {
  try {
    const refreshToken = String(req.body?.refreshToken ?? "").trim();
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token is required" });
    }
    const record = await consumeRefreshToken(refreshToken);
    if (!record) {
      return res.status(401).json({ message: "Refresh token is invalid or expired" });
    }
    const user = await getUserById(Number(record.user_id));
    if (!user || sanitizeUser(user).status !== "active") {
      return res.status(401).json({ message: "User is unavailable for refresh" });
    }
    return res.json(await issueSession(user));
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to refresh session" });
  }
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  try {
    await revokeRefreshTokensForUser(req.user.sub);
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to log out" });
  }
});

// Player: update own profile (name only — email not changeable)
app.patch("/api/player/profile", requireAuth, async (req, res) => {
  try {
    const { firstName, lastName } = req.body ?? {};
    const user = await updateUserProfile(req.user.sub, { firstName, lastName });
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json(await issueSession(user));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to update profile" });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body ?? {};
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({ message: "Valid email is required" });
  }
  try {
    const result = await requestPasswordReset(normalizedEmail);
    const resetCode = result.code ? String(result.code) : null;

    if (!resetCode) {
      return res.status(404).json({ error: "No account found with that email." });
    }

    try {
      await sendPasswordResetCodeEmail({ to: normalizedEmail, code: resetCode });
      console.log("[auth/forgot-password] Email delivered to:", normalizedEmail);
    } catch (mailError) {
      console.error("[auth/forgot-password] SMTP ERROR:", mailError.message);
      return res.status(500).json({
        error: "Email delivery failed: " + mailError.message,
        code: resetCode,
      });
    }

    return res.json({ code: resetCode });
  } catch (error) {
    console.error("[auth/forgot-password] Failed:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { token, password } = req.body ?? {};
  if (!token || !password) {
    return res.status(400).json({ message: "Token and password are required" });
  }
  if (!PASSWORD_REGEX.test(String(password))) {
    return res.status(400).json({ message: "Password must be at least 8 chars, with upper/lowercase and a number" });
  }
  const passwordHash = await bcrypt.hash(String(password), 10);
  await resetPasswordWithToken(String(token), passwordHash);
  return res.json({ success: true });
});

app.post("/api/auth/reset-password-code", async (req, res) => {
  const normalizedEmail = String(req.body?.email ?? "").trim().toLowerCase();
  const code = String(req.body?.code ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({ message: "Valid email is required" });
  }
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: "Reset code must contain 6 digits" });
  }
  if (!PASSWORD_REGEX.test(password)) {
    return res.status(400).json({ message: "Password must be at least 8 chars, with upper/lowercase and a number" });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await resetPasswordWithCode(normalizedEmail, code, passwordHash);
  return res.json({ success: true });
});

app.get("/api/auth/verify-email", async (req, res) => {
  const token = String(req.query.token ?? "").trim();
  if (!token) {
    return res.status(400).json({ message: "Verification token is required" });
  }
  await verifyEmailWithToken(token);
  return res.json({ success: true, message: "Email verified successfully." });
});

app.post("/api/auth/verify-email-code", async (req, res) => {
  const normalizedEmail = String(req.body?.email ?? "").trim().toLowerCase();
  const code = String(req.body?.code ?? "").trim();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({ message: "Valid email is required" });
  }
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: "Verification code must contain 6 digits" });
  }
  await verifyEmailWithCode(normalizedEmail, code);
  return res.json({ success: true, message: "Email verified successfully." });
});

app.post("/api/auth/resend-verification", async (req, res) => {
  const normalizedEmail = String(req.body?.email ?? "").trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({ message: "Valid email is required" });
  }
  const verification = await requestEmailVerification(normalizedEmail);
  if (verification.alreadyVerified) {
    return res.json({
      success: true,
      message: "This email is already verified.",
    });
  }
  const verifyLink = verification.token
    ? `${getPublicWebBaseUrl(req)}/verify-email?token=${encodeURIComponent(verification.token)}`
    : null;
  const verifyCode = verification.code ? String(verification.code) : null;
  let emailSent = false;
  if (verification.user?.email && verifyCode) {
    try {
      await sendVerificationCodeEmail({
        to: verification.user.email,
        firstName: verification.user.firstName,
        code: verifyCode,
        verifyLink,
      });
      emailSent = true;
    } catch (error) {
      console.warn("[auth/resend-verification] verification email send failed:", error?.message ?? error);
    }
  }
  return res.json({
    success: true,
    message: isMailerConfigured() && emailSent
      ? "If eligible, a new verification code has been sent."
      : "Verification code prepared (email delivery failed or SMTP not configured).",
    verificationCode: isLocalRequest(req) ? verifyCode : undefined,
    verificationLink: isLocalRequest(req) ? verifyLink : undefined,
  });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const user = await findUserByEmail(req.user.email);
  return res.json({ user: sanitizeUser(user) });
});

app.get("/api/courts", optionalAuth, async (req, res) => {
  const actor = await attachActor(req);
  res.json({ courts: await listCourts(actor) });
});

app.get("/api/courts/:id/availability", requireAuth, async (req, res) => {
  const { date } = req.query;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ message: "A valid date is required" });
  }

  const actor = await attachActor(req);
  const availability = await getCourtAvailability(Number(req.params.id), date);
  if (!availability) {
    return res.status(404).json({ message: "Court not found" });
  }

  const court = await getCourtById(Number(req.params.id));
  if (!["player", "super_admin"].includes(actor?.effective_role) && actor?.arena_id && court?.arena_id !== actor.arena_id) {
    return res.status(403).json({ message: "You can only view availability for courts in your arena" });
  }

  return res.json(availability);
});

app.post("/api/participants/lookup", requireAuth, async (req, res) => {
  const actor = await attachActor(req);
  const { emails = [], arenaId } = req.body ?? {};
  const targetArenaId = Number(arenaId ?? actor?.arena_id);

  if (!targetArenaId) {
    return res.status(400).json({ message: "Only arena members can add participants" });
  }

  const normalizedEmails = Array.isArray(emails) ? emails.filter((email) => typeof email === "string") : [];
  return res.json({
    participants: await lookupParticipantsForArena(targetArenaId, normalizedEmails),
  });
});

app.get("/api/reservations/my", requireAuth, async (req, res) => {
  res.json({ reservations: await listReservationsForUser(req.user.sub) });
});

app.post("/api/reservations", requireAuth, async (req, res) => {
  try {
    const { courtId, reservationDate, startTime, endTime, notes, participantEmails } = req.body ?? {};

    if (!courtId || !reservationDate || !startTime || !endTime) {
      return res.status(400).json({ message: "Missing reservation fields" });
    }

    const reservationStart = parseReservationDateTime(reservationDate, startTime);
    const reservationEnd = parseReservationDateTime(reservationDate, endTime);
    if (!reservationStart || !reservationEnd || reservationEnd <= reservationStart) {
      return res.status(400).json({ message: "Invalid reservation date or time" });
    }

    if (reservationStart <= new Date()) {
      return res.status(400).json({ message: "You cannot reserve a past time slot" });
    }

    const court = await getCourtById(courtId);
    if (!court) {
      return res.status(404).json({ message: "Court not found" });
    }

    const reservation = await createReservation({
      userId: req.user.sub,
      courtId,
      reservationDate,
      startTime,
      endTime,
      qrToken: randomUUID(),
      notes,
      participantEmails: Array.isArray(participantEmails) ? participantEmails : [],
    });

    await createNotification({
      userId: req.user.sub,
      title: "Reservation confirmed",
      body: `Your reservation for ${court.name} on ${reservationDate} from ${startTime} to ${endTime} is confirmed.`,
      type: "reservation",
      linkUrl: "/performance?tab=reservations",
    });

    return res.status(201).json({ reservation });
  } catch (error) {
    console.error("[POST /api/reservations]", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to create reservation" });
  }
});

app.patch("/api/reservations/:id/cancel", requireAuth, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "Authentication required" });

    const reservationId = Number(req.params.id);
    const { reason } = req.body ?? {};

    const result = await cancelReservation(reservationId, actor, reason ?? null);

    if (!result.changes && !result.alreadyCancelled) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    const reservation = result.reservation;

    // Already cancelled — return existing state without processing refund again
    if (result.alreadyCancelled) {
      return res.json({
        success: true,
        reservation: {
          id: reservation.id,
          status: reservation.status,
          cancelled_at: reservation.cancelled_at ?? null,
          cancelled_by_user_id: reservation.cancelled_by_user_id ?? null,
          cancellation_reason: reservation.cancellation_reason ?? null,
        },
        refund: {
          status: reservation.refund_status ?? "not_applicable",
          stripeRefundId: reservation.stripe_refund_id ?? null,
          amount: reservation.refunded_amount ?? null,
        },
        notifications: { coachNotified: false },
        message: "Reservation was already cancelled",
      });
    }

    // ── Stripe refund ──────────────────────────────────────────────────────────
    let refundResult = { status: "not_applicable", stripeRefundId: null, amount: null };

    if (STRIPE_SECRET_KEY && reservation.stripe_session_id && reservation.payment_status === "paid") {
      try {
        const { default: Stripe } = await import("stripe");
        const stripe = new Stripe(STRIPE_SECRET_KEY);

        const session = await stripe.checkout.sessions.retrieve(reservation.stripe_session_id, {
          expand: ["payment_intent"],
        });
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

        if (paymentIntentId) {
          const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
          refundResult = {
            status: refund.status === "succeeded" ? "succeeded" : "pending",
            stripeRefundId: refund.id,
            amount: refund.amount / 100,
          };
          await updateReservationRefund(reservationId, {
            refundStatus: refundResult.status,
            stripeRefundId: refund.id,
            refundedAmount: refundResult.amount,
          });
        } else {
          await updateReservationRefund(reservationId, { refundStatus: "not_applicable" });
        }
      } catch (stripeError) {
        console.error("[cancel/stripe refund]", stripeError.message);
        const isAlreadyRefunded = stripeError.code === "charge_already_refunded";
        refundResult = {
          status: isAlreadyRefunded ? "already_refunded" : "failed",
          stripeRefundId: null,
          amount: null,
          error: stripeError.message,
        };
        await updateReservationRefund(reservationId, {
          refundStatus: refundResult.status,
          refundError: stripeError.message,
        });
      }
    } else {
      await updateReservationRefund(reservationId, { refundStatus: "not_applicable" });
    }

    // ── Coach notification ─────────────────────────────────────────────────────
    let coachNotified = false;
    const coachUserId = result.cancelledSession?.coach_user_id ?? null;
    if (coachUserId) {
      try {
        const playerName = `${actor.first_name} ${actor.last_name}`;
        const resDate = String(reservation.reservation_date).slice(0, 10);
        const resTime = String(reservation.start_time).slice(0, 5);
        await createNotification({
          userId: coachUserId,
          title: "Reservation cancelled",
          body: `${playerName} cancelled the session on ${resDate} at ${resTime} at ${reservation.arena_name}.`,
          type: "reservation_cancelled",
          linkUrl: "/coach",
        });
        coachNotified = true;
      } catch (_) {}
    }

    // ── Player confirmation notification ───────────────────────────────────────
    try {
      const refundMsg =
        refundResult.status === "succeeded" ? " A refund has been processed."
        : refundResult.status === "pending" ? " A refund is pending."
        : refundResult.status === "failed" ? " Refund failed — an admin will review."
        : "";
      await createNotification({
        userId: reservation.user_id,
        title: "Reservation cancelled",
        body: `Your reservation on ${String(reservation.reservation_date).slice(0, 10)} at ${String(reservation.start_time).slice(0, 5)} has been cancelled.${refundMsg}`,
        type: "reservation_cancelled",
        linkUrl: "/performance?tab=reservations",
      });
    } catch (_) {}

    if (io) emitBookingUpdate(io, reservation.arena_id, req.userId, "booking:cancelled", { reservationId });

    return res.json({
      success: true,
      reservation: {
        id: reservationId,
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by_user_id: actor.id,
        cancellation_reason: reason ?? null,
      },
      refund: {
        status: refundResult.status,
        stripeRefundId: refundResult.stripeRefundId ?? null,
        amount: refundResult.amount ?? null,
      },
      notifications: { coachNotified },
    });
  } catch (error) {
    console.error("[PATCH /api/reservations/:id/cancel]", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to cancel reservation" });
  }
});

app.get("/api/competitions", optionalAuth, async (req, res) => {
  const actor = await attachActor(req);
  res.json({
    competitions: await listCompetitions(actor),
    leaderboard: await getLeaderboard(actor),
  });
});

app.get("/api/competitions/:id", optionalAuth, async (req, res) => {
  try {
    const details = await getCompetitionDetails(Number(req.params.id));
    if (!details) return res.status(404).json({ message: "Competition non trouvee" });
    res.json(details);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Une erreur est survenue" });
  }
});

app.post("/api/competitions/:id/register", requireAuth, async (req, res) => {
  const actor = await attachActor(req);
  const outcome = await registerForCompetition(Number(req.params.id), actor);
  if (outcome.error) {
    return res.status(409).json({ message: outcome.error });
  }

  return res.json({ success: true });
});

// ── Admin competition management ──────────────────────────────────────────────

app.get("/api/admin/competitions", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    const competitions = await listCompetitions(actor);
    res.json({ competitions });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Error" });
  }
});

app.post("/api/admin/competitions", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    const { name, sport, description, startDate, endDate, registrationDeadline, location, maxParticipants, rules, prizes } = req.body ?? {};
    if (!name || !sport || !startDate || !location || !maxParticipants) {
      return res.status(400).json({ message: "name, sport, startDate, location, maxParticipants are required" });
    }
    const competition = await createCompetition(actor, { name, sport, description, startDate, endDate, registrationDeadline, location, maxParticipants: Number(maxParticipants), rules, prizes });
    res.status(201).json({ competition });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Error creating competition" });
  }
});

app.put("/api/admin/competitions/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    const { name, sport, description, startDate, endDate, registrationDeadline, location, maxParticipants, status, rules, prizes } = req.body ?? {};
    const competition = await updateCompetition(actor, Number(req.params.id), { name, sport, description, startDate, endDate, registrationDeadline, location, maxParticipants: maxParticipants ? Number(maxParticipants) : undefined, status, rules, prizes });
    res.json({ competition });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Error updating competition" });
  }
});

app.delete("/api/admin/competitions/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    await deleteCompetition(actor, Number(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Error deleting competition" });
  }
});

app.get("/api/admin/competitions/:id/registrations", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    const registrations = await listCompetitionRegistrations(actor, Number(req.params.id));
    res.json({ registrations });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Error loading registrations" });
  }
});

app.delete("/api/admin/competitions/:id/registrations/:userId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    await removeCompetitionRegistration(actor, Number(req.params.id), Number(req.params.userId));
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Error removing registration" });
  }
});

app.get("/api/live-scores", optionalAuth, async (req, res) => {
  const actor = await attachActor(req);
  res.json({ matches: await listMatches(actor) });
});

app.get("/api/reservations", requireAuth, async (req, res) => {
  try {
    const reservations = await listReservationsForUser(req.user.sub);
    res.json({ reservations });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Une erreur est survenue" });
  }
});

app.get("/api/reservations/:id", requireAuth, async (req, res, next) => {
  if (!/^\d+$/.test(String(req.params.id))) return next();
  try {
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "Authentication required" });
    const reservation = await getReservationForUser(Number(req.params.id), actor);
    if (!reservation) return res.status(404).json({ message: "Reservation not found" });
    res.json({ reservation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load reservation";
    res.status(message.includes("access") ? 403 : 400).json({ message });
  }
});

app.get("/api/reservations/:id/details", requireAuth, async (req, res, next) => {
  if (!/^\d+$/.test(String(req.params.id))) return next();
  try {
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "Authentication required" });
    const reservation = await getReservationForUser(Number(req.params.id), actor);
    if (!reservation) return res.status(404).json({ message: "Reservation not found" });
    res.json({ reservation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load reservation";
    res.status(message.includes("access") ? 403 : 400).json({ message });
  }
});

app.get("/api/reservations/:id/ticket.pdf", requireAuth, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) {
      return res.status(401).json({ message: "User not found" });
    }
    const { default: pgPool } = await import("./pg-pool.mjs");
    const { rows: payRows } = await pgPool.query(
      "SELECT payment_status FROM reservations WHERE id = $1",
      [Number(req.params.id)]
    );
    if (!payRows.length) return res.status(404).json({ message: "Reservation not found" });
    if (payRows[0].payment_status !== "paid") {
      return res.status(402).json({ message: "Payment required before downloading your ticket." });
    }
    const ticket = await getReservationTicketDetails(Number(req.params.id), actor);
    const pdfBuffer = generateReservationTicketPdfBuffer(ticket);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"ultima-reservation-${ticket.id}.pdf\"`);
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to generate ticket" });
  }
});

// GET /api/reservations/:id/ticket-link — returns the public mobile-friendly download URL
app.get("/api/reservations/:id/ticket-link", requireAuth, async (req, res) => {
  try {
    const { default: pgPool } = await import("./pg-pool.mjs");
    const reservationId = Number(req.params.id);
    const { rows } = await pgPool.query(
      "SELECT qr_token, payment_status, user_id FROM reservations WHERE id = $1",
      [reservationId]
    );
    if (!rows.length) return res.status(404).json({ message: "Reservation not found" });
    if (rows[0].payment_status !== "paid") return res.status(402).json({ message: "Payment required" });
    const url = `${PUBLIC_SERVER_URL}/public/tickets/${reservationId}/download?qr=${encodeURIComponent(rows[0].qr_token)}`;
    return res.json({ url });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to get ticket link" });
  }
});

app.get("/public/tickets/:id/download", async (req, res) => {
  try {
    const reservationId = Number(req.params.id);
    const qr = String(req.query.qr ?? "");
    if (!reservationId || !qr) {
      return res.status(400).json({ message: "reservationId and qr are required" });
    }

    const ticket = await getReservationTicketDetailsByQr(reservationId, qr);
    const pdfBuffer = generateReservationTicketPdfBuffer(ticket);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"ultima-reservation-${ticket.id}.pdf\"`);
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid ticket link";
    const status = message.includes("Payment required") ? 402 : 404;
    return res.status(status).json({ message });
  }
});

app.post("/api/reservations/:id/pay", requireAuth, async (req, res) => {
  try {
    const reservationId = Number(req.params.id);
    const { amount, currency = "TND", method = "simulated" } = req.body ?? {};
    if (!reservationId || !amount) return res.status(400).json({ message: "reservationId and amount are required" });
    const { default: pgPool } = await import("./pg-pool.mjs");
    const existing = await pgPool.query("SELECT id FROM reservation_payments WHERE reservation_id = $1", [reservationId]);
    if (existing.rows.length) {
      await pgPool.query(
        "UPDATE reservation_payments SET status='paid', method=$1, amount=$2, currency=$3, paid_at=NOW(), updated_at=NOW() WHERE reservation_id=$4",
        [method, amount, currency, reservationId]
      );
    } else {
      await pgPool.query(
        "INSERT INTO reservation_payments (reservation_id, amount, currency, status, method, paid_at) VALUES ($1,$2,$3,'paid',$4,NOW())",
        [reservationId, amount, currency, method]
      );
    }
    await pgPool.query("UPDATE reservations SET payment_status='paid' WHERE id=$1", [reservationId]);
    res.json({ success: true, reservationId, amount, currency, method, status: "paid" });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Payment failed" });
  }
});

// ── Stripe Payments ───────────────────────────────────────────────────────────

// POST /api/payments/reservation/:id/checkout
// Creates a Stripe checkout session for a confirmed court reservation.
app.post("/api/payments/reservation/:id/checkout", requireAuth, async (req, res) => {
  if (!STRIPE_SECRET_KEY) {
    return res.status(503).json({ message: "Stripe is not configured. Add STRIPE_SECRET_KEY to .env." });
  }
  try {
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const { default: pgPool } = await import("./pg-pool.mjs");
    const reservationId = Number(req.params.id);

    const { rows } = await pgPool.query(
      `SELECT r.*, c.name AS court_name, c.price_per_hour, a.name AS arena_name
       FROM reservations r
       JOIN courts c ON c.id = r.court_id
       JOIN arenas a ON a.id = c.arena_id
       WHERE r.id = $1 AND r.user_id = $2`,
      [reservationId, req.user.sub]
    );
    if (!rows.length) return res.status(404).json({ message: "Reservation not found" });
    const reservation = rows[0];
    if (reservation.payment_status === "paid") {
      return res.status(400).json({ message: "This reservation is already paid" });
    }

    // Calculate duration in hours
    const [sh, sm] = String(reservation.start_time).split(":").map(Number);
    const [eh, em] = String(reservation.end_time).split(":").map(Number);
    const durationHours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    const tndAmount = Number(reservation.price_per_hour ?? 0) * durationHours;
    const eurCents = Math.round(tndAmount * TND_TO_EUR_RATE * 100);

    const baseUrl = getPublicWebBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: {
            name: `Court: ${reservation.court_name} — ${reservation.arena_name}`,
            description: `${reservation.reservation_date} · ${String(reservation.start_time).slice(0,5)}–${String(reservation.end_time).slice(0,5)}`,
          },
          unit_amount: eurCents,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&type=reservation&id=${reservationId}`,
      cancel_url: `${baseUrl}/payment/cancel?type=reservation&id=${reservationId}`,
      metadata: { type: "reservation", reservationId: String(reservationId) },
    });

    await pgPool.query("UPDATE reservations SET stripe_session_id = $1 WHERE id = $2", [session.id, reservationId]);
    return res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create checkout session" });
  }
});

// POST /api/payments/coaching-request/:id/checkout
// Creates a Stripe checkout session for an accepted coaching request (court + coach fee).
app.post("/api/payments/coaching-request/:id/checkout", requireAuth, async (req, res) => {
  if (!STRIPE_SECRET_KEY) {
    return res.status(503).json({ message: "Stripe is not configured. Add STRIPE_SECRET_KEY to .env." });
  }
  try {
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const { default: pgPool } = await import("./pg-pool.mjs");
    const requestId = Number(req.params.id);

    const { rows } = await pgPool.query(
      `SELECT cr.*,
              CONCAT(u.first_name,' ',u.last_name) AS coach_name,
              cp.hourly_rate AS coach_hourly_rate,
              cp.currency AS coach_currency,
              c.name AS court_name, c.price_per_hour AS court_price,
              a.name AS arena_name
       FROM coaching_requests cr
       JOIN users u ON u.id = cr.coach_user_id
       LEFT JOIN coach_profiles cp ON cp.user_id = cr.coach_user_id
       LEFT JOIN courts c ON c.id = cr.preferred_court_id
       LEFT JOIN arenas a ON a.id = cr.arena_id
       WHERE cr.id = $1 AND cr.player_user_id = $2`,
      [requestId, req.user.sub]
    );
    if (!rows.length) return res.status(404).json({ message: "Coaching request not found" });
    const cr = rows[0];
    if (cr.status !== "accepted") return res.status(400).json({ message: "Only accepted requests can be paid" });
    if (cr.payment_status === "paid") return res.status(400).json({ message: "Already paid" });

    const [sh, sm] = String(cr.requested_start_time).split(":").map(Number);
    const [eh, em] = String(cr.requested_end_time).split(":").map(Number);
    const durationHours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;

    const coachFee = Number(cr.coach_hourly_rate ?? 0) * durationHours;
    const courtFee = Number(cr.court_price ?? 0) * durationHours;
    const totalTND = coachFee + courtFee;
    const totalEurCents = Math.round(totalTND * TND_TO_EUR_RATE * 100);

    const baseUrl = getPublicWebBaseUrl(req);
    const lineItems = [];

    if (coachFee > 0) {
      lineItems.push({
        price_data: {
          currency: "eur",
          product_data: {
            name: `Coach session: ${cr.coach_name}`,
            description: `${cr.requested_date} · ${String(cr.requested_start_time).slice(0,5)}–${String(cr.requested_end_time).slice(0,5)}`,
          },
          unit_amount: Math.round(coachFee * TND_TO_EUR_RATE * 100),
        },
        quantity: 1,
      });
    }
    if (courtFee > 0) {
      lineItems.push({
        price_data: {
          currency: "eur",
          product_data: {
            name: `Court: ${cr.court_name ?? "Selected court"} — ${cr.arena_name}`,
            description: `${cr.requested_date} · ${String(cr.requested_start_time).slice(0,5)}–${String(cr.requested_end_time).slice(0,5)}`,
          },
          unit_amount: Math.round(courtFee * TND_TO_EUR_RATE * 100),
        },
        quantity: 1,
      });
    }
    if (!lineItems.length) {
      lineItems.push({
        price_data: {
          currency: "eur",
          product_data: { name: `Coach session: ${cr.coach_name}`, description: `${cr.requested_date}` },
          unit_amount: Math.max(totalEurCents, 50),
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&type=coaching&id=${requestId}`,
      cancel_url: `${baseUrl}/payment/cancel?type=coaching&id=${requestId}`,
      metadata: { type: "coaching_request", requestId: String(requestId) },
    });

    await pgPool.query(
      "UPDATE coaching_requests SET stripe_session_id = $1, payment_amount = $2 WHERE id = $3",
      [session.id, totalTND, requestId]
    );
    return res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create checkout session" });
  }
});

// GET /api/payments/session/:sessionId — poll session status after redirect back
// Also acts as fallback fulfillment in case the webhook was delayed or missed.
app.get("/api/payments/session/:sessionId", requireAuth, async (req, res) => {
  if (!STRIPE_SECRET_KEY) {
    return res.status(503).json({ message: "Stripe is not configured." });
  }
  try {
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);

    if (session.payment_status === "paid") {
      const { default: pgPool } = await import("./pg-pool.mjs");
      const meta = session.metadata ?? {};

      if (meta.type === "reservation") {
        const reservationId = Number(meta.reservationId);
        const { rows } = await pgPool.query("SELECT payment_status, user_id FROM reservations WHERE id = $1", [reservationId]);
        if (rows.length && rows[0].payment_status !== "paid") {
          await pgPool.query("UPDATE reservations SET payment_status='paid' WHERE id=$1", [reservationId]);
          const existing = await pgPool.query("SELECT id FROM reservation_payments WHERE reservation_id=$1", [reservationId]);
          if (!existing.rows.length) {
            await pgPool.query(
              "INSERT INTO reservation_payments (reservation_id, amount, currency, status, method, paid_at) VALUES ($1,$2,'EUR','paid','stripe',NOW())",
              [reservationId, (session.amount_total / 100).toFixed(2)]
            );
          }
        }
      } else if (meta.type === "coaching_request") {
        const requestId = Number(meta.requestId);
        const { rows: crRows } = await pgPool.query("SELECT * FROM coaching_requests WHERE id=$1", [requestId]);
        if (crRows.length && crRows[0].payment_status !== "paid") {
          const cr = crRows[0];
          await pgPool.query("UPDATE coaching_requests SET payment_status='paid' WHERE id=$1", [requestId]);

          // Create reservation if not yet created
          if (cr.preferred_court_id && !cr.coaching_reservation_id) {
            const qrToken = randomUUID();
            const { rows: resRows } = await pgPool.query(
              `INSERT INTO reservations
                 (user_id, arena_id, court_id, reservation_date, start_time, end_time,
                  sport, players_count, status, payment_status, booking_type, qr_token, created_at)
               VALUES ($1,$2,$3,$4::date,$5::time,$6::time,'padel',$7,'confirmed','paid','coaching_session',$8,NOW())
               RETURNING id`,
              [cr.player_user_id, cr.arena_id, cr.preferred_court_id,
               cr.requested_date, cr.requested_start_time, cr.requested_end_time,
               cr.players_count ?? 2, qrToken]
            );
            const newResId = resRows[0]?.id ?? null;
            if (newResId) {
              await pgPool.query("UPDATE coaching_requests SET coaching_reservation_id=$1 WHERE id=$2", [newResId, requestId]);
            }
          }

          // Block coach slot
          await pgPool.query(
            `INSERT INTO coach_availability_exceptions (coach_user_id, exception_date, start_time, end_time, reason)
             VALUES ($1,$2::date,$3::time,$4::time,'booked') ON CONFLICT DO NOTHING`,
            [cr.coach_user_id, cr.requested_date, cr.requested_start_time, cr.requested_end_time]
          );

          try {
            await createNotification({ userId: cr.coach_user_id, title: "Session booked & paid", body: `Session on ${cr.requested_date} at ${String(cr.requested_start_time).slice(0,5)} is confirmed.`, type: "payment", linkUrl: "/coach" });
            await createNotification({ userId: cr.player_user_id, title: "Payment confirmed — session booked!", body: `Your coaching session on ${cr.requested_date} is confirmed.`, type: "payment", linkUrl: "/performance?tab=reservations" });
          } catch (_) {}
        }
      }
    }

    return res.json({ status: session.payment_status, metadata: session.metadata });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to retrieve session" });
  }
});

// POST /api/stripe/webhook — Stripe sends checkout.session.completed here
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!STRIPE_SECRET_KEY) return res.status(503).json({ message: "Stripe not configured" });

  let event;
  try {
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(STRIPE_SECRET_KEY);
    if (STRIPE_WEBHOOK_SECRET) {
      const sig = req.headers["stripe-signature"];
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error("Stripe webhook signature error:", err.message);
    return res.status(400).json({ message: `Webhook error: ${err.message}` });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { default: pgPool } = await import("./pg-pool.mjs");

    try {
      if (session.metadata?.type === "reservation") {
        const reservationId = Number(session.metadata.reservationId);
        const { rows } = await pgPool.query("SELECT * FROM reservations WHERE id = $1", [reservationId]);
        if (rows.length && rows[0].payment_status !== "paid") {
          const r = rows[0];
          await pgPool.query("UPDATE reservations SET payment_status='paid' WHERE id=$1", [reservationId]);
          const existing = await pgPool.query("SELECT id FROM reservation_payments WHERE reservation_id = $1", [reservationId]);
          if (!existing.rows.length) {
            await pgPool.query(
              "INSERT INTO reservation_payments (reservation_id, amount, currency, status, method, paid_at) VALUES ($1,$2,'EUR','paid','stripe',NOW())",
              [reservationId, (session.amount_total / 100).toFixed(2)]
            );
          }
          await createNotification({
            userId: r.user_id,
            title: "Payment confirmed",
            body: `Your court reservation #${reservationId} is confirmed. Download your ticket below.`,
            type: "payment",
            linkUrl: `/performance?tab=reservations`,
          });
        }
      } else if (session.metadata?.type === "coaching_request") {
        const requestId = Number(session.metadata.requestId);
        const { rows: crRows } = await pgPool.query("SELECT * FROM coaching_requests WHERE id = $1", [requestId]);
        if (crRows.length && crRows[0].payment_status !== "paid") {
          const cr = crRows[0];
          await pgPool.query("UPDATE coaching_requests SET payment_status='paid' WHERE id=$1", [requestId]);

          // Create the court reservation if a court was selected
          let newReservationId = null;
          if (cr.preferred_court_id) {
            const { rows: courtRows } = await pgPool.query("SELECT * FROM courts WHERE id = $1", [cr.preferred_court_id]);
            const court = courtRows[0];
            if (court) {
              const qrToken = randomUUID();
              const { rows: resRows } = await pgPool.query(
                `INSERT INTO reservations
                   (user_id, arena_id, court_id, reservation_date, start_time, end_time,
                    sport, players_count, status, payment_status, booking_type, qr_token, created_at)
                 VALUES ($1,$2,$3,$4::date,$5::time,$6::time,'padel',$7,'confirmed','paid','coaching_session',$8,NOW())
                 RETURNING id`,
                [
                  cr.player_user_id, cr.arena_id, cr.preferred_court_id,
                  cr.requested_date, cr.requested_start_time, cr.requested_end_time,
                  cr.players_count ?? 2, qrToken,
                ]
              );
              newReservationId = resRows[0]?.id ?? null;
            }
          }
          if (newReservationId) {
            await pgPool.query("UPDATE coaching_requests SET coaching_reservation_id=$1 WHERE id=$2", [newReservationId, requestId]);
          }

          // Block that slot in coach availability as an exception
          await pgPool.query(
            `INSERT INTO coach_availability_exceptions
               (coach_user_id, exception_date, start_time, end_time, reason)
             VALUES ($1,$2::date,$3::time,$4::time,'booked')
             ON CONFLICT DO NOTHING`,
            [cr.coach_user_id, cr.requested_date, cr.requested_start_time, cr.requested_end_time]
          );

          // Notify coach
          await createNotification({
            userId: cr.coach_user_id,
            title: "Session booked & paid",
            body: `A player has paid for the session on ${cr.requested_date} at ${String(cr.requested_start_time).slice(0,5)}. The slot is now blocked.`,
            type: "payment",
            linkUrl: "/coach",
          });
          // Notify player
          await createNotification({
            userId: cr.player_user_id,
            title: "Payment confirmed — session booked!",
            body: `Your coaching session on ${cr.requested_date} at ${String(cr.requested_start_time).slice(0,5)} is confirmed.`,
            type: "payment",
            linkUrl: `/performance?tab=reservations`,
          });
        }
      }
    } catch (processErr) {
      console.error("Webhook processing error:", processErr);
    }
  }

  return res.json({ received: true });
});

app.get("/api/reservations/tickets/verify", requireAuth, async (req, res) => {
  try {
    const reservationId = Number(req.query.reservationId);
    const signature = String(req.query.signature ?? "");
    if (!reservationId || !signature) {
      return res.status(400).json({ message: "reservationId and signature are required" });
    }

    const verification = await verifyReservationTicketSignature(reservationId, signature);
    return res.json(verification);
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to verify ticket" });
  }
});

app.get("/api/performance/me", requireAuth, async (req, res) => {
  res.json(await getPerformanceForUser(req.user.sub));
});

app.get("/api/player/dashboard", requireAuth, async (req, res) => {
  try {
    const data = await getPlayerDashboardData(req.user.sub);
    res.json(data);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Une erreur est survenue" });
  }
});

app.get("/api/player/matches", requireAuth, async (req, res) => {
  try {
    const matches = await listPlayerMatches(req.user.sub);
    res.json({ matches });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Une erreur est survenue" });
  }
});

app.get("/api/coach/students", requireAuth, requireCoach, async (req, res) => {
  try {
    const students = await listCoachStudents(req.user.sub);
    return res.json({ students });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load students" });
  }
});

app.get("/api/coach-links/coaches", requireAuth, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) {
      return res.status(401).json({ message: "User not found" });
    }
    if (actor.effective_role !== "player") {
      return res.status(403).json({ message: "Only players can browse coaches" });
    }
    const coaches = await listCoachesForPlayer(actor.id);
    return res.json({ coaches });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to list coaches" });
  }
});

app.get("/api/coach-links/my", requireAuth, async (req, res) => {
  try {
    const links = await listCoachRelationshipsForUser(req.user.sub);
    return res.json({ relationships: links });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load relationships" });
  }
});

app.post("/api/coach-links/request", requireAuth, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) {
      return res.status(401).json({ message: "User not found" });
    }
    if (actor.effective_role !== "player") {
      return res.status(403).json({ message: "Only players can request a coach" });
    }
    const { coachUserId, startDate, endDate, notes, permissions, consentVersion } = req.body ?? {};
    const relationship = await requestCoachRelationship(actor.id, {
      coachUserId: Number(coachUserId),
      startDate,
      endDate,
      notes,
      permissions,
      consentVersion,
    });
    return res.status(201).json({ relationship });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to request coach" });
  }
});

app.patch("/api/coach-links/:id/respond", requireAuth, async (req, res) => {
  try {
    const { decision } = req.body ?? {};
    const relationship = await respondCoachRelationship(req.user.sub, Number(req.params.id), decision);
    return res.json({ relationship });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to respond to request" });
  }
});

app.patch("/api/coach-links/:id", requireAuth, async (req, res) => {
  try {
    const { status, endDate, permissions, notes } = req.body ?? {};
    const relationship = await updateCoachRelationshipSettings(req.user.sub, Number(req.params.id), {
      status,
      endDate,
      permissions,
      notes,
    });
    return res.json({ relationship });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to update relationship" });
  }
});

app.get("/api/coach-links/reminders", requireAuth, async (req, res) => {
  try {
    const days = Number(req.query.days ?? 7);
    const reminders = await listCoachRelationshipExpiryReminders(req.user.sub, days);
    return res.json({ reminders });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load reminders" });
  }
});

app.get("/api/coach/students/:id/stats", requireAuth, requireCoach, async (req, res) => {
  try {
    const details = await getCoachStudentStats(req.user.sub, Number(req.params.id));
    return res.json(details);
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load student stats" });
  }
});

app.get("/api/coach/sessions", requireAuth, requireCoach, async (req, res) => {
  try {
    const sessions = await listCoachSessions(req.user.sub);
    return res.json({ sessions });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load sessions" });
  }
});

app.post("/api/coach/sessions", requireAuth, requireCoach, async (req, res) => {
  try {
    const { courtId, reservationDate, startTime, endTime, studentIds, title, sessionType, focusAreas, notes } = req.body ?? {};
    const session = await createCoachSession(req.user.sub, {
      courtId: Number(courtId),
      reservationDate,
      startTime,
      endTime,
      studentIds,
      title,
      sessionType,
      focusAreas,
      notes,
    });
    return res.status(201).json({ session });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to schedule session" });
  }
});

app.get("/api/admin/billing/summary", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) {
      return res.status(401).json({ message: "User not found" });
    }
    const summary = await getArenaBillingSummary(actor);
    return res.json(summary);
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load billing summary" });
  }
});

app.get("/api/admin/billing/plans", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const plans = await listBillingPlans();
    return res.json({ plans });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load plans" });
  }
});

app.post("/api/admin/billing/change-plan", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) {
      return res.status(401).json({ message: "User not found" });
    }
    const { planCode, cycle = "monthly" } = req.body ?? {};
    if (!planCode || !["starter", "pro", "elite"].includes(String(planCode))) {
      return res.status(400).json({ message: "Invalid plan code" });
    }
    if (!["monthly", "yearly"].includes(String(cycle))) {
      return res.status(400).json({ message: "Invalid billing cycle" });
    }

    const summary = await changeArenaPlan(actor, String(planCode), String(cycle));
    return res.json({ summary });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to change plan" });
  }
});

app.post("/api/admin/billing/checkout-session", requireAuth, requireAdmin, async (req, res) => {
  const { planCode = "pro", cycle = "monthly" } = req.body ?? {};
  return res.status(501).json({
    message: "Stripe checkout session creation is not connected yet.",
    hint: "Provide STRIPE_SECRET_KEY and implement Stripe Checkout session creation.",
    requested: { planCode, cycle },
  });
});

app.post("/api/billing/webhook", async (req, res) => {
  if (!WEBHOOK_SECRET) {
    return res.status(503).json({ message: "Billing webhook is disabled (missing secret)." });
  }

  const receivedSecret = String(req.headers["x-billing-webhook-secret"] ?? "");
  if (receivedSecret !== WEBHOOK_SECRET) {
    return res.status(401).json({ message: "Invalid webhook secret" });
  }

  const signature = String(req.headers["x-billing-signature"] ?? "");
  const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), "utf8");
  const expected = createHmac("sha256", WEBHOOK_SIGNATURE_SECRET).update(raw).digest("hex");
  const providedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (
    !signature ||
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return res.status(401).json({ message: "Invalid webhook signature" });
  }

  const event = req.body ?? {};
  try {
    if (event?.type === "subscription.updated" || event?.type === "subscription.created") {
      const payload = event.data ?? {};
      await upsertArenaSubscriptionFromProvider({
        arenaId: Number(payload.arenaId),
        planCode: String(payload.planCode ?? "starter"),
        status: String(payload.status ?? "active"),
        provider: String(payload.provider ?? "stripe"),
        providerCustomerId: payload.providerCustomerId ? String(payload.providerCustomerId) : null,
        providerSubscriptionId: payload.providerSubscriptionId ? String(payload.providerSubscriptionId) : null,
        currentPeriodStart: payload.currentPeriodStart ?? null,
        currentPeriodEnd: payload.currentPeriodEnd ?? null,
        trialEnd: payload.trialEnd ?? null,
        cancelAtPeriodEnd: Boolean(payload.cancelAtPeriodEnd),
      });
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Webhook processing failed" });
  }
});

app.get("/api/admin/overview", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) {
      return res.status(401).json({ message: "User not found" });
    }
    res.json(await getAdminOverview(actor));
  } catch (error) {
    console.error("[admin/overview] ERROR:", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load admin overview" });
  }
});

app.post("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) {
      return res.status(401).json({ message: "User not found" });
    }

    const { nom, prenom, email, password, role, arenaId, arenaName, cinNumber } = req.body ?? {};
    const normalizedRole = role === "admin" ? "admin" : role === "coach" ? "coach" : "player";

    if (normalizedRole === "admin") {
      if (!email || !password || (!arenaId && !arenaName)) {
        return res.status(400).json({ message: "Arena, Email et Mot de passe sont requis" });
      }
    } else if (!nom || !prenom || !email || !password || !arenaId) {
      return res.status(400).json({ message: "Tous les champs sont requis pour un utilisateur standard" });
    }
    if (!EMAIL_REGEX.test(String(email).trim().toLowerCase())) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    if (!PASSWORD_REGEX.test(String(password))) {
      return res.status(400).json({ message: "Password must be at least 8 chars, with upper/lowercase and a number" });
    }
    if (normalizedRole !== "admin" && !CIN_REGEX.test(String(cinNumber ?? "").trim())) {
      return res.status(400).json({ message: "CIN is required and must contain exactly 8 digits" });
    }

    if (await findUserByEmail(email)) {
      return res.status(409).json({ message: "Cet email est deja utilise" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createManagedUser({
      actor,
      firstName: normalizedRole === "admin" ? (String(prenom ?? "").trim() || "Admin") : prenom,
      lastName: normalizedRole === "admin" ? (String(nom ?? "").trim() || String(arenaName ?? "").trim() || "Admin") : nom,
      email,
      passwordHash,
      arenaId: arenaId ? Number(arenaId) : null,
      membershipRole: normalizedRole,
      arenaName,
      cinNumber: normalizedRole === "admin" ? null : String(cinNumber).trim(),
    });

    return res.status(201).json({ user: sanitizeUser(user) });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to create user" });
  }
});

app.patch("/api/admin/users/:id/status", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) {
      return res.status(401).json({ message: "User not found" });
    }
    const { status } = req.body ?? {};
    const user = await updateMembershipStatus(actor, Number(req.params.id), status);
    // Invalidate role cache so suspension/activation is reflected immediately
    await invalidateRoleCache(Number(req.params.id));
    return res.json({ user: sanitizeUser(user) });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to update user status" });
  }
});

app.patch("/api/admin/users/:id/role", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) {
      return res.status(401).json({ message: "User not found" });
    }
    const nextRole = String(req.body?.role ?? "").trim().toLowerCase();
    // Capture previous role for audit log
    const targetId = Number(req.params.id);
    const previousUser = await getUserById(targetId);
    const previousRole = previousUser ? (sanitizeUser(previousUser).role ?? null) : null;
    const actorArenaId = actor.arena_id ?? null;

    const user = await updateMembershipRole(actor, targetId, nextRole, req.body?.arenaId ? Number(req.body.arenaId) : null);

    // Invalidate role cache so the new role is reflected immediately
    await invalidateRoleCache(targetId);

    // Write audit log entry (fire-and-forget — never block the response)
    const { default: pgPool } = await import("./pg-pool.mjs");
    pgPool.query(
      `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, before_json, after_json, arena_id, ip_address)
       VALUES ($1, $2, 'user', $3::text, $4, $5, $6, $7::inet)`,
      [req.userId, 'ROLE_CHANGE', req.params.id, JSON.stringify({ before: previousRole }), JSON.stringify({ after: nextRole }), actorArenaId, req.ip]
    ).catch(() => {});

    await createNotification({
      userId: user.id,
      title: "Role updated",
      body: `Your arena role is now ${sanitizeUser(user).role}.`,
      type: "account",
      linkUrl: sanitizeUser(user).role === "coach" ? "/coach" : "/performance",
    });
    return res.json({ user: sanitizeUser(user) });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to update user role" });
  }
});

app.delete("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) {
      return res.status(401).json({ message: "User not found" });
    }
    await deleteUser(actor, Number(req.params.id));
    return res.status(204).send();
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to delete user" });
  }
});

app.post("/api/admin/matches/finalize", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { reservationId, score1, score2 } = req.body ?? {};
    if (!reservationId) {
      return res.status(400).json({ message: "reservationId is required" });
    }
    const result = await finalizeMatch(Number(reservationId), score1, score2);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to finalize match" });
  }
});

app.get("/api/admin/courts", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { default: pgPool } = await import("./pg-pool.mjs");
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "User not found" });
    const arenaFilter = actor.effective_role !== "super_admin"
      ? `AND c.arena_id = ${Number(actor.arena_id)}`
      : "";
    const { rows } = await pgPool.query(`
      SELECT c.id,
             c.name,
             c.sport,
             c.status,
             a.name AS arena_name,
             c.arena_id,
             SUBSTRING(c.opening_time::text, 1, 5) AS opening_time,
             SUBSTRING(c.closing_time::text, 1, 5) AS closing_time
      FROM courts c
      JOIN arenas a ON a.id = c.arena_id
      WHERE COALESCE(c.soft_deleted, false) = false ${arenaFilter}
      ORDER BY a.name, c.name
    `);
    res.json({ courts: rows });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unable to load courts" });
  }
});

app.post("/api/admin/courts", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) {
      return res.status(401).json({ message: "User not found" });
    }

    const { arenaId, name, sport, location, hasSumma, minPlayers, maxPlayers, openingTime, closingTime } = req.body ?? {};

    if (!arenaId || !name || !sport || !location) {
      return res.status(400).json({ message: "Missing required court fields" });
    }

    const court = await createCourt({
      actor,
      arenaId: Number(arenaId),
      name: String(name).trim(),
      sport: String(sport).trim(),
      location: String(location).trim(),
      hasSumma,
      minPlayers,
      maxPlayers,
      openingTime,
      closingTime,
    });

    return res.status(201).json({ court });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to create court" });
  }
});

app.get("/api/admin/reservations", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) {
      return res.status(401).json({ message: "User not found" });
    }
    res.json({ reservations: await listAdminReservations(actor) });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load reservations" });
  }
});

app.patch("/api/admin/reservations/:id/status", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) {
      return res.status(401).json({ message: "User not found" });
    }
    const { status } = req.body ?? {};
    await updateAdminReservationStatus(actor, Number(req.params.id), String(status));
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to update reservation status" });
  }
});

// Enhanced admin reservations: includes booking_type, payment_status, coach_name, date filter
app.get("/api/admin/reservations/v2", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { default: pgPool } = await import("./pg-pool.mjs");
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "User not found" });
    const { date } = req.query;
    const params = [];
    const conditions = [];
    if (actor.effective_role !== "super_admin") {
      params.push(actor.arena_id);
      conditions.push(`c.arena_id = $${params.length}`);
    }
    if (date) {
      params.push(date);
      conditions.push(`r.reservation_date = $${params.length}::date`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pgPool.query(`
      SELECT r.id,
             r.reservation_date::text,
             SUBSTRING(r.start_time::text, 1, 5)   AS start_time,
             SUBSTRING(r.end_time::text, 1, 5)     AS end_time,
             r.status,
             r.notes,
             r.created_at,
             r.qr_token,
             COALESCE(r.payment_status, 'pending')  AS payment_status,
             COALESCE(r.booking_type, 'court')       AS booking_type,
             c.name  AS court_name,
             a.name  AS arena_name,
             u.email AS owner_email,
             u.first_name || ' ' || u.last_name AS owner_name,
             (SELECT u2.first_name || ' ' || u2.last_name
                FROM coaching_requests cr
                JOIN users u2 ON u2.id = cr.coach_user_id
               WHERE cr.coaching_reservation_id = r.id
               LIMIT 1) AS coach_name
      FROM reservations r
      JOIN courts c ON c.id = r.court_id
      JOIN arenas a ON a.id = c.arena_id
      JOIN users  u ON u.id = r.user_id
      ${where}
      ORDER BY r.reservation_date DESC, r.start_time DESC
    `, params);
    res.json({
      reservations: rows.map(row => ({
        ...row,
        special_code: `ULT-${row.id}-${String(row.qr_token ?? "").slice(0, 8).toUpperCase()}`,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unable to load reservations" });
  }
});

// Court blocks — admin-managed unavailability slots
app.get("/api/admin/court-blocks", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { default: pgPool } = await import("./pg-pool.mjs");
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "User not found" });
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: "date query param required" });
    const params = [date];
    const arenaFilter = actor.effective_role !== "super_admin"
      ? `AND c.arena_id = $${params.push(actor.arena_id) && params.length}`
      : "";
    const { rows } = await pgPool.query(`
      SELECT cb.id,
             cb.court_id,
             c.name AS court_name,
             cb.block_date::text,
             SUBSTRING(cb.start_time::text, 1, 5) AS start_time,
             SUBSTRING(cb.end_time::text, 1, 5)   AS end_time,
             cb.reason,
             cb.created_at
      FROM court_blocks cb
      JOIN courts c ON c.id = cb.court_id
      WHERE cb.block_date = $1::date ${arenaFilter}
      ORDER BY cb.start_time
    `, params);
    res.json({ blocks: rows });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unable to load court blocks" });
  }
});

app.post("/api/admin/court-blocks", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { default: pgPool } = await import("./pg-pool.mjs");
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "User not found" });
    const { courtId, date, startTime, endTime, reason } = req.body;
    if (!courtId || !date || !startTime || !endTime) {
      return res.status(400).json({ message: "courtId, date, startTime, endTime required" });
    }
    // Verify court belongs to admin's arena
    if (actor.effective_role !== "super_admin") {
      const { rows: courtRows } = await pgPool.query(
        "SELECT id FROM courts WHERE id = $1 AND arena_id = $2", [courtId, actor.arena_id]
      );
      if (!courtRows.length) return res.status(403).json({ message: "Court not in your arena" });
    }
    const { rows } = await pgPool.query(`
      INSERT INTO court_blocks (court_id, block_date, start_time, end_time, reason, created_by)
      VALUES ($1, $2::date, $3::time, $4::time, $5, $6)
      RETURNING id, court_id, block_date::text,
        SUBSTRING(start_time::text,1,5) AS start_time,
        SUBSTRING(end_time::text,1,5)   AS end_time,
        reason, created_at
    `, [courtId, date, startTime, endTime, reason ?? null, actor.id]);
    res.status(201).json({ block: rows[0] });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unable to create block" });
  }
});

app.delete("/api/admin/court-blocks/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { default: pgPool } = await import("./pg-pool.mjs");
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "User not found" });
    const blockId = Number(req.params.id);
    if (actor.effective_role !== "super_admin") {
      const { rows } = await pgPool.query(
        `SELECT cb.id FROM court_blocks cb
         JOIN courts c ON c.id = cb.court_id
         WHERE cb.id = $1 AND c.arena_id = $2`,
        [blockId, actor.arena_id]
      );
      if (!rows.length) return res.status(403).json({ message: "Block not found in your arena" });
    }
    await pgPool.query("DELETE FROM court_blocks WHERE id = $1", [blockId]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unable to delete block" });
  }
});

app.get("/api/notifications", requireAuth, async (req, res) => {
  try {
    const notifications = await listNotificationsForUser(req.user.sub);
    return res.json({ notifications });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load notifications" });
  }
});

app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    const notification = await markNotificationRead(req.user.sub, Number(req.params.id));
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    return res.json({ notification });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to update notification" });
  }
});

app.get("/api/ai/analyses", requireAuth, async (req, res) => {
  res.json({ analyses: await listAnalysesForUser(req.user.sub) });
});

app.post("/api/ai/analyses", requireAuth, upload.single("video"), async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) {
      return res.status(401).json({ message: "User not found" });
    }
    if (!["coach", "admin", "super_admin"].includes(actor.effective_role)) {
      return res.status(403).json({ message: "Only coaches and admins can upload match videos" });
    }

    const title = String(req.body?.title ?? "").trim();
    const subjectUserId = Number(req.body?.subjectUserId ?? 0);
    const matchId = req.body?.matchId ? Number(req.body.matchId) : null;
    if (!title || !req.file || !subjectUserId) {
      return res.status(400).json({ message: "title, subjectUserId and video file are required" });
    }

    const analysis = await createAnalysis({
      userId: subjectUserId,
      title,
      videoName: req.file.originalname,
      uploaderUserId: actor.id,
      subjectUserId,
      matchId,
      storagePath: `/uploads/${req.file.filename}`,
      status: "pending_ai",
      summary: "Video uploaded successfully. Waiting for the AI module to process this match.",
    });

    try {
      await createNotification({
        userId: subjectUserId,
        title: "New match video uploaded",
        body: `${actor.first_name} ${actor.last_name} uploaded a new video for your analysis queue.`,
        type: "analysis",
        linkUrl: "/smartplay-ai",
      });
    } catch (notificationError) {
      console.warn("[ai/analyses] notification creation failed:", notificationError instanceof Error ? notificationError.message : notificationError);
    }

    return res.status(201).json({ analysis });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to upload analysis video" });
  }
});

// ── Padel Places & Terrains ──────────────────────────────────────────────────

app.get("/api/padel/places", optionalAuth, async (req, res) => {
  try {
    const { city, region, search, indoor, outdoor } = req.query;
    const places = await listPadelPlaces({ city, region, search, indoor, outdoor });
    res.json({ places });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unable to list padel places" });
  }
});

app.get("/api/padel/places/slug/:slug", optionalAuth, async (req, res) => {
  try {
    const place = await getPadelPlace(req.params.slug);
    if (!place) return res.status(404).json({ message: "Place not found" });
    const terrains = await listPadelTerrains(place.id);
    res.json({ place: { ...place, terrains } });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unable to get padel place" });
  }
});

app.get("/api/padel/places/:id/availability", optionalAuth, async (req, res) => {
  try {
    const place = await getPadelPlace(req.params.id);
    if (!place) return res.status(404).json({ message: "Place not found" });
    const { date, startTime, durationMinutes = "90" } = req.query;
    if (!date) return res.status(400).json({ message: "date is required (YYYY-MM-DD)" });
    const terrains = await getPadelAvailability(place.id, date, startTime, Number(durationMinutes));
    res.json({ placeId: place.id, date, startTime: startTime ?? null, durationMinutes: Number(durationMinutes), terrains });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unable to check availability" });
  }
});

app.get("/api/padel/places/:id/terrains", optionalAuth, async (req, res) => {
  try {
    const place = await getPadelPlace(req.params.id);
    if (!place) return res.status(404).json({ message: "Place not found" });
    const terrains = await listPadelTerrains(place.id);
    res.json({ terrains });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unable to list terrains" });
  }
});

app.get("/api/padel/places/:id", optionalAuth, async (req, res) => {
  try {
    const place = await getPadelPlace(req.params.id);
    if (!place) return res.status(404).json({ message: "Place not found" });
    const terrains = await listPadelTerrains(place.id);
    res.json({ place: { ...place, terrains } });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unable to get padel place" });
  }
});

app.get("/api/padel/terrains/:id", optionalAuth, async (req, res) => {
  try {
    const terrain = await getPadelTerrain(req.params.id);
    if (!terrain) return res.status(404).json({ message: "Terrain not found" });
    res.json({ terrain });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unable to get terrain" });
  }
});

app.post("/api/padel/reservations", requireAuth, async (req, res) => {
  try {
    const { courtId, reservationDate, startTime, durationMinutes = 90 } = req.body ?? {};
    if (!courtId || !reservationDate || !startTime) {
      return res.status(400).json({ message: "courtId, reservationDate, and startTime are required" });
    }
    const reservation = await createPadelReservation({
      userId: req.user.sub,
      courtId: Number(courtId),
      reservationDate,
      startTime,
      durationMinutes: Number(durationMinutes),
    });
    res.status(201).json({ reservation });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to create reservation" });
  }
});

// Live SmartPlay visual analysis
app.get("/api/live-sessions/health", (_req, res) => {
  res.json({
    ok: true,
    mounted: true,
    smartplayAiConfigured: Boolean(SMARTPLAY_AI_URL),
    mockEnabled: DEV_ENABLE_MOCK_LIVE,
  });
});

app.get("/api/live-sessions", requireAuth, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "User not found" });
    const sessions = await listLiveSessions({ actor, status: req.query.status ?? null });
    res.json({ sessions });
  } catch (error) {
    res.status(error.statusCode ?? 400).json({ message: error instanceof Error ? error.message : "Unable to load live sessions" });
  }
});

app.get("/api/live-sessions/:id", optionalAuth, async (req, res) => {
  try {
    const actor = req.user ? await attachActor(req) : null;
    const session = await getLiveSessionById(req.params.id);
    if (!session) return res.status(404).json({ message: "Live session not found" });
    if (!(await canViewLiveSession(actor, session))) return res.status(403).json({ message: "Live session access denied" });
    res.json({ session });
  } catch (error) {
    res.status(error.statusCode ?? 400).json({ message: error instanceof Error ? error.message : "Unable to load live session" });
  }
});

app.get("/api/live-sessions/:id/source-video", async (req, res) => {
  try {
    const token = String(req.query.token ?? "").trim();
    const header = req.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : "";
    const rawToken = bearer || token;
    if (!rawToken) return res.status(401).json({ message: "Authentication required" });

    try {
      req.user = jwt.verify(rawToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ message: "Invalid token" });
    }

    const actor = await attachActor(req);
    const session = await getLiveSessionById(req.params.id);
    if (!session) return res.status(404).json({ message: "Live session not found" });
    if (!(await canViewLiveSession(actor, session))) return res.status(403).json({ message: "Live session access denied" });
    const isFileDemo = session.cameraType === "file_demo" || session.mode === "file_demo" || session.mode === "local_demo";
    if (!isFileDemo) return res.status(400).json({ message: "Live source preview is only available for file_demo sessions." });

    let cameraUrl = session.cameraUrl;
    if (!cameraUrl) {
      const defaultSrc = process.env.SMARTPLAY_DEFAULT_FILE_DEMO_SOURCE;
      if (!defaultSrc) return res.status(404).json({ message: "No camera source is configured for this live session." });
      cameraUrl = defaultSrc;
    }

    // Resolve relative paths — try CWD, then workspace root (parent of Ultima_web), then smartplay_ai subdir
    if (!path.isAbsolute(cameraUrl)) {
      const candidates = [
        path.resolve(process.cwd(), cameraUrl),
        path.resolve(process.cwd(), "..", cameraUrl),
        path.resolve(process.cwd(), "..", "smartplay_ai", cameraUrl),
      ];
      const found = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
      cameraUrl = found ?? candidates[0];
    }

    return sendLocalVideoFile(res, cameraUrl, "Live source video file was not found.");
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load live source video." });
  }
});

app.get("/api/live-sessions/:id/rendered-stream", async (req, res) => {
  try {
    const token = String(req.query.token ?? "").trim();
    const header = req.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : "";
    const rawToken = bearer || token;
    if (!rawToken) return res.status(401).json({ message: "Authentication required" });

    try {
      req.user = jwt.verify(rawToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ message: "Invalid token" });
    }

    const actor = await attachActor(req);
    const session = await getLiveSessionById(req.params.id);
    if (!session) return res.status(404).json({ message: "Live session not found" });
    if (!(await canViewLiveSession(actor, session))) return res.status(403).json({ message: "Live session access denied" });
    if (!session.aiSessionId) return res.status(404).json({ message: "Rendered stream is not ready yet." });
    // Block only subprocess-based dev sessions (no real rendered MJPEG from FastAPI).
    // file_demo sessions that went through /live/start have a real aiSessionId like "live-N-abc".
    const devPrefixes = ["filedemo-", "mock-", "local-"];
    const isDevSession =
      ["mock", "local_demo"].includes(String(session.mode ?? "").toLowerCase()) ||
      (typeof session.aiSessionId === "string" && devPrefixes.some((p) => session.aiSessionId.startsWith(p)));
    if (isDevSession) return res.status(404).json({ message: "No rendered stream for this session type." });
    if (!SMARTPLAY_AI_URL) return sendSmartPlayNotConfigured(res);

    const response = await fetchSmartPlay(`/live/rendered/${encodeURIComponent(session.aiSessionId)}.mjpg`);
    if (!response.ok || !response.body) {
      return res.status(response.status || 502).json({ message: "Rendered live stream is not available." });
    }
    res.setHeader("content-type", response.headers.get("content-type") ?? "multipart/x-mixed-replace; boundary=frame");
    res.setHeader("cache-control", "no-store");
    return Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    return sendSmartPlayFetchError(res, error);
  }
});

app.post("/api/live-sessions", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "User not found" });
    const body = req.body ?? {};
    const session = await createLiveSession({ actor, mode: "real", ...body });
    res.status(201).json({ session });
  } catch (error) {
    res.status(error.statusCode ?? 400).json({ message: error instanceof Error ? error.message : "Unable to create live session" });
  }
});

app.post("/api/live-sessions/:id/start", requireAuth, async (req, res) => {
  let startingSessionId = null;
  try {
    const actor = await attachActor(req);
    const existing = await getLiveSessionById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Live session not found" });

    let mode = String(req.body?.mode ?? existing.mode ?? "real").trim().toLowerCase();
    // A file_demo camera can't run real AI — promote automatically so "Start Analysis" just works.
    if (mode === "real" && existing.cameraType === "file_demo") mode = "file_demo";
    const isDevMode = ["mock", "file_demo", "local_demo"].includes(mode);

    // Real sessions require arena admin; dev/demo sessions allow any authenticated user
    if (!isDevMode && !(await canManageLiveSession(actor, existing.arenaId))) {
      return res.status(403).json({ message: "Admin access required to start real live sessions." });
    }

    startingSessionId = existing.id;
    await updateLiveSessionStatus({ sessionId: existing.id, status: "starting", message: mode === "mock" ? "Starting mock visual stream." : "Starting SmartPlay AI live analysis." });

    if (mode === "mock") {
      if (!DEV_ENABLE_MOCK_LIVE) {
        return res.status(403).json({ message: "Mock live mode is disabled. Set DEV_ENABLE_MOCK_LIVE=1 for local development." });
      }
      await updateLiveSessionStatus({ sessionId: existing.id, status: "running", message: "Mock visual analysis running.", aiSessionId: `mock-${existing.id}` });
      startMockLiveSession(existing.id);
      if (io) emitLiveStatus(io, existing.id, { sessionId: existing.id, status: "running", message: "Mock visual analysis running." });
      return res.json({ session: await getLiveSessionById(existing.id), mock: true });
    }

    if (mode === "file_demo") {
      if (String(existing.mode ?? "").toLowerCase() !== "file_demo") {
        await patchLiveSession(existing.id, { mode: "file_demo" });
      }

      // Prefer FastAPI mode (full rendered MJPEG + callbacks) unless explicitly set to subprocess.
      // If FastAPI is starting up (auto-started at launch), wait up to 60s for it to be ready.
      const preferFastApi = SMARTPLAY_AI_URL && process.env.SMARTPLAY_FILE_DEMO_MODE !== "subprocess";
      if (preferFastApi) {
        if (io) emitLiveStatus(io, existing.id, { sessionId: existing.id, status: "starting", message: "Waiting for SmartPlay AI service…" });
        await tryStartFastApiService().catch(() => {});
        try {
          const session = await getLiveSessionById(existing.id);
          const result = await startRealLiveSession(session);
          return res.json({ ...result, file_demo: true });
        } catch (fastApiErr) {
          const msg = String(fastApiErr?.message ?? "").toLowerCase();
          const isNetworkError = fastApiErr instanceof TypeError ||
            msg.includes("fetch failed") ||
            msg.includes("econnrefused") ||
            fastApiErr?.name === "AbortError";
          if (!isNetworkError) throw fastApiErr; // real config error — propagate
          console.warn(`[file_demo:${existing.id}] FastAPI unavailable (${fastApiErr.message}); using subprocess fallback.`);
          // fall through to subprocess
        }
      }

      // ── Subprocess fallback ──────────────────────────────────────────────
      const aiSessionId = `filedemo-${existing.id}-${Date.now()}`;
      await updateLiveSessionStatus({
        sessionId: existing.id,
        status: "starting",
        message: "File demo subprocess starting…",
        aiSessionId,
      });
      if (io) emitLiveStatus(io, existing.id, { sessionId: existing.id, status: "starting", message: "File demo subprocess starting…" });
      try {
        startFileDemoProcess(existing.id);
      } catch (spawnErr) {
        await updateLiveSessionStatus({ sessionId: existing.id, status: "error", message: spawnErr.message }).catch(() => {});
        throw spawnErr;
      }
      const session = await getLiveSessionById(existing.id);
      return res.json({ session, file_demo: true, aiSessionId });
    }

    if (mode === "local_demo") {
      // Treat local_demo the same as file_demo — promote and auto-spawn.
      await patchLiveSession(existing.id, { mode: "file_demo" });
      const promoted = await getLiveSessionById(existing.id);
      mode = "file_demo";
      // Re-enter file_demo path via startRealLiveSession / subprocess (same as above).
      const preferFastApi2 = SMARTPLAY_AI_URL && process.env.SMARTPLAY_FILE_DEMO_MODE !== "subprocess";
      if (preferFastApi2) {
        if (io) emitLiveStatus(io, existing.id, { sessionId: existing.id, status: "starting", message: "Waiting for SmartPlay AI service…" });
        await tryStartFastApiService().catch(() => {});
        try {
          const result = await startRealLiveSession(promoted);
          return res.json({ ...result, file_demo: true });
        } catch (err2) {
          const msg2 = String(err2?.message ?? "").toLowerCase();
          const isNet = err2 instanceof TypeError || msg2.includes("fetch failed") || msg2.includes("econnrefused") || err2?.name === "AbortError";
          if (!isNet) throw err2;
          console.warn(`[local_demo→file_demo:${existing.id}] FastAPI unavailable; using subprocess.`);
        }
      }
      const localAiSessionId = `filedemo-${existing.id}-${Date.now()}`;
      await updateLiveSessionStatus({ sessionId: existing.id, status: "starting", message: "File demo subprocess starting…", aiSessionId: localAiSessionId });
      if (io) emitLiveStatus(io, existing.id, { sessionId: existing.id, status: "starting", message: "File demo subprocess starting…" });
      try { startFileDemoProcess(existing.id); } catch (e) {
        await updateLiveSessionStatus({ sessionId: existing.id, status: "error", message: e.message }).catch(() => {});
        throw e;
      }
      const promotedSession = await getLiveSessionById(existing.id);
      return res.json({ session: promotedSession, file_demo: true, aiSessionId: localAiSessionId });
    }

    const result = await startRealLiveSession(existing);
    res.json(result);
  } catch (error) {
    if (startingSessionId) {
      await updateLiveSessionStatus({
        sessionId: startingSessionId,
        status: "error",
        message: error instanceof Error ? error.message : "Unable to start live session",
      }).catch(() => {});
    }
    res.status(error.statusCode ?? 400).json(error.body ?? { message: error instanceof Error ? error.message : "Unable to start live session" });
  }
});

app.post("/api/live-sessions/:id/stop", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    const existing = await getLiveSessionById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Live session not found" });
    if (!(await canManageLiveSession(actor, existing.arenaId))) return res.status(403).json({ message: "Admin access denied" });
    res.json({ session: await stopLiveSession(existing) });
  } catch (error) {
    res.status(error.statusCode ?? 400).json({ message: error instanceof Error ? error.message : "Unable to stop live session" });
  }
});

app.delete("/api/live-sessions/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    const existing = await getLiveSessionById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Live session not found" });
    if (!(await canManageLiveSession(actor, existing.arenaId))) return res.status(403).json({ message: "Access denied" });
    if (existing.status === "running" || existing.status === "starting") {
      await stopLiveSession(existing).catch(() => {});
    }
    await deleteLiveSession(existing.id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to delete live session" });
  }
});

app.patch("/api/live-sessions/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    const existing = await getLiveSessionById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Live session not found" });
    if (!(await canManageLiveSession(actor, existing.arenaId))) return res.status(403).json({ message: "Access denied" });
    const { mode, courtId } = req.body ?? {};
    if (mode === undefined && courtId === undefined) return res.status(400).json({ message: "Nothing to update" });
    await patchLiveSession(existing.id, { mode, courtId });
    res.json({ session: await getLiveSessionById(existing.id) });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to update live session" });
  }
});

app.get("/api/live-sessions/:id/status", optionalAuth, async (req, res) => {
  try {
    const actor = req.user ? await attachActor(req) : null;
    const session = await getLiveSessionById(req.params.id);
    if (!session) return res.status(404).json({ message: "Live session not found" });
    if (!(await canViewLiveSession(actor, session))) return res.status(403).json({ message: "Live session access denied" });
    res.json({ status: session.status, fps: session.fps, lastFrame: session.lastFrame, lastUpdateAt: session.lastUpdateAt, message: session.aiStatusMessage });
  } catch (error) {
    res.status(error.statusCode ?? 400).json({ message: error instanceof Error ? error.message : "Unable to load live status" });
  }
});

app.get("/api/live-sessions/:id/latest-update", optionalAuth, async (req, res) => {
  try {
    const actor = req.user ? await attachActor(req) : null;
    const session = await getLiveSessionById(req.params.id);
    if (!session) return res.status(404).json({ message: "Live session not found" });
    if (!(await canViewLiveSession(actor, session))) return res.status(403).json({ message: "Live session access denied" });
    res.json({ update: await getLatestLiveUpdate(req.params.id) });
  } catch (error) {
    res.status(error.statusCode ?? 400).json({ message: error instanceof Error ? error.message : "Unable to load latest live update" });
  }
});

app.get("/api/courts/:courtId/cameras", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    const { cameras } = await listCourtCameras(req.params.courtId, actor);
    res.json({ cameras });
  } catch (error) {
    res.status(error.statusCode ?? 400).json({ message: error instanceof Error ? error.message : "Unable to load cameras" });
  }
});

app.post("/api/courts/:courtId/cameras", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    const camera = await createCourtCamera({ courtId: req.params.courtId, actor, ...(req.body ?? {}) });
    res.status(201).json({ camera });
  } catch (error) {
    res.status(error.statusCode ?? 400).json({ message: error instanceof Error ? error.message : "Unable to create camera" });
  }
});

app.get("/api/courts/:courtId/calibration", requireAuth, requireAdmin, async (req, res) => {
  try {
    const calibration = await getCourtLiveCalibration(req.params.courtId, req.query.cameraId ?? null);
    res.json({ calibration });
  } catch (error) {
    res.status(error.statusCode ?? 400).json({ message: error instanceof Error ? error.message : "Unable to load calibration" });
  }
});

app.post("/api/courts/:courtId/calibration", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    const calibration = await saveCourtLiveCalibration({ courtId: req.params.courtId, actor, ...(req.body ?? {}) });
    res.status(201).json({ calibration });
  } catch (error) {
    res.status(error.statusCode ?? 400).json({ message: error instanceof Error ? error.message : "Unable to save calibration" });
  }
});

app.post("/api/smartplay/live/:sessionId/update", requireSmartPlayCallback, async (req, res) => {
  try {
    const session = await recordLiveUpdate({ sessionId: req.params.sessionId, payload: req.body ?? {}, sample: Boolean(req.body?.sample) });
    if (io) emitLiveUpdate(io, req.params.sessionId, { sessionId: Number(req.params.sessionId), ...(req.body ?? {}) });
    res.json({ ok: true, session });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to accept live update" });
  }
});

app.post("/api/smartplay/live/:sessionId/status", requireSmartPlayCallback, async (req, res) => {
  try {
    const status = String(req.body?.status ?? "running");
    const message = req.body?.message ? String(req.body.message) : null;
    const session = await updateLiveSessionStatus({ sessionId: req.params.sessionId, status, message, aiSessionId: req.body?.aiSessionId ?? req.body?.ai_session_id ?? null });
    if (io) emitLiveStatus(io, req.params.sessionId, { sessionId: Number(req.params.sessionId), status, message });
    res.json({ ok: true, session });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to accept live status" });
  }
});

app.post("/api/smartplay/live/:sessionId/error", requireSmartPlayCallback, async (req, res) => {
  try {
    const message = req.body?.message ? String(req.body.message) : "SmartPlay AI live analysis error.";
    const session = await updateLiveSessionStatus({ sessionId: req.params.sessionId, status: "error", message });
    if (io) io.to(liveRoom(req.params.sessionId)).emit("live:error", { sessionId: Number(req.params.sessionId), message, detail: req.body ?? {} });
    res.json({ ok: true, session });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to accept live error" });
  }
});

async function tickReservationLiveAnalysis() {
  const toStop = await listLiveSessionsNeedingStop();
  for (const row of toStop) {
    const session = await getLiveSessionById(row.id);
    if (session) {
      await stopLiveSession(session, "Reservation ended. Live analysis stopped.");
    }
  }

  const reservations = await listReservationsNeedingLiveStart();
  for (const reservation of reservations) {
    try {
      const camera = await getActiveCourtCamera(reservation.court_id);
      if (!camera) throw new Error(`No active live camera configured for court ${reservation.court_id}`);
      const players = await listReservationLivePlayers(reservation.id);
      const session = await createSystemLiveSessionForReservation({ reservation, camera, players });
      await startRealLiveSession(session);
      console.log(`[live-reservation] started session ${session.id} for reservation ${reservation.id}`);
    } catch (error) {
      console.error("[live-reservation] auto-start failed:", error instanceof Error ? error.message : error);
    }
  }
}

// Socket.IO connection handler — io is initialised after DB init above
// The new initSocketIO already calls setupChannels() which handles live:join/leave
// and other channel subscriptions. We wire the legacy initial scores push here.
if (io) {
  io.on("connection", async (socket) => {
    try {
      socket.emit("scores:update", { matches: await listMatches() });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Unable to push initial live scores:", error);
    }
  });
}

// ── Smart Scoring ────────────────────────────────────────────────────────────

app.get("/api/matches/:id/score", optionalAuth, async (req, res) => {
  try {
    const score = await getMatchScore(Number(req.params.id));
    if (!score) return res.status(404).json({ message: "Match not found" });
    res.json({ score });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load score" });
  }
});

app.patch("/api/matches/:id/score", requireAuth, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "User not found" });
    const role = actor.effective_role ?? actor.role;
    const isAdmin = ["admin", "super_admin"].includes(role);
    const isCoach = role === "coach";
    if (!isAdmin && !isCoach) {
      return res.status(403).json({ message: "Admins and coaches only" });
    }
    if (isCoach) {
      const { default: pgPool } = await import("./pg-pool.mjs");
      const { rows } = await pgPool.query(
        `SELECT r.arena_id FROM reservations r
         JOIN matches m ON m.reservation_id = r.id
         WHERE m.id = $1`,
        [Number(req.params.id)]
      );
      if (!rows.length || Number(rows[0].arena_id) !== Number(actor.arena_id)) {
        return res.status(403).json({ message: "Coaches can only edit scores for matches in their arena" });
      }
    }
    const { score1, score2, status, reason } = req.body ?? {};
    const updated = await updateMatchScore({
      matchId: Number(req.params.id),
      score1,
      score2,
      status,
      actorId: actor.id,
      actorRole: role,
      reason,
    });
    if (io) emitScoresUpdate(io, { matches: await listMatches() });
    res.json({ score: updated });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to update score" });
  }
});

app.get("/api/matches/:id/score-events", optionalAuth, async (req, res) => {
  try {
    const events = await getScoreEvents(Number(req.params.id), Number(req.query.limit ?? 50));
    res.json({ events });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load events" });
  }
});

app.post("/api/matches/:id/score-events", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { eventType, playerName, team, setNumber, source, confidence, metadata } = req.body ?? {};
    const event = await createScoreEvent({
      matchId: Number(req.params.id),
      eventType,
      playerName,
      team,
      setNumber,
      source,
      confidence,
      metadata,
    });
    res.status(201).json({ event });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to create event" });
  }
});

app.get("/api/matches/:id/score-corrections", requireAuth, requireAdmin, async (req, res) => {
  try {
    const logs = await getScoreCorrectionLogs(Number(req.params.id));
    res.json({ logs });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load correction logs" });
  }
});

app.get("/api/admin/scoring", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "User not found" });
    let matches = [];
    try {
      matches = await listScoringMatches(actor, 50);
    } catch (error) {
      console.warn("[admin/scoring] scoring matches unavailable:", error?.message ?? error);
    }
    let recentActivity = [];
    try {
      recentActivity = await getRecentScoreActivity(10);
    } catch (error) {
      console.warn("[admin/scoring] recent score activity unavailable:", error?.message ?? error);
    }
    res.json({ matches, recentActivity });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load scoring data" });
  }
});

// ── Player Analytics ──────────────────────────────────────────────────────────

app.get("/api/player/stats", requireAuth, async (req, res) => {
  try {
    const stats = await getPlayerStats(req.user.sub);
    res.json({ stats });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load player stats" });
  }
});

app.get("/api/player/history/matches", requireAuth, async (req, res) => {
  try {
    const matches = await getPlayerMatchHistory(req.user.sub, Number(req.query.limit ?? 20));
    res.json({ matches });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load match history" });
  }
});

app.get("/api/player/history/reservations", requireAuth, async (req, res) => {
  try {
    const reservations = await getPlayerReservationHistory(req.user.sub, Number(req.query.limit ?? 20));
    res.json({ reservations });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load reservation history" });
  }
});

app.get("/api/player/history/competitions", requireAuth, async (req, res) => {
  try {
    const competitions = await getPlayerCompetitionHistory(req.user.sub);
    res.json({ competitions });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load competition history" });
  }
});

app.get("/api/player/ai-analysis", requireAuth, async (req, res) => {
  try {
    const data = await getPlayerAiAnalysis(req.user.sub);
    res.json(data);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load AI analysis" });
  }
});

app.get("/api/admin/platform-stats", requireAuth, requireAdmin, async (req, res) => {
  try {
    const stats = await getPlatformStats();
    res.json({ stats });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load platform stats" });
  }
});

app.get("/api/admin/revenue", requireAuth, requireAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    const arenaId = actor?.platform_role === "super_admin" ? null : (actor?.arena_id ?? null);
    const revenue = await getRevenueSummary(arenaId);
    res.json(revenue);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load revenue" });
  }
});

// ── SmartPlay AI Placeholder ──────────────────────────────────────────────────

app.get("/api/smartplay/status", async (_req, res) => {
  try {
    const status = await getSmartPlayStatus();
    res.json(status);
  } catch {
    res.json({ connected: false, message: "Unable to check AI service status." });
  }
});

const smartplayUploadTempDir = path.join(uploadsDir, "smartplay", "_tmp");
fs.mkdirSync(smartplayUploadTempDir, { recursive: true });

const uploadSmartPlayClip = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, smartplayUploadTempDir),
    filename: (_req, file, cb) => {
      const safeName = String(file.originalname ?? "clip.mp4").replace(/[^a-zA-Z0-9._-]/g, "-");
      cb(null, `${Date.now()}-${randomUUID()}-${safeName}`);
    },
  }),
  limits: {
    fileSize: SMARTPLAY_CLIP_UPLOAD_MB * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (String(file.mimetype ?? "").startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "Only video uploads are allowed"));
    }
  },
});

app.post("/api/smartplay/clips/upload", requireAuth, requireAdmin, uploadSmartPlayClip.array("clips", 6), async (req, res) => {
  const uploadedFiles = Array.isArray(req.files) ? req.files : [];
  if (!uploadedFiles.length) return res.status(400).json({ message: "No video clips uploaded." });

  const actor = await attachActor(req);
  if (!actor) return res.status(401).json({ message: "User not found" });

  const matchIdRaw = String(req.body?.match_id ?? "").trim();
  const cameraId = safePathSegment(req.body?.camera_id ?? "camera_01", "camera_01");
  const sportType = String(req.body?.sport_type ?? "padel").trim().toLowerCase() || "padel";
  const numericMatchId = /^\d+$/.test(matchIdRaw) ? Number(matchIdRaw) : null;
  const externalMatchKey = numericMatchId ? null : (matchIdRaw || null);
  const courtId = req.body?.court_id ? Number(req.body.court_id) : null;

  // Parse assigned_player_ids (JSON array string from FormData)
  let assignedPlayerIds = [];
  try {
    const rawIds = req.body?.assigned_player_ids;
    if (typeof rawIds === "string" && rawIds.trim().startsWith("[")) {
      assignedPlayerIds = JSON.parse(rawIds).map(Number).filter(Number.isFinite);
    } else if (Array.isArray(rawIds)) {
      assignedPlayerIds = rawIds.map(Number).filter(Number.isFinite);
    }
  } catch { /* ignore parse errors */ }

  // primary player: explicit field or first from assigned list
  const playerUserId = Number(req.body?.player_user_id ?? assignedPlayerIds[0] ?? 0);

  if (!playerUserId && !assignedPlayerIds.length) {
    return res.status(400).json({ message: "At least one player must be assigned." });
  }

  const clips = [];
  try {
    for (const file of uploadedFiles) {
      const tempClip = await createAiUploadedClip({
        matchId: numericMatchId,
        externalMatchKey,
        playerUserId,
        uploadedByUserId: actor.id,
        cameraId,
        sportType,
        originalFilename: file.originalname,
        storedVideoPath: file.path,
        status: "awaiting_court_annotation",
        courtId,
        assignedPlayerIds,
      });
      const finalDir = path.join(
        uploadsDir,
        "smartplay",
        "matches",
        safePathSegment(matchIdRaw || tempClip.id, "match"),
        "players",
        safePathSegment(playerUserId, "player"),
        `clip_${tempClip.id}`
      );
      await fs.promises.mkdir(finalDir, { recursive: true });
      const finalPath = path.join(finalDir, `original${path.extname(file.originalname || "") || ".mp4"}`);
      await fs.promises.rename(file.path, finalPath);
      const storedVideoPath = path.relative(process.cwd(), finalPath).replace(/\\/g, "/");
      const previewPath = smartplayClipPreviewPath(storedVideoPath);
      const previewResult = await createBrowserPreviewVideo(path.resolve(storedVideoPath), path.resolve(previewPath));
      if (!previewResult.created && previewResult.reason !== "disabled") {
        console.warn(`[smartplay/upload] browser preview was not generated for clip ${tempClip.id}: ${previewResult.reason}`);
      }
      const clip = await updateAiUploadedClipStorage(tempClip.id, storedVideoPath);
      // If this clip has a court_id with an active calibration, auto-resolve homography
      let autoHomographyPath = null;
      if (courtId) {
        const calib = await getActiveCalibrationForCourt(courtId);
        if (calib?.homography_matrix) {
          const homographyDir = path.join(uploadsDir, "homography");
          await fs.promises.mkdir(homographyDir, { recursive: true });
          // Write as .json — ball detector, finalize, and viz render all accept JSON
          const jsonPath = path.join(homographyDir, `court_${courtId}.json`);
          fs.writeFileSync(jsonPath, JSON.stringify({ homography_matrix: calib.homography_matrix }));
          autoHomographyPath = jsonPath;
        }
      }

      const jobStatus = autoHomographyPath ? "court_annotation_done" : "awaiting_court_annotation";
      if (autoHomographyPath) {
        await updateAiUploadedClipStatus(clip.id, "court_annotation_done");
      }
      await createOrUpdateAiClipJob({
        clipId: clip.id,
        status: jobStatus,
        currentStep: "court_annotation",
        inputVideoPath: storedVideoPath,
        homographyPath: autoHomographyPath,
      });
      clips.push(smartplayClipPayload(clip));
    }
    return res.status(201).json({ clips });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Unable to upload SmartPlay clips." });
  }
});

app.use("/api/smartplay/clips/upload", (error, _req, res, next) => {
  if (!error) return next();
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        message: `SmartPlay clip is too large. Current limit is ${SMARTPLAY_CLIP_UPLOAD_MB} MB. Increase SMARTPLAY_CLIP_UPLOAD_MB in .env if needed.`,
      });
    }
    return res.status(400).json({ message: error.message });
  }
  return next(error);
});

app.get("/api/smartplay/clips", requireAuth, requireAdmin, async (req, res) => {
  try {
    const clips = await listAiUploadedClips({
      matchId: req.query.match_id ? Number(req.query.match_id) : null,
      playerUserId: req.query.player_user_id ? Number(req.query.player_user_id) : null,
      status: req.query.status ? String(req.query.status) : null,
    });
    res.json({ clips: clips.map(smartplayClipPayload) });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load SmartPlay clips." });
  }
});

app.get("/api/smartplay/clips/:clipId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const details = await getAiClipDetails(req.params.clipId);
    if (!details) return res.status(404).json({ message: "Clip not found." });
    res.json({ ...details, clip: smartplayClipPayload(details.clip) });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load SmartPlay clip." });
  }
});

app.post("/api/smartplay/clips/:clipId/generate-preview", requireAuth, requireAdmin, async (req, res) => {
  try {
    const details = await getAiClipDetails(req.params.clipId);
    if (!details) return res.status(404).json({ message: "Clip not found." });

    const inputPath = path.resolve(details.clip.storedVideoPath);
    if (!fs.existsSync(inputPath)) {
      return res.status(404).json({ message: `Original video file not found: ${inputPath}` });
    }

    const previewPath = smartplayClipPreviewPath(details.clip.storedVideoPath);
    const previewResult = await createBrowserPreviewVideo(inputPath, path.resolve(previewPath));
    if (!previewResult.created) {
      return res.status(503).json({
        message: previewResult.reason === "ffmpeg_not_found"
          ? "ffmpeg is not installed or FFMPEG_PATH is not pointing to ffmpeg."
          : "Unable to generate browser preview.",
        detail: previewResult.reason,
      });
    }

    res.json({ clip: smartplayClipPayload(details.clip) });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to generate browser preview." });
  }
});

app.post("/api/smartplay/clips/:clipId/start-court-annotation", requireAuth, requireAdmin, async (req, res) => {
  try {
    const details = await getAiClipDetails(req.params.clipId);
    if (!details) return res.status(404).json({ message: "Clip not found." });
    const outputJsonl = path.resolve(path.join(path.dirname(details.clip.storedVideoPath), "court_keypoints.jsonl"));
    await updateAiUploadedClipStatus(details.clip.id, "awaiting_court_annotation");
    await createOrUpdateAiClipJob({
      clipId: details.clip.id,
      status: "awaiting_court_annotation",
      currentStep: "court_annotation",
      inputVideoPath: details.clip.storedVideoPath,
    });
    res.json({
      status: "awaiting_court_annotation",
      videoPath: path.resolve(details.clip.storedVideoPath),
      suggestedOutputJsonl: outputJsonl,
      command: smartplayAnnotationCommand(details.clip, outputJsonl),
      note: "Run the annotation command locally, export/prepare homography, then confirm the homography path.",
    });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to start annotation workflow." });
  }
});

app.post("/api/smartplay/clips/:clipId/confirm-homography", requireAuth, requireAdmin, async (req, res) => {
  try {
    const details = await getAiClipDetails(req.params.clipId);
    if (!details) return res.status(404).json({ message: "Clip not found." });
    const homographyPath = String(req.body?.homography_path ?? "").trim();
    if (!homographyPath) return res.status(400).json({ message: "homography_path is required." });
    const resolved = path.isAbsolute(homographyPath) ? homographyPath : path.resolve(homographyPath);
    if (!fs.existsSync(resolved)) return res.status(400).json({ message: `Homography file not found: ${resolved}` });
    if (!fs.statSync(resolved).isFile()) return res.status(400).json({ message: `Homography path must point to a file, not a folder: ${resolved}` });
    if (!isSupportedHomographyFile(resolved)) return res.status(400).json({ message: "Homography file must be .json, .npy, or .npz." });
    const clip = await updateAiUploadedClipStatus(details.clip.id, "court_annotation_done");
    const job = await createOrUpdateAiClipJob({
      clipId: details.clip.id,
      status: "court_annotation_done",
      currentStep: "court_annotation",
      inputVideoPath: details.clip.storedVideoPath,
      homographyPath: resolved,
      courtSurfacesPath: req.body?.court_surfaces_path ? String(req.body.court_surfaces_path) : null,
    });
    res.json({ clip, job });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to confirm homography." });
  }
});

app.post("/api/smartplay/clips/:clipId/process", requireAuth, requireAdmin, async (req, res) => {
  if (!SMARTPLAY_AI_URL) return sendSmartPlayNotConfigured(res);
  try {
    const details = await getAiClipDetails(req.params.clipId);
    if (!details) return res.status(404).json({ message: "Clip not found." });
    if (!details.job?.homographyPath) return res.status(400).json({ message: "Confirm homography before processing this clip." });
    const homographyPath = path.resolve(details.job.homographyPath);
    if (!fs.existsSync(homographyPath)) return res.status(400).json({ message: `Homography file not found: ${homographyPath}` });
    if (!fs.statSync(homographyPath).isFile()) return res.status(400).json({ message: `Homography path must point to a file, not a folder: ${homographyPath}` });
    if (!isSupportedHomographyFile(homographyPath)) return res.status(400).json({ message: "Homography file must be .json, .npy, or .npz." });

    const outputRoot = path.resolve("..", "smartplay_ai", "data", "processed", "smartplay_clips", `match_${details.clip.matchId ?? details.clip.externalMatchKey ?? "demo"}`, `player_${details.clip.playerUserId}`, `clip_${details.clip.id}`);
    const payload = {
      clip_id: String(details.clip.id),
      match_id: String(details.clip.externalMatchKey ?? details.clip.matchId ?? `clip_${details.clip.id}`),
      player_user_id: String(details.clip.playerUserId),
      camera_id: details.clip.cameraId,
      video_path: path.resolve(details.clip.storedVideoPath),
      homography_path: homographyPath,
      output_root: outputRoot,
      sport_type: String(details.clip.sportType ?? "padel"),
      render_debug: Boolean(req.body?.render_debug ?? true),
      max_frames: req.body?.max_frames ?? null,
    };
    let response;
    let body;
    try {
      const result = await callSmartPlayJson("/jobs/clip-full-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      response = result.response;
      body = result.body;
    } catch (error) {
      return sendSmartPlayFetchError(res, error);
    }
    if (!response.ok) return res.status(response.status).json(body ?? {});
    const job = await createOrUpdateAiClipJob({
      clipId: details.clip.id,
      externalJobId: body?.job_id ?? null,
      status: body?.status ?? "queued",
      currentStep: body?.current_step ?? "upload",
      aiServiceUrl: SMARTPLAY_AI_URL,
      inputVideoPath: details.clip.storedVideoPath,
      homographyPath: details.job.homographyPath,
      scoringOutDir: `${outputRoot.replace(/\\/g, "/")}/scoring_v2`,
      renderedVideoPath: `${outputRoot.replace(/\\/g, "/")}/rendered/scoring_v2_debug_with_frame_counter.mp4`,
    });
    await updateAiUploadedClipStatus(details.clip.id, "processing");
    res.status(response.status).json({ ...body, job });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to start clip processing." });
  }
});

app.get("/api/smartplay/clips/:clipId/job", requireAuth, requireAdmin, async (req, res) => {
  let details = null;
  try {
    details = await getAiClipDetails(req.params.clipId);
    if (!details) return res.status(404).json({ message: "Clip not found." });
    if (!details.job?.externalJobId || !SMARTPLAY_AI_URL) return res.json({ job: details.job });
    let response;
    let body;
    try {
      const result = await callSmartPlayJson(`/jobs/${encodeURIComponent(details.job.externalJobId)}`);
      response = result.response;
      body = result.body;
    } catch (error) {
      return res.json({
        job: details.job,
        aiServiceAvailable: false,
        warning: error instanceof Error ? error.message : "SmartPlay AI service is unavailable.",
      });
    }
    if (!response.ok) {
      return res.json({
        job: details.job,
        aiServiceAvailable: true,
        warning: body?.message ?? body?.detail ?? `SmartPlay AI returned ${response.status}.`,
      });
    }
    const outputPaths = body?.output_paths ?? {};
    const job = await createOrUpdateAiClipJob({
      clipId: details.clip.id,
      externalJobId: body?.job_id ?? details.job.externalJobId,
      status: body?.status ?? details.job.status,
      currentStep: body?.current_step ?? details.job.currentStep,
      errorMessage: body?.error_message ?? null,
      startedAt: body?.started_at ?? null,
      finishedAt: body?.finished_at ?? null,
      ballTracksPath: outputPaths.ball_track_parquet ?? null,
      playerTracksPath: outputPaths.player_tracks_parquet ?? null,
      scoringOutDir: outputPaths.scoring_out_dir ?? null,
      renderedVideoPath: outputPaths.rendered_video_path ?? null,
    });
    if (body?.status === "done") {
      await updateAiUploadedClipStatus(details.clip.id, "done");
      try {
        const eventsResponse = await callSmartPlayJson(`/clips/${details.clip.id}/events`);
        if (eventsResponse.response.ok && Array.isArray(eventsResponse.body?.events)) {
          await saveAiClipEvents({ clipId: details.clip.id, externalJobId: body.job_id, events: eventsResponse.body.events });
        }
      } catch (error) {
        console.warn("[smartplay/clip-job] unable to persist clip events:", error?.message ?? error);
      }
    } else if (body?.status === "failed") {
      await updateAiUploadedClipStatus(details.clip.id, "failed");
    }
    res.json({ ...body, job });
  } catch (error) {
    console.warn("[smartplay/clip-job] returning stored job after refresh error:", error?.message ?? error);
    res.json({
      job: details?.job ?? null,
      aiServiceAvailable: false,
      warning: error instanceof Error ? error.message : "Unable to refresh SmartPlay job.",
    });
  }
});

app.post("/api/smartplay/clips/:clipId/cancel", requireAuth, requireAdmin, async (req, res) => {
  try {
    const details = await getAiClipDetails(req.params.clipId);
    if (!details) return res.status(404).json({ message: "Clip not found." });
    if (!details.job?.externalJobId) {
      await updateAiUploadedClipStatus(details.clip.id, "canceled");
      const job = await createOrUpdateAiClipJob({
        clipId: details.clip.id,
        status: "canceled",
        currentStep: "canceled",
        errorMessage: "Canceled before SmartPlay AI job started",
        finishedAt: new Date().toISOString(),
      });
      return res.json({ job, canceled: true });
    }

    if (SMARTPLAY_AI_URL) {
      try {
        const { response, body } = await callSmartPlayJson(`/jobs/${encodeURIComponent(details.job.externalJobId)}/cancel`, {
          method: "POST",
        });
        if (!response.ok) {
          // 404/410 means the job is already gone on the AI side — treat as success and cancel locally
          if (response.status === 404 || response.status === 410) {
            console.info(`[smartplay/cancel] AI job ${details.job.externalJobId} not found (${response.status}); marking canceled locally.`);
          } else {
            return res.status(response.status).json(body ?? { message: "Unable to cancel SmartPlay AI job." });
          }
        }
      } catch (error) {
        console.warn("[smartplay/cancel] AI service cancel failed; marking local job canceled:", error?.message ?? error);
      }
    }

    await updateAiUploadedClipStatus(details.clip.id, "canceled");
    const job = await createOrUpdateAiClipJob({
      clipId: details.clip.id,
      externalJobId: details.job.externalJobId,
      status: "canceled",
      currentStep: "canceled",
      errorMessage: "Job canceled",
      finishedAt: new Date().toISOString(),
    });
    res.json({ job, canceled: true });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to cancel SmartPlay job." });
  }
});

app.get("/api/smartplay/clips/:clipId/events", requireAuth, requireAdmin, async (req, res) => {
  try {
    const details = await getAiClipDetails(req.params.clipId);
    if (!details) return res.status(404).json({ message: "Clip not found." });
    if (details.events.length) return res.json({ clipId: details.clip.id, source: "postgres", events: details.events });
    if (details.job?.externalJobId && SMARTPLAY_AI_URL) {
      const { response, body } = await callSmartPlayJson(`/clips/${details.clip.id}/events`);
      if (response.ok && Array.isArray(body?.events)) {
        await saveAiClipEvents({ clipId: details.clip.id, externalJobId: details.job.externalJobId, events: body.events });
      }
      return res.status(response.status).json(body ?? {});
    }
    return res.json({ clipId: details.clip.id, events: [] });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load clip events." });
  }
});

app.get("/api/smartplay/clips/:clipId/rendered-video", requireAuth, requireAdmin, async (req, res) => {
  const details = await getAiClipDetails(req.params.clipId);
  if (!details) return res.status(404).json({ message: "Clip not found." });
  if (details.job?.renderedVideoPath && fs.existsSync(path.resolve(details.job.renderedVideoPath))) {
    return sendLocalVideoFile(res, details.job.renderedVideoPath, "Rendered SmartPlay clip not available.");
  }
  if (!details.job?.externalJobId) {
    return res.status(404).json({ message: "Rendered video is not available yet. Start processing and wait for the job to finish." });
  }
  return proxySmartPlayVideo(res, `/clips/${encodeURIComponent(req.params.clipId)}/rendered-video`, "Rendered SmartPlay clip not available.");
});

// ── Delete clip (soft delete) ────────────────────────────────────────────────
app.delete("/api/smartplay/clips/:clipId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const details = await getAiClipDetails(req.params.clipId);
    if (!details) return res.status(404).json({ message: "Clip not found." });
    await deleteAiUploadedClip(details.clip.id);
    res.json({ deleted: true });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to delete clip." });
  }
});

app.post("/api/smartplay/clips/:clipId/share-with-players", requireAuth, requireAdmin, async (req, res) => {
  try {
    const details = await getAiClipDetails(req.params.clipId);
    if (!details) return res.status(404).json({ message: "Clip not found." });
    if (details.clip.status !== "done") return res.status(400).json({ message: "Clip must be fully processed before sharing." });
    const result = await shareClipWithPlayers(details.clip.id, req.user.sub, { createNotification });
    res.json({ ...result, message: `Shared with ${result.shared} player(s).` });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to share clip." });
  }
});

app.get("/api/smartplay/my-clips", requireAuth, async (req, res) => {
  try {
    const clips = await listMySmartPlayClips(req.user.sub);
    res.json({ clips });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load your clips." });
  }
});

app.get("/api/smartplay/my-clips/:clipId/rendered-video", requireAuth, async (req, res) => {
  try {
    const details = await getAiClipDetails(req.params.clipId);
    if (!details?.clip) return res.status(404).json({ message: "Clip not found." });
    const assignedIds = Array.isArray(details.clip.assignedPlayerIds) ? details.clip.assignedPlayerIds.map(Number) : [];
    if (details.clip.playerUserId !== Number(req.user.sub) && !assignedIds.includes(Number(req.user.sub))) {
      return res.status(403).json({ message: "Not authorized." });
    }
    const videoPath = details.job?.renderedVideoPath;
    if (!videoPath) return res.status(404).json({ message: "Rendered video not available yet." });
    return sendLocalVideoFile(res, videoPath, "Rendered video file not found on server.");
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : "Unable to load video." });
  }
});

// ── Court calibration frame upload middleware ────────────────────────────────
const calibrationFrameDir = path.join(uploadsDir, "calibration_frames");
fs.mkdirSync(calibrationFrameDir, { recursive: true });

const uploadCalibrationFrame = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, calibrationFrameDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || ".jpg").toLowerCase() || ".jpg";
      cb(null, `frame_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /image\/(jpeg|png|webp|bmp)/.test(file.mimetype);
    cb(ok ? null : new Error("Only image files are allowed for calibration frames."), ok);
  },
});

// ── Court calibrations API ───────────────────────────────────────────────────

app.get("/api/admin/courts-with-calibrations", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { default: pgPool } = await import("./pg-pool.mjs");
    const email = req.user?.email;
    // Resolve arena_id via PostgreSQL arena_memberships (arena admins)
    const { rows: memberRows } = await pgPool.query(
      `SELECT am.arena_id FROM arena_memberships am
       JOIN users u ON u.id = am.user_id
       WHERE u.email = $1 AND am.status = 'active'
       LIMIT 1`,
      [email]
    );
    const arenaId = memberRows[0]?.arena_id ?? null;
    const courts = await listCourtsWithCalibrations(arenaId);
    res.json({ courts });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load courts." });
  }
});

app.get("/api/admin/court-calibrations/:courtId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const calibrations = await listCourtCalibrations(req.params.courtId);
    res.json({ calibrations });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load calibrations." });
  }
});

app.post("/api/admin/court-calibrations/:courtId", requireAuth, requireAdmin, uploadCalibrationFrame.single("frame"), async (req, res) => {
  try {
    const actor = await attachActor(req);
    const courtId = Number(req.params.courtId);
    const sportType = String(req.body?.sport_type ?? "padel").trim().toLowerCase() || "padel";
    // Resolve arena_id from PostgreSQL arena_memberships
    let arenaId = null;
    if (req.user?.email) {
      const { default: pgPool } = await import("./pg-pool.mjs");
      const { rows: m } = await pgPool.query(
        `SELECT am.arena_id FROM arena_memberships am JOIN users u ON u.id = am.user_id
         WHERE u.email = $1 AND am.status = 'active' LIMIT 1`,
        [req.user.email]
      );
      arenaId = m[0]?.arena_id ?? null;
      if (!arenaId) {
        // Derive from court's own arena
        const { rows: cr } = await pgPool.query("SELECT arena_id FROM courts WHERE id = $1", [courtId]);
        arenaId = cr[0]?.arena_id ?? null;
      }
    }
    let imagePath = null;
    if (req.file) {
      imagePath = path.relative(process.cwd(), req.file.path).replace(/\\/g, "/");
    }
    const calib = await createCourtCalibration({
      courtId,
      arenaId,
      sportType,
      calibrationImagePath: imagePath,
      createdByUserId: actor?.id ?? null,
    });
    res.status(201).json({ calibration: calib });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to create calibration." });
  }
});

app.patch("/api/admin/court-calibrations/:calibId/keypoints", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { image_points, world_points, keypoint_labels } = req.body ?? {};
    if (!Array.isArray(image_points) || !Array.isArray(world_points)) {
      return res.status(400).json({ message: "image_points and world_points are required arrays." });
    }
    if (image_points.length < 4 || image_points.length !== world_points.length) {
      return res.status(400).json({ message: "Need at least 4 matching point pairs." });
    }

    // Compute homography via Python DLT helper
    let homographyMatrix = null;
    const helperPath = path.join(process.cwd(), "server", "helpers", "compute_homography.py");
    if (fs.existsSync(helperPath)) {
      const pyInput = JSON.stringify({ image_points, world_points });
      // Try env-specified executable first, then fall back to common names
      const pyExecs = [
        process.env.PYTHON_EXECUTABLE,
        "python3",
        "python",
      ].filter(Boolean);
      let result = null;
      for (const pyExec of pyExecs) {
        result = spawnSync(pyExec, [helperPath], { input: pyInput, encoding: "utf8", timeout: 15000 });
        if (result.status === 0 || (result.stderr && !result.stderr.includes("not found") && !result.stderr.includes("introuvable"))) break;
      }
      if (result && result.status === 0 && result.stdout) {
        const parsed = JSON.parse(result.stdout.trim());
        if (parsed.homography_matrix) homographyMatrix = parsed.homography_matrix;
        else console.warn("[court-calibration] homography computation error:", parsed.error);
      } else {
        console.warn("[court-calibration] python helper failed:", result?.stderr);
      }
    }

    const calib = await saveCalibrationKeypoints({
      calibId: req.params.calibId,
      imagePoints: image_points,
      worldPoints: world_points,
      keypointLabels: keypoint_labels ?? [],
      homographyMatrix,
    });
    res.json({ calibration: calib, homography_computed: !!homographyMatrix });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to save keypoints." });
  }
});

app.post("/api/admin/court-calibrations/:calibId/activate", requireAuth, requireAdmin, async (req, res) => {
  try {
    const calib = await getCourtCalibration(req.params.calibId);
    if (!calib) return res.status(404).json({ message: "Calibration not found." });
    if (!calib.homography_matrix) return res.status(400).json({ message: "Homography not yet computed. Save keypoints first." });
    const activated = await activateCourtCalibration(calib.id, calib.court_id);
    res.json({ calibration: activated });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to activate calibration." });
  }
});

app.delete("/api/admin/court-calibrations/:calibId", requireAuth, requireAdmin, async (req, res) => {
  try {
    await deleteCourtCalibration(req.params.calibId);
    res.json({ deleted: true });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to delete calibration." });
  }
});

// Serve calibration frame images
app.get("/api/admin/calibration-frame/:filename", requireAuth, requireAdmin, (req, res) => {
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(calibrationFrameDir, safeName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: "Frame not found." });
  res.sendFile(filePath, { root: process.cwd() });
});

app.post("/api/smartplay/matches/:matchId/scoring/start", requireAuthUnlessLocal, async (req, res) => {
  if (!SMARTPLAY_AI_URL) {
    return sendSmartPlayNotConfigured(res);
  }

  const matchConfig = getSmartPlayMatchConfig(req.params.matchId);
  if (!matchConfig) {
    return res.status(404).json({
      message: `No SmartPlay AI v1 path mapping exists for match "${req.params.matchId}".`,
    });
  }

  const payload = toScoringV2Payload(matchConfig, req.body);

  try {
    const { response, body } = await callSmartPlayJson("/jobs/scoring-v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return res.status(response.status).json(body ?? {});
    }

    let persistedJob = null;
    if (body?.job_id) {
      const actor = await attachActor(req);
      persistedJob = await createAiAnalysisJobRecord({
        matchId: null,
        externalMatchKey: matchConfig.match_id,
        cameraId: matchConfig.camera_id,
        requestedByUserId: actor?.id ?? req.user?.sub ?? null,
        jobId: body.job_id,
        status: body.status ?? "queued",
        aiServiceUrl: SMARTPLAY_AI_URL,
        inputVideoPath: matchConfig.input_video_path,
        ballTracksPath: matchConfig.ball_tracks,
        playerTracksPath: matchConfig.player_tracks,
        outputDir: matchConfig.out_dir,
        debugVideoPath: matchConfig.debug_video_path,
      });
    }

    return res.status(response.status).json({
      ...body,
      persisted: Boolean(persistedJob),
      analysis_job_id: persistedJob?.id ?? null,
    });
  } catch (error) {
    return sendSmartPlayFetchError(res, error);
  }
});

app.get("/api/smartplay/jobs/:jobId", requireAuthUnlessLocal, async (req, res) => {
  if (!SMARTPLAY_AI_URL) {
    return sendSmartPlayNotConfigured(res);
  }

  try {
    const { response, body } = await callSmartPlayJson(`/jobs/${encodeURIComponent(req.params.jobId)}`);
    if (body?.job_id) {
      await updateAiAnalysisJobFromService(body.job_id, body);
      if (body.status === "done") {
        try {
          const saved = await persistAiEventsForServiceJob(body);
          return res.status(response.status).json({ ...body, persisted_events: saved.saved ?? 0 });
        } catch (error) {
          return res.status(response.status).json({
            ...body,
            persisted_events: 0,
            persistence_warning: error instanceof Error ? error.message : "Unable to persist SmartPlay events.",
          });
        }
      }
    }
    return res.status(response.status).json(body ?? {});
  } catch (error) {
    return sendSmartPlayFetchError(res, error);
  }
});

app.get("/api/smartplay/matches/:matchId/events", optionalAuth, async (req, res) => {
  const matchConfig = getSmartPlayMatchConfig(req.params.matchId);
  if (!matchConfig) {
    return res.status(404).json({
      message: `No SmartPlay AI v1 path mapping exists for match "${req.params.matchId}".`,
    });
  }

  try {
    const storedEvents = await listAiScoringEventsForMatch(matchConfig.match_id, matchConfig.camera_id);
    if (storedEvents.length) {
      return res.json({
        match_id: matchConfig.match_id,
        camera_id: matchConfig.camera_id,
        source: "postgres",
        events: storedEvents,
      });
    }
  } catch (error) {
    console.warn("[smartplay/events] unable to read persisted events:", error?.message ?? error);
  }

  if (!SMARTPLAY_AI_URL) {
    return sendSmartPlayNotConfigured(res);
  }

  try {
    const { response, body } = await callSmartPlayJson(
      `/matches/${encodeURIComponent(matchConfig.match_id)}/${encodeURIComponent(matchConfig.camera_id)}/events`
    );
    if (response.ok) {
      const latestJob = await getLatestAiAnalysisJobForMatch(matchConfig.match_id, matchConfig.camera_id);
      if (latestJob?.job_id && Array.isArray(body?.events)) {
        try {
          await saveAiScoringEventsForJob({ jobId: latestJob.job_id, events: body.events });
          return res.status(response.status).json({ ...body, source: "fastapi", persisted_events: body.events.length });
        } catch (error) {
          return res.status(response.status).json({
            ...body,
            source: "fastapi",
            persisted_events: 0,
            persistence_warning: error instanceof Error ? error.message : "Unable to persist SmartPlay events.",
          });
        }
      }
    }
    return res.status(response.status).json(body ?? {});
  } catch (error) {
    return sendSmartPlayFetchError(res, error);
  }
});

app.get("/api/smartplay/matches/:matchId/debug-video", optionalAuth, async (req, res) => {
  if (!SMARTPLAY_AI_URL) {
    return sendSmartPlayNotConfigured(res);
  }

  const matchConfig = getSmartPlayMatchConfig(req.params.matchId);
  if (!matchConfig) {
    return res.status(404).json({
      message: `No SmartPlay AI v1 path mapping exists for match "${req.params.matchId}".`,
    });
  }

  try {
    const response = await fetchSmartPlay(
      `/matches/${encodeURIComponent(matchConfig.match_id)}/${encodeURIComponent(matchConfig.camera_id)}/debug-video`
    );
    if (!response.ok) {
      const body = await readSmartPlayResponse(response);
      return res.status(response.status).json(body ?? { message: "Debug video not available." });
    }
    if (!response.body) {
      return res.status(502).json({ message: "SmartPlay AI returned an empty debug video response." });
    }

    const contentType = response.headers.get("content-type");
    const contentLength = response.headers.get("content-length");
    if (contentType) res.setHeader("content-type", contentType);
    if (contentLength) res.setHeader("content-length", contentLength);
    res.setHeader("content-disposition", `inline; filename="smartplay-${matchConfig.match_id}-${matchConfig.camera_id}.mp4"`);
    res.status(response.status);
    return Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    return sendSmartPlayFetchError(res, error);
  }
});

app.get("/api/smartplay/player/:playerId/analysis", requireAuth, async (req, res) => {
  try {
    const playerId = Number(req.params.playerId);
    const matchId = req.query.matchId ? Number(req.query.matchId) : null;
    const data = await getPlayerAiMetrics(playerId, matchId);
    res.json(data);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load player AI metrics" });
  }
});

app.get("/api/smartplay/match/:matchId/analysis", optionalAuth, async (req, res) => {
  try {
    const data = await getMatchAnalysis(Number(req.params.matchId));
    res.json(data);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load match analysis" });
  }
});

app.post("/api/smartplay/analysis-jobs", requireAuth, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "User not found" });
    const { userId, matchId, jobType } = req.body ?? {};
    const targetUserId = userId ? Number(userId) : actor.id;
    const job = await createAnalysisJob({
      userId: targetUserId,
      matchId: matchId ? Number(matchId) : null,
      jobType: jobType ?? "full_match",
      requestedByUserId: actor.id,
    });
    res.status(201).json({ job });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to create analysis job" });
  }
});

app.get("/api/smartplay/analysis-jobs", requireAuth, async (req, res) => {
  try {
    const jobs = await listAnalysisJobs(req.user.sub);
    res.json({ jobs });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load analysis jobs" });
  }
});

// ── Coaching: Coach self-management ──────────────────────────────────────────

app.get("/api/coach/profile", requireAuth, requireCoach, async (req, res) => {
  try {
    const profile = await getCoachProfile(req.user.sub);
    res.json({ profile });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load coach profile" });
  }
});

app.patch("/api/coach/profile", requireAuth, requireCoach, async (req, res) => {
  try {
    const profile = await upsertCoachProfile(req.user.sub, req.user.sub, req.body);
    res.json({ profile });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to update coach profile" });
  }
});

app.post("/api/coach/profile/avatar", requireAuth, requireCoach, uploadImage.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const imageUrl = `/uploads/${req.file.filename}`;
    await updateCoachAvatar(req.user.sub, imageUrl);
    res.json({ imageUrl });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to upload avatar" });
  }
});

app.get("/api/coach/availability", requireAuth, requireCoach, async (req, res) => {
  try {
    const availability = await getCoachAvailability(req.user.sub);
    res.json(availability);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load availability" });
  }
});

app.put("/api/coach/availability", requireAuth, requireCoach, async (req, res) => {
  try {
    const { rules, sessionLimits } = req.body;
    if (!Array.isArray(rules)) return res.status(400).json({ message: "rules must be an array" });
    await setCoachAvailabilityRules(req.user.sub, rules);
    if (sessionLimits && typeof sessionLimits === "object") {
      await upsertCoachProfile(req.user.sub, req.user.sub, {
        maxSessionsPerDay: sessionLimits.maxSessionsPerDay ?? null,
        sessionDurationMinutes: sessionLimits.sessionDurationMinutes ?? 60,
        cooldownMinutes: sessionLimits.cooldownMinutes ?? 0,
      });
    }
    const availability = await getCoachAvailability(req.user.sub);
    res.json(availability);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to save availability" });
  }
});

app.post("/api/coach/availability/exceptions", requireAuth, requireCoach, async (req, res) => {
  try {
    const body = {
      ...req.body,
      date: req.body?.date ?? req.body?.exceptionDate ?? req.body?.exception_date,
    };
    const exception = await addCoachAvailabilityException(req.user.sub, body);
    res.status(201).json({ exception });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to add exception" });
  }
});

app.delete("/api/coach/availability/exceptions/:id", requireAuth, requireCoach, async (req, res) => {
  try {
    const { default: pgPool } = await import("./pg-pool.mjs");
    await pgPool.query(
      "DELETE FROM coach_availability_exceptions WHERE id = $1 AND coach_user_id = $2",
      [Number(req.params.id), Number(req.user.sub)]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to remove exception" });
  }
});

app.get("/api/coach/requests", requireAuth, requireCoach, async (req, res) => {
  try {
    const requests = await listCoachingRequestsForCoach(req.user.sub);
    res.json({ requests });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load requests" });
  }
});

app.patch("/api/coach/requests/:id/respond", requireAuth, requireCoach, async (req, res) => {
  try {
    const result = await respondToCoachingRequest(req.user.sub, Number(req.params.id), req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to respond to request" });
  }
});

app.get("/api/coach/coaching-sessions", requireAuth, requireCoach, async (req, res) => {
  try {
    const sessions = await listCoachingSessionsForUser(req.user.sub);
    res.json({ sessions });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load sessions" });
  }
});

async function ensureCoachNotesTable(pgPool) {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS coach_notes (
      id SERIAL PRIMARY KEY,
      coach_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category VARCHAR(40) NOT NULL DEFAULT 'other',
      body TEXT NOT NULL,
      related_type VARCHAR(40) NULL,
      related_id INT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query("CREATE INDEX IF NOT EXISTS idx_coach_notes_coach_created ON coach_notes(coach_user_id, created_at DESC)");
}

async function listCoachNotesForUser(coachUserId) {
  const { default: pgPool } = await import("./pg-pool.mjs");
  await ensureCoachNotesTable(pgPool);
  const { rows } = await pgPool.query(
    `SELECT id, category, body, related_type, related_id, created_at
     FROM coach_notes
     WHERE coach_user_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [Number(coachUserId)]
  );
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    body: row.body,
    relatedType: row.related_type,
    relatedId: row.related_id,
    createdAt: row.created_at,
  }));
}

async function listCoachAiReviews(coachUserId) {
  const { default: pgPool } = await import("./pg-pool.mjs");
  const { rows: playerRows } = await pgPool.query(
    `SELECT player_user_id
     FROM coach_player_relationships
     WHERE coach_user_id = $1 AND status = 'active'
       AND start_date <= CURRENT_DATE
       AND (end_date IS NULL OR end_date >= CURRENT_DATE)`,
    [Number(coachUserId)]
  );
  const playerIds = playerRows.map((row) => Number(row.player_user_id)).filter(Number.isFinite);
  if (!playerIds.length) return [];
  const { rows } = await pgPool.query(
    `SELECT c.*, CONCAT(u.first_name, ' ', u.last_name) AS player_name
     FROM ai_uploaded_clips c
     LEFT JOIN users u ON u.id = c.player_user_id
     WHERE c.deleted_at IS NULL
       AND (
         c.player_user_id = ANY($1::int[])
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.assigned_player_ids::jsonb, '[]'::jsonb)) AS assigned(player_id)
           WHERE assigned.player_id::int = ANY($1::int[])
         )
       )
     ORDER BY c.created_at DESC
     LIMIT 60`,
    [playerIds]
  );
  const clips = rows.map((row) => ({
    id: row.id,
    playerUserId: row.player_user_id,
    playerName: row.player_name,
    originalFilename: row.original_filename,
    status: row.status,
    createdAt: row.created_at,
    sharedAt: row.shared_at,
  }));
  return Promise.all(clips.map(async (clip) => {
    const details = await getAiClipDetails(clip.id).catch(() => null);
    return { ...clip, job: details?.job ?? null };
  }));
}

async function getCoachPaymentsSummary(coachUserId) {
  const { default: pgPool } = await import("./pg-pool.mjs");
  const { rows } = await pgPool.query(
    `SELECT
       COUNT(*) FILTER (WHERE payment_status = 'paid') AS paid_sessions,
       COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_sessions,
       COUNT(*) FILTER (WHERE payment_status = 'refunded') AS refunded_sessions,
       SUM(payment_amount) FILTER (WHERE payment_status = 'paid') AS estimated_earnings
     FROM coaching_requests
     WHERE coach_user_id = $1`,
    [Number(coachUserId)]
  );
  const row = rows[0] ?? {};
  return {
    paidSessions: Number(row.paid_sessions ?? 0),
    cancelledSessions: Number(row.cancelled_sessions ?? 0),
    refundedSessions: Number(row.refunded_sessions ?? 0),
    estimatedEarnings: row.estimated_earnings === null || row.estimated_earnings === undefined ? null : Number(row.estimated_earnings),
    currency: "TND",
  };
}

app.get("/api/coach/notes", requireAuth, requireCoach, async (req, res) => {
  try {
    const notes = await listCoachNotesForUser(req.user.sub);
    res.json({ notes });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load notes" });
  }
});

app.post("/api/coach/notes", requireAuth, requireCoach, async (req, res) => {
  try {
    const { default: pgPool } = await import("./pg-pool.mjs");
    await ensureCoachNotesTable(pgPool);
    const allowed = new Set(["positioning", "technique", "defense", "attack", "movement", "fitness", "tactical", "other"]);
    const category = allowed.has(String(req.body?.category)) ? String(req.body.category) : "other";
    const body = String(req.body?.body ?? "").trim();
    if (!body) return res.status(400).json({ message: "Note body is required" });
    const { rows } = await pgPool.query(
      `INSERT INTO coach_notes (coach_user_id, category, body, related_type, related_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, category, body, related_type, related_id, created_at`,
      [Number(req.user.sub), category, body, req.body?.relatedType ?? null, req.body?.relatedId ? Number(req.body.relatedId) : null]
    );
    res.status(201).json({
      note: {
        id: rows[0].id,
        category: rows[0].category,
        body: rows[0].body,
        relatedType: rows[0].related_type,
        relatedId: rows[0].related_id,
        createdAt: rows[0].created_at,
      },
    });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to save note" });
  }
});

app.get("/api/coach/ai-reviews", requireAuth, requireCoach, async (req, res) => {
  try {
    const reviews = await listCoachAiReviews(req.user.sub);
    res.json({ reviews });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load AI reviews" });
  }
});

app.get("/api/coach/dashboard", requireAuth, requireCoach, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "User not found" });
    const [
      students,
      sessions,
      coachingSessions,
      requests,
      availability,
      notifications,
      liveSessions,
      competitions,
      aiReviews,
      notes,
      payments,
    ] = await Promise.all([
      listCoachStudents(req.user.sub).catch(() => []),
      listCoachSessions(req.user.sub).catch(() => []),
      listCoachingSessionsForUser(req.user.sub).catch(() => []),
      listCoachingRequestsForCoach(req.user.sub).catch(() => []),
      getCoachAvailability(req.user.sub).catch(() => ({ rules: [], exceptions: [] })),
      listNotificationsForUser(req.user.sub).catch(() => []),
      listLiveSessions({ actor }).catch(() => []),
      listCompetitions().catch(() => []),
      listCoachAiReviews(req.user.sub).catch(() => []),
      listCoachNotesForUser(req.user.sub).catch(() => []),
      getCoachPaymentsSummary(req.user.sub).catch(() => ({ paidSessions: 0, cancelledSessions: 0, refundedSessions: 0, estimatedEarnings: null, currency: "TND" })),
    ]);
    res.json({ students, sessions, coachingSessions, requests, availability, notifications, liveSessions, competitions, aiReviews, notes, payments });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load coach dashboard" });
  }
});

// ── Coaching: Player discovery & requests ─────────────────────────────────────

app.get("/api/player/coaches", requireAuth, async (req, res) => {
  try {
    const { arenaId, search, expertise, language } = req.query;
    const coaches = await listCoachProfiles({
      arenaId: arenaId ? Number(arenaId) : undefined,
      search: search || undefined,
      expertise: expertise || undefined,
      language: language || undefined,
    });
    res.json({ coaches });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load coaches" });
  }
});

app.get("/api/player/coaches/:id", requireAuth, async (req, res) => {
  try {
    const profile = await getCoachPublicProfile(Number(req.params.id));
    res.json({ profile });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Coach not found" });
  }
});

app.get("/api/player/coaches/:id/slots", requireAuth, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: "date query param required" });
    const slots = await getCoachAvailableSlots(Number(req.params.id), date);
    res.json({ slots });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load slots" });
  }
});

app.post("/api/player/coaching-requests", requireAuth, async (req, res) => {
  try {
    const request = await createCoachingRequest(req.user.sub, req.body);
    res.status(201).json({ request });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to create coaching request" });
  }
});

app.get("/api/player/coaching-requests", requireAuth, async (req, res) => {
  try {
    const requests = await listCoachingRequestsForPlayer(req.user.sub);
    res.json({ requests });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load coaching requests" });
  }
});

app.get("/api/player/coaching-sessions", requireAuth, async (req, res) => {
  try {
    const sessions = await listCoachingSessionsForUser(req.user.sub);
    res.json({ sessions });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load coaching sessions" });
  }
});

// ── Coaching: Admin management ────────────────────────────────────────────────

app.get("/api/admin/coaches", requireAuth, async (req, res) => {
  try {
    const coaches = await listAdminCoaches(req.user.sub);
    res.json({ coaches });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load coaches" });
  }
});

app.post("/api/admin/coaches", requireAuth, async (req, res) => {
  try {
    const { coachUserId, ...profileData } = req.body;
    if (!coachUserId) return res.status(400).json({ message: "coachUserId required" });
    const profile = await upsertCoachProfile(req.user.sub, coachUserId, profileData);
    res.status(201).json({ profile });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to create coach profile" });
  }
});

app.patch("/api/admin/coaches/:id/profile", requireAuth, async (req, res) => {
  try {
    const profile = await upsertCoachProfile(req.user.sub, Number(req.params.id), req.body);
    res.json({ profile });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to update coach profile" });
  }
});

// Admin: read a coach's availability (rules + exceptions)
app.get("/api/admin/coaches/:id/availability", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { default: pgPool } = await import("./pg-pool.mjs");
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "User not found" });
    const coachId = Number(req.params.id);
    if (actor.effective_role !== "super_admin") {
      const { rows } = await pgPool.query(
        `SELECT u.id FROM users u
         LEFT JOIN coach_profiles cp ON cp.user_id = u.id
         LEFT JOIN arena_memberships am ON am.user_id = u.id AND am.role = 'coach'
         WHERE u.id = $1 AND (cp.arena_id = $2 OR am.arena_id = $2)`,
        [coachId, actor.arena_id]
      );
      if (!rows.length) return res.status(403).json({ message: "Coach not in your arena" });
    }
    const [rulesRes, excRes, profileRes] = await Promise.all([
      pgPool.query(
        `SELECT id, day_of_week, SUBSTRING(start_time::text,1,5) AS start_time,
                SUBSTRING(end_time::text,1,5) AS end_time, is_available
         FROM coach_availability_rules WHERE coach_user_id = $1 ORDER BY day_of_week, start_time`,
        [coachId]
      ),
      pgPool.query(
        `SELECT id, exception_date::text AS date,
                SUBSTRING(start_time::text,1,5) AS start_time,
                SUBSTRING(end_time::text,1,5) AS end_time,
                is_available, reason
         FROM coach_availability_exceptions WHERE coach_user_id = $1 ORDER BY exception_date`,
        [coachId]
      ),
      pgPool.query(
        `SELECT max_sessions_per_day, session_duration_minutes, cooldown_minutes FROM coach_profiles WHERE user_id = $1`,
        [coachId]
      ),
    ]);
    const p = profileRes.rows[0];
    res.json({
      rules: rulesRes.rows,
      exceptions: excRes.rows,
      sessionLimits: {
        maxSessionsPerDay: p?.max_sessions_per_day ?? null,
        sessionDurationMinutes: p?.session_duration_minutes ?? 60,
        cooldownMinutes: p?.cooldown_minutes ?? 0,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unable to load availability" });
  }
});

// Admin: replace all availability rules for a coach + notify
app.put("/api/admin/coaches/:id/availability", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { default: pgPool } = await import("./pg-pool.mjs");
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "User not found" });
    const coachId = Number(req.params.id);
    const { rules, message: adminMessage, sessionLimits } = req.body;
    if (!Array.isArray(rules)) return res.status(400).json({ message: "rules must be array" });
    if (actor.effective_role !== "super_admin") {
      const { rows } = await pgPool.query(
        `SELECT u.id FROM users u
         LEFT JOIN coach_profiles cp ON cp.user_id = u.id
         LEFT JOIN arena_memberships am ON am.user_id = u.id AND am.role = 'coach'
         WHERE u.id = $1 AND (cp.arena_id = $2 OR am.arena_id = $2)`,
        [coachId, actor.arena_id]
      );
      if (!rows.length) return res.status(403).json({ message: "Coach not in your arena" });
    }
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM coach_availability_rules WHERE coach_user_id = $1", [coachId]);
      for (const rule of rules) {
        const dow = Number(rule.dayOfWeek ?? rule.day_of_week);
        if (dow < 0 || dow > 6 || !rule.startTime || !rule.endTime) continue;
        await client.query(
          `INSERT INTO coach_availability_rules (coach_user_id, arena_id, day_of_week, start_time, end_time, is_available)
           VALUES ($1, $2, $3, $4::time, $5::time, $6)`,
          [coachId, actor.arena_id ?? null, dow, rule.startTime, rule.endTime, rule.isAvailable !== false]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    // Notify coach
    const notifBody = adminMessage
      ? adminMessage
      : "Your weekly schedule has been updated by the arena admin.";
    try {
      await createNotification({
        userId: coachId,
        title: "Schedule updated by admin",
        body: notifBody,
        type: "schedule_update",
        linkUrl: "/coach",
      });
    } catch (_) {}
    if (sessionLimits && typeof sessionLimits === "object") {
      await upsertCoachProfile(req.user.sub, coachId, {
        maxSessionsPerDay: sessionLimits.maxSessionsPerDay ?? null,
        sessionDurationMinutes: sessionLimits.sessionDurationMinutes ?? 60,
        cooldownMinutes: sessionLimits.cooldownMinutes ?? 0,
      });
    }
    const [rulesRes, excRes, profileRes] = await Promise.all([
      pgPool.query(
        `SELECT id, day_of_week, SUBSTRING(start_time::text,1,5) AS start_time,
                SUBSTRING(end_time::text,1,5) AS end_time, is_available
         FROM coach_availability_rules WHERE coach_user_id = $1 ORDER BY day_of_week, start_time`,
        [coachId]
      ),
      pgPool.query(
        `SELECT id, exception_date::text AS date,
                SUBSTRING(start_time::text,1,5) AS start_time,
                SUBSTRING(end_time::text,1,5) AS end_time,
                is_available, reason
         FROM coach_availability_exceptions WHERE coach_user_id = $1 ORDER BY exception_date`,
        [coachId]
      ),
      pgPool.query(
        `SELECT max_sessions_per_day, session_duration_minutes, cooldown_minutes FROM coach_profiles WHERE user_id = $1`,
        [coachId]
      ),
    ]);
    const p2 = profileRes.rows[0];
    res.json({
      rules: rulesRes.rows,
      exceptions: excRes.rows,
      sessionLimits: {
        maxSessionsPerDay: p2?.max_sessions_per_day ?? null,
        sessionDurationMinutes: p2?.session_duration_minutes ?? 60,
        cooldownMinutes: p2?.cooldown_minutes ?? 0,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unable to update availability" });
  }
});

// Admin: add a date exception (day off or override hours) for a coach
app.post("/api/admin/coaches/:id/exceptions", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { default: pgPool } = await import("./pg-pool.mjs");
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "User not found" });
    const coachId = Number(req.params.id);
    const { date, startTime, endTime, isAvailable, reason } = req.body;
    if (!date) return res.status(400).json({ message: "date required" });
    if (actor.effective_role !== "super_admin") {
      const { rows } = await pgPool.query(
        `SELECT u.id FROM users u
         LEFT JOIN coach_profiles cp ON cp.user_id = u.id
         LEFT JOIN arena_memberships am ON am.user_id = u.id AND am.role = 'coach'
         WHERE u.id = $1 AND (cp.arena_id = $2 OR am.arena_id = $2)`,
        [coachId, actor.arena_id]
      );
      if (!rows.length) return res.status(403).json({ message: "Coach not in your arena" });
    }
    // Upsert: replace any existing exception for same coach+date
    await pgPool.query(
      `DELETE FROM coach_availability_exceptions WHERE coach_user_id = $1 AND exception_date = $2::date`,
      [coachId, date]
    );
    const { rows } = await pgPool.query(
      `INSERT INTO coach_availability_exceptions (coach_user_id, exception_date, start_time, end_time, is_available, reason)
       VALUES ($1, $2::date, $3, $4, $5, $6)
       RETURNING id, exception_date::text AS date,
         SUBSTRING(start_time::text,1,5) AS start_time,
         SUBSTRING(end_time::text,1,5) AS end_time, is_available, reason`,
      [coachId, date, startTime ?? null, endTime ?? null, isAvailable !== false, reason ?? null]
    );
    try {
      const label = isAvailable === false
        ? `You are marked as unavailable on ${date}.`
        : `Your hours on ${date} have been changed to ${startTime ?? ""}–${endTime ?? ""}.`;
      await createNotification({
        userId: coachId,
        title: "Schedule exception added",
        body: reason ? `${label} Reason: ${reason}` : label,
        type: "schedule_update",
        linkUrl: "/coach",
      });
    } catch (_) {}
    res.status(201).json({ exception: rows[0] });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unable to add exception" });
  }
});

// Admin: remove a date exception
app.delete("/api/admin/coaches/:id/exceptions/:excId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { default: pgPool } = await import("./pg-pool.mjs");
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "User not found" });
    const coachId = Number(req.params.id);
    const excId = Number(req.params.excId);
    await pgPool.query(
      `DELETE FROM coach_availability_exceptions WHERE id = $1 AND coach_user_id = $2`,
      [excId, coachId]
    );
    try {
      await createNotification({
        userId: coachId,
        title: "Schedule exception removed",
        body: "A previously added schedule exception has been removed by the admin.",
        type: "schedule_update",
        linkUrl: "/coach",
      });
    } catch (_) {}
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unable to remove exception" });
  }
});

// Admin: get coaching sessions for a coach (week view)
app.get("/api/admin/coaches/:id/sessions", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { default: pgPool } = await import("./pg-pool.mjs");
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "User not found" });
    const coachId = Number(req.params.id);
    const { weekStart } = req.query;
    if (!weekStart) return res.status(400).json({ message: "weekStart required" });
    const { rows } = await pgPool.query(
      `SELECT cs.id,
              cs.session_date::text,
              SUBSTRING(cs.start_time::text,1,5) AS start_time,
              SUBSTRING(cs.end_time::text,1,5)   AS end_time,
              cs.status,
              cs.players_count,
              CONCAT(p.first_name,' ',p.last_name) AS player_name,
              p.email AS player_email
       FROM coaching_sessions cs
       JOIN users p ON p.id = cs.player_user_id
       WHERE cs.coach_user_id = $1
         AND cs.session_date >= $2::date
         AND cs.session_date < ($2::date + INTERVAL '7 days')
         AND cs.status != 'cancelled'
       ORDER BY cs.session_date, cs.start_time`,
      [coachId, weekStart]
    );
    res.json({ sessions: rows });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unable to load sessions" });
  }
});

app.post("/api/admin/assign-coach-club", requireAuth, async (req, res) => {
  try {
    const { coachUserId, arenaId } = req.body;
    if (!coachUserId || !arenaId) return res.status(400).json({ message: "coachUserId and arenaId required" });
    await assignCoachToArena(req.user.sub, coachUserId, arenaId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to assign coach" });
  }
});

// ── Coach booking wizard helpers ─────────────────────────────────────────────

app.get("/api/player/coach-booking/arenas", requireAuth, async (req, res) => {
  try {
    const places = await listArenasForCoachBooking();
    res.json({ places });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load arenas" });
  }
});

app.get("/api/player/coach-booking/arenas/:id/courts", requireAuth, async (req, res) => {
  try {
    const arenaId = Number(req.params.id);
    const { date, startTime, endTime } = req.query;
    if (!date || !startTime || !endTime) {
      return res.status(400).json({ message: "date, startTime and endTime are required" });
    }
    const { default: pgPool } = await import("./pg-pool.mjs");
    const { rows: courts } = await pgPool.query(
      `SELECT id, name, sport, status, price_per_hour, currency, court_type, has_lighting, surface_type
       FROM courts
       WHERE arena_id = $1 AND status = 'available'
       ORDER BY id ASC`,
      [arenaId]
    );
    const results = await Promise.all(courts.map(async (court) => {
      const { rows: conflicts } = await pgPool.query(
        `SELECT id FROM reservations
         WHERE court_id = $1 AND reservation_date = $2::date AND status = 'confirmed'
           AND start_time < $3::time AND end_time > $4::time`,
        [court.id, date, endTime, startTime]
      );
      return { ...court, available: conflicts.length === 0 };
    }));
    res.json({ courts: results.filter((c) => c.available) });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to load available courts" });
  }
});

// ── Notifications read-all ────────────────────────────────────────────────────

app.patch("/api/notifications/read-all", requireAuth, async (req, res) => {
  try {
    const { default: pgPool } = await import("./pg-pool.mjs");
    await pgPool.query("UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL", [req.user.sub]);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to mark all read" });
  }
});

// ── Live Score Loop ───────────────────────────────────────────────────────────

setInterval(async () => {
  try {
    await tickLiveMatches();
    if (io) emitScoresUpdate(io, { matches: await listMatches() });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Live score loop error:", error);
  }
}, 5000);

setInterval(async () => {
  try {
    await tickReservationLiveAnalysis();
  } catch (error) {
    console.error("Live analysis scheduler error:", error);
  }
}, 30000);

const shutdown = async () => {
  await closePool();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("unhandledRejection", (reason) => {
  console.error("[CRASH PREVENTED] Unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[CRASH PREVENTED] Uncaught exception:", err);
});

httpServer.listen(PORT, () => {
  console.log(`ULTIMA demo API listening on http://localhost:${PORT}`);
  if (ENABLE_TEST_SEED && testSetup) {
    console.log(
      `[ULTIMA TEST ACCOUNTS] arena="${testSetup.arena.name}" users=admin@ultima-arena.test, coach@ultima-arena.test, player1@ultima-arena.test, player2@ultima-arena.test`
    );
    console.log("[ULTIMA TEST ACCOUNTS] password source: env ULTIMA_TEST_PASSWORD");
  }
  if (isMailerConfigured()) {
    console.log("[mailer] SMTP configured — emails will be sent.");
  } else {
    console.warn("[mailer] SMTP not configured — emails will NOT be sent. Set SMTP_HOST and SMTP_FROM in .env");
  }
  // Eagerly start SmartPlay AI FastAPI in the background so it is ready by the time the user starts a live session
  if (SMARTPLAY_AI_URL && process.env.PYTHON_EXECUTABLE) {
    tryStartFastApiService().catch((e) => console.warn("[smartplay-ai] Auto-start failed:", e.message));
  }
});

// ── Super-admin: Arena & Court management ─────────────────────────────────────
console.log("[routes] super-admin routes registered");

function requireSuperAdmin(req, res, next) {
  if (req.resolved?.effectiveRole !== "super_admin") {
    return res.status(403).json({ message: "Super admin access required" });
  }
  return next();
}

// GET /api/super-admin/arenas — list all arenas with courts and calibration status
app.get("/api/super-admin/arenas", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { default: pgPool } = await import("./pg-pool.mjs");
    const { rows } = await pgPool.query(`
      SELECT
        a.id, a.name, a.slug, a.location, a.image_url, a.description, a.phone, a.website,
        a.created_at,
        COALESCE(json_agg(
          json_build_object(
            'id', c.id,
            'name', c.name,
            'sport', c.sport,
            'court_type', c.court_type,
            'status', c.status,
            'has_summa', c.has_summa,
            'price_per_hour', c.price_per_hour,
            'opening_time', c.opening_time,
            'closing_time', c.closing_time,
            'is_active', COALESCE(c.is_active, true),
            'calib_id', cc.id,
            'calib_status', cc.status
          ) ORDER BY c.name
        ) FILTER (WHERE c.id IS NOT NULL AND COALESCE(c.status, 'active') != 'inactive'), '[]') AS courts
      FROM arenas a
      LEFT JOIN courts c ON c.arena_id = a.id AND COALESCE(c.status, 'active') != 'inactive'
      LEFT JOIN court_calibrations cc ON cc.court_id = c.id AND cc.is_active = true
      WHERE a.soft_deleted IS NOT TRUE
      GROUP BY a.id
      ORDER BY a.name ASC
    `);
    return res.json({ arenas: rows });
  } catch (err) {
    return res.status(500).json({ message: err instanceof Error ? err.message : "Failed to list arenas" });
  }
});

// POST /api/super-admin/arenas — create arena (with optional image)
app.post("/api/super-admin/arenas", requireAuth, requireSuperAdmin, uploadImage.single("image"), async (req, res) => {
  try {
    const { name, location, description, phone, website } = req.body ?? {};
    if (!name || !location) return res.status(400).json({ message: "name and location are required" });

    const image_url = req.file ? `/uploads/${req.file.filename}` : null;
    const baseSlug = String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "arena";
    const { default: pgPool } = await import("./pg-pool.mjs");
    let slug = baseSlug;
    let arena = null;
    for (let i = 0; i < 10; i++) {
      try {
        const { rows } = await pgPool.query(
          `INSERT INTO arenas (name, slug, location, image_url, description, phone, website, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
           RETURNING id, name, slug, location, image_url, description, phone, website, created_at`,
          [name.trim(), slug, location.trim(), image_url, description ?? null, phone ?? null, website ?? null]
        );
        arena = rows[0];
        break;
      } catch (e) {
        if (e?.code !== "23505") throw e;
        slug = `${baseSlug}-${Math.floor(Math.random() * 10000)}`;
      }
    }
    if (!arena) return res.status(500).json({ message: "Could not generate unique slug" });
    return res.status(201).json({ arena });
  } catch (err) {
    return res.status(400).json({ message: err instanceof Error ? err.message : "Failed to create arena" });
  }
});

// PATCH /api/super-admin/arenas/:id — update arena fields + optional image
app.patch("/api/super-admin/arenas/:id", requireAuth, requireSuperAdmin, uploadImage.single("image"), async (req, res) => {
  try {
    const arenaId = Number(req.params.id);
    const { name, location, description, phone, website } = req.body ?? {};
    const { default: pgPool } = await import("./pg-pool.mjs");

    const sets = [];
    const vals = [];
    let idx = 1;
    if (name     !== undefined) { sets.push(`name=$${idx++}`);        vals.push(name.trim()); }
    if (location !== undefined) { sets.push(`location=$${idx++}`);    vals.push(location.trim()); }
    if (description !== undefined) { sets.push(`description=$${idx++}`); vals.push(description); }
    if (phone    !== undefined) { sets.push(`phone=$${idx++}`);       vals.push(phone || null); }
    if (website  !== undefined) { sets.push(`website=$${idx++}`);     vals.push(website || null); }
    if (req.file) { sets.push(`image_url=$${idx++}`); vals.push(`/uploads/${req.file.filename}`); }
    if (!sets.length) return res.status(400).json({ message: "Nothing to update" });

    vals.push(arenaId);
    const { rows } = await pgPool.query(
      `UPDATE arenas SET ${sets.join(",")} WHERE id=$${idx} RETURNING id,name,slug,location,image_url,description,phone,website`,
      vals
    );
    if (!rows.length) return res.status(404).json({ message: "Arena not found" });
    return res.json({ arena: rows[0] });
  } catch (err) {
    return res.status(400).json({ message: err instanceof Error ? err.message : "Failed to update arena" });
  }
});

// DELETE /api/super-admin/arenas/:id — soft delete
app.delete("/api/super-admin/arenas/:id", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { default: pgPool } = await import("./pg-pool.mjs");
    await pgPool.query(
      "UPDATE arenas SET soft_deleted=true, deleted_at=NOW() WHERE id=$1",
      [Number(req.params.id)]
    );
    return res.json({ deleted: true });
  } catch (err) {
    return res.status(400).json({ message: err instanceof Error ? err.message : "Failed to delete arena" });
  }
});

// POST /api/super-admin/courts — create court in any arena (super_admin only)
app.post("/api/super-admin/courts", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const actor = await attachActor(req);
    if (!actor) return res.status(401).json({ message: "User not found" });
    const { arenaId, name, sport, location, hasSumma, minPlayers, maxPlayers, openingTime, closingTime, courtType, pricePerHour } = req.body ?? {};
    if (!arenaId || !name || !sport) return res.status(400).json({ message: "arenaId, name, sport required" });
    const court = await createCourt({
      actor,
      arenaId: Number(arenaId),
      name: String(name).trim(),
      sport: String(sport).trim(),
      location: String(location ?? "").trim(),
      hasSumma,
      minPlayers,
      maxPlayers,
      openingTime,
      closingTime,
    });
    return res.status(201).json({ court });
  } catch (err) {
    return res.status(400).json({ message: err instanceof Error ? err.message : "Failed to create court" });
  }
});

// PATCH /api/super-admin/courts/:id — update court
app.patch("/api/super-admin/courts/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const courtId = Number(req.params.id);
    const { name, sport, location, hasSumma, openingTime, closingTime, pricePerHour, courtType } = req.body ?? {};
    const { default: pgPool } = await import("./pg-pool.mjs");

    const sets = [];
    const vals = [];
    let idx = 1;
    if (name        !== undefined) { sets.push(`name=$${idx++}`);          vals.push(name.trim()); }
    if (sport       !== undefined) { sets.push(`sport=$${idx++}`);         vals.push(sport); }
    if (location    !== undefined) { sets.push(`location=$${idx++}`);      vals.push(location); }
    if (hasSumma    !== undefined) { sets.push(`has_summa=$${idx++}`);     vals.push(hasSumma ? 1 : 0); }
    if (openingTime !== undefined) { sets.push(`opening_time=$${idx++}::time`); vals.push(openingTime); }
    if (closingTime !== undefined) { sets.push(`closing_time=$${idx++}::time`); vals.push(closingTime); }
    if (pricePerHour!== undefined) { sets.push(`price_per_hour=$${idx++}`); vals.push(pricePerHour); }
    if (courtType   !== undefined) { sets.push(`court_type=$${idx++}`);    vals.push(courtType); }
    if (!sets.length) return res.status(400).json({ message: "Nothing to update" });

    vals.push(courtId);
    const { rows } = await pgPool.query(
      `UPDATE courts SET ${sets.join(",")} WHERE id=$${idx} RETURNING id,name,sport,court_type,status,has_summa,price_per_hour`,
      vals
    );
    if (!rows.length) return res.status(404).json({ message: "Court not found" });
    return res.json({ court: rows[0] });
  } catch (err) {
    return res.status(400).json({ message: err instanceof Error ? err.message : "Failed to update court" });
  }
});

// DELETE /api/super-admin/courts/:id — soft delete
app.delete("/api/super-admin/courts/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { default: pgPool } = await import("./pg-pool.mjs");
    await pgPool.query(
      "UPDATE courts SET soft_deleted=true, deleted_at=NOW(), status='inactive' WHERE id=$1",
      [Number(req.params.id)]
    );
    return res.json({ deleted: true });
  } catch (err) {
    return res.status(400).json({ message: err instanceof Error ? err.message : "Failed to delete court" });
  }
});

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use((error, _req, res, next) => {
  if (!error) {
    return next();
  }
  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({ message: error.message });
  }
  return res.status(500).json({ message: error instanceof Error ? error.message : "Unexpected server error" });
});

/**
 * Socket.IO setup with Redis adapter and JWT authentication.
 *
 * - JWT is validated on every connection AND on every channel join.
 * - A reconnect does NOT inherit previous permissions — roles are re-resolved.
 * - Super-admin-only channels are gated at join time.
 */
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import jwt from "jsonwebtoken";
import { getRedis } from "../redis.mjs";
import { resolveUserRoles } from "../permissions/resolveRoles.mjs";
import { setupChannels } from "./channels.mjs";

const JWT_SECRET = process.env.JWT_SECRET ?? "ultima-demo-secret";
let _io = null;
let _pool = null;

export function getIO() { return _io; }

export function initSocketIO(httpServer, pool) {
  _pool = pool;

  _io = new SocketIOServer(httpServer, {
    cors: { origin: process.env.PUBLIC_WEB_BASE_URL ?? "*" },
    transports: ["websocket", "polling"],
  });

  // ── Redis adapter for horizontal scaling ──────────────────────────────────
  const redis = getRedis();
  if (redis) {
    // Pub/sub connections must allow offline queuing — they connect asynchronously
    // and the adapter issues subscribe/psubscribe immediately on creation.
    // The main client uses enableOfflineQueue:false; we override that here.
    const pub = redis.duplicate({ enableOfflineQueue: true });
    const sub = redis.duplicate({ enableOfflineQueue: true });
    _io.adapter(createAdapter(pub, sub));
    console.log("[socket.io] Redis adapter attached");
  } else {
    console.warn("[socket.io] No Redis — using in-memory adapter (single-process only)");
  }

  // ── Global auth middleware ─────────────────────────────────────────────────
  // Validates JWT on every new connection. The resolved roles are stored on
  // socket.data so individual channel handlers can re-check without a new DB hit.
  _io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ??
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");

      if (!token) {
        // Allow connection but mark as unauthenticated — some channels are public
        socket.data.userId   = null;
        socket.data.resolved = null;
        return next();
      }

      let payload;
      try {
        payload = jwt.verify(token, JWT_SECRET);
      } catch {
        return next(new Error("Invalid token"));
      }

      const userId = Number(payload.sub ?? payload.id);
      if (!userId) return next(new Error("Invalid token subject"));

      const resolved = await resolveUserRoles(userId, _pool);
      if (!resolved) return next(new Error("User not found"));

      if (resolved.isSuspended) return next(new Error("Account suspended"));

      socket.data.userId   = userId;
      socket.data.resolved = resolved;
      return next();
    } catch (err) {
      return next(new Error("Auth error"));
    }
  });

  setupChannels(_io, _pool);

  console.log("[socket.io] Initialised");
  return _io;
}

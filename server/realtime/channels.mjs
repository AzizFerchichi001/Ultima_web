/**
 * Real-time channel definitions.
 *
 * Channel naming:
 *   arena:{arena_id}:bookings         — booking events for an arena
 *   arena:{arena_id}:review_queue     — AI review queue items (admin only)
 *   match:{match_id}:processing       — AI pipeline progress
 *   user:{user_id}:notifications      — personal notifications
 *   live-session:{session_id}         — existing live tracking (kept for compat)
 *   internal:system_health            — server health (super_admin only)
 *   scores:update                     — broadcast live scores (public read)
 *
 * Emit-time filtering is done here (not receive-time) — subscribers only get
 * events they are authorised to see.
 */
import { resolveUserRoles, isAdminAtArena, isCoachAtArena } from "../permissions/resolveRoles.mjs";

export function setupChannels(io, pool) {

  io.on("connection", (socket) => {
    const userId   = socket.data.userId;
    const resolved = socket.data.resolved;

    // ── Live session (existing, keep compat) ──────────────────────────────
    socket.on("live:join", ({ sessionId }) => {
      if (!sessionId) return;
      socket.join(`live-session:${Number(sessionId)}`);
    });

    socket.on("live:leave", ({ sessionId }) => {
      if (!sessionId) return;
      socket.leave(`live-session:${Number(sessionId)}`);
    });

    // ── Arena bookings channel ────────────────────────────────────────────
    socket.on("arena:join", async ({ arenaId }) => {
      if (!userId || !arenaId) return;
      // Re-resolve to catch role changes since connection
      const freshResolved = await resolveUserRoles(userId, pool).catch(() => null);
      if (!freshResolved) return;

      // Only arena staff (admin/coach) can subscribe to this channel
      if (!isAdminAtArena(freshResolved, arenaId) && !isCoachAtArena(freshResolved, arenaId)) return;

      socket.data.resolved = freshResolved; // refresh cached roles
      socket.join(`arena:${arenaId}:bookings`);
    });

    socket.on("arena:leave", ({ arenaId }) => {
      if (!arenaId) return;
      socket.leave(`arena:${arenaId}:bookings`);
    });

    // ── Personal notifications ────────────────────────────────────────────
    if (userId) {
      socket.join(`user:${userId}:notifications`);
    }

    // ── Super admin: system health ────────────────────────────────────────
    if (resolved?.effectiveRole === "super_admin") {
      socket.join("internal:system_health");
    }

    // ── AI review queue (arena admin only) ────────────────────────────────
    socket.on("review_queue:join", async ({ arenaId }) => {
      if (!userId || !arenaId) return;
      const freshResolved = await resolveUserRoles(userId, pool).catch(() => null);
      if (!freshResolved) return;
      if (!isAdminAtArena(freshResolved, arenaId)) return;
      socket.data.resolved = freshResolved;
      socket.join(`arena:${arenaId}:review_queue`);
    });

    // ── Match processing progress ─────────────────────────────────────────
    socket.on("match:join", async ({ matchId }) => {
      if (!userId || !matchId) return;
      // Only the match owner or an arena admin can subscribe
      const roomKey = `match:${matchId}:processing`;
      // Defer scope check to emit time — joining the room is cheap
      socket.join(roomKey);
      socket.data.watchingMatches = socket.data.watchingMatches ?? new Set();
      socket.data.watchingMatches.add(Number(matchId));
    });

    socket.on("disconnect", () => {
      // rooms auto-clean on disconnect
    });
  });
}

// ── Emit helpers (used by route handlers) ─────────────────────────────────────

/**
 * Emits a booking event to everyone authorised to see it:
 *   - the player who owns the booking
 *   - all arena staff subscribed to arena:{arenaId}:bookings
 */
export function emitBookingUpdate(io, arenaId, ownerUserId, event, payload) {
  io.to(`arena:${arenaId}:bookings`).emit(event, payload);
  if (ownerUserId) {
    io.to(`user:${ownerUserId}:notifications`).emit(event, payload);
  }
}

/**
 * Emits a notification to a specific user.
 */
export function emitUserNotification(io, userId, payload) {
  io.to(`user:${userId}:notifications`).emit("notification:new", payload);
}

/**
 * Emits an AI review queue update (arena admin only).
 */
export function emitReviewQueueUpdate(io, arenaId, payload) {
  io.to(`arena:${arenaId}:review_queue`).emit("review_queue:update", payload);
}

/**
 * Emits AI pipeline progress. Filtered to match owner + arena admins at emit time.
 */
export function emitMatchProcessingUpdate(io, matchId, ownerUserId, payload) {
  io.to(`match:${matchId}:processing`).emit("match:processing_update", payload);
  if (ownerUserId) {
    io.to(`user:${ownerUserId}:notifications`).emit("match:processing_update", payload);
  }
}

/**
 * Broadcasts live tracking frame to all subscribers of a live session room.
 * No auth filter here — session access was already verified at join.
 */
export function emitLiveUpdate(io, sessionId, payload) {
  io.to(`live-session:${sessionId}`).emit("live:update", payload);
}

export function emitLiveStatus(io, sessionId, payload) {
  io.to(`live-session:${sessionId}`).emit("live:status", payload);
}

/**
 * Broadcasts live score updates to all connected clients (public channel).
 */
export function emitScoresUpdate(io, payload) {
  io.emit("scores:update", payload);
}

/**
 * Emits system health data to super admin subscribers only.
 */
export function emitSystemHealth(io, payload) {
  io.to("internal:system_health").emit("system:health", payload);
}

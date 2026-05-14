/**
 * Permission enforcement middleware.
 *
 * Provides:
 *   requireAuth       — validates JWT, resolves roles from DB (not from token), attaches req.resolved
 *   optionalAuth      — same but does not 401 on missing token
 *   requireRole(role) — requires effectiveRole >= role
 *   requireAction(action, getArenaId?) — checks PERMISSION_MATRIX + optional arena scope
 *   requireInternal   — /internal/* routes; returns 404 (not 403) for non-super-admins
 *   logDenial         — writes to permission_denials table (async, non-blocking)
 */

import jwt from "jsonwebtoken";
import { resolveUserRoles, isAdminAtArena, isCoachAtArena } from "./resolveRoles.mjs";
import { can, roleAtLeast, ACTIONS } from "./matrix.mjs";

const JWT_SECRET = process.env.JWT_SECRET ?? "ultima-demo-secret";

// Injected at startup by server/index.mjs — avoids circular imports
let _pool = null;
export function setPool(pool) { _pool = pool; }

// ── Core auth ─────────────────────────────────────────────────────────────────

/**
 * Validates the Bearer token, resolves fresh roles from DB, and attaches:
 *   req.userId     — the user's numeric ID
 *   req.resolved   — { userId, isSuspended, effectiveRole, roles }
 *
 * Ignores any `role` field in the JWT payload (D1 decision).
 * Existing tokens with embedded roles continue to work until they expire.
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }

  let payload;
  try {
    payload = jwt.verify(header.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  const userId = Number(payload.sub ?? payload.id);
  if (!userId) return res.status(401).json({ message: "Invalid token subject" });

  let resolved;
  try {
    resolved = await resolveUserRoles(userId, _pool);
  } catch (err) {
    console.error("[requireAuth] resolveUserRoles failed:", err.message);
    return res.status(500).json({ message: "Authentication service error" });
  }
  if (!resolved) return res.status(401).json({ message: "User not found" });

  if (resolved.isSuspended) {
    return res.status(403).json({ message: "Your account has been suspended. Contact support." });
  }

  req.userId   = userId;
  req.resolved = resolved;
  // Backward-compat shim — routes that still read req.user.role work during migration
  req.user = { sub: userId, id: userId, role: resolved.effectiveRole, email: payload.email };
  return next();
}

/**
 * Same as requireAuth but passes through without error when no token is present.
 * req.resolved will be null for unauthenticated requests.
 */
export async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    req.userId   = null;
    req.resolved = null;
    req.user     = null;
    return next();
  }

  let payload;
  try {
    payload = jwt.verify(header.slice(7), JWT_SECRET);
  } catch {
    req.userId   = null;
    req.resolved = null;
    req.user     = null;
    return next();
  }

  const userId = Number(payload.sub ?? payload.id);
  if (!userId) {
    req.userId   = null;
    req.resolved = null;
    req.user     = null;
    return next();
  }

  let resolved;
  try {
    resolved = await resolveUserRoles(userId, _pool);
  } catch (err) {
    console.error("[optionalAuth] resolveUserRoles failed:", err.message);
    resolved = null;
  }
  req.userId   = resolved ? userId : null;
  req.resolved = resolved ?? null;
  req.user     = resolved
    ? { sub: userId, id: userId, role: resolved.effectiveRole, email: payload.email }
    : null;
  return next();
}

// ── Role checks ───────────────────────────────────────────────────────────────

/** Requires req.resolved.effectiveRole to be at least `minRole`. */
export function requireRole(minRole) {
  return (req, res, next) => {
    const role = req.resolved?.effectiveRole ?? "visitor";
    if (!roleAtLeast(role, minRole)) {
      logDenial(req, `require_role:${minRole}`);
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    return next();
  };
}

/** Convenience: admin or super_admin */
export function requireAdmin(req, res, next) {
  const role = req.resolved?.effectiveRole ?? "visitor";
  if (!["arena_admin", "super_admin"].includes(role)) {
    logDenial(req, "require_admin");
    return res.status(403).json({ message: "Admin access required" });
  }
  return next();
}

/** Convenience: coach, arena_admin, or super_admin */
export function requireCoach(req, res, next) {
  const role = req.resolved?.effectiveRole ?? "visitor";
  if (!["coach", "arena_admin", "super_admin"].includes(role)) {
    logDenial(req, "require_coach");
    return res.status(403).json({ message: "Coach access required" });
  }
  return next();
}

// ── Action-based checks ───────────────────────────────────────────────────────

/**
 * Checks the permission matrix for `action` against the effective role.
 * Optionally validates arena scope if `getArenaId` returns an arena ID.
 *
 * @param {string} action — one of ACTIONS.*
 * @param {Function?} getArenaId — (req) => number | null — resolves the arena from the request
 * @param {Function?} requireArenaStaff — if true, also checks isAdminAtArena / isCoachAtArena
 */
export function requireAction(action, getArenaId = null, staffLevel = null) {
  return async (req, res, next) => {
    const role = req.resolved?.effectiveRole ?? "visitor";

    if (!can(role, action)) {
      logDenial(req, action);
      return res.status(403).json({ message: "You don't have permission to perform this action" });
    }

    if (getArenaId && staffLevel) {
      const arenaId = await getArenaId(req);
      if (arenaId) {
        const ok = staffLevel === "admin"
          ? isAdminAtArena(req.resolved, arenaId)
          : isCoachAtArena(req.resolved, arenaId);
        if (!ok) {
          logDenial(req, `${action}:arena_scope:${arenaId}`);
          return res.status(403).json({ message: "You don't have permission for this arena" });
        }
      }
    }

    return next();
  };
}

// ── /internal/ guard ──────────────────────────────────────────────────────────

/**
 * Any non-super-admin hitting /internal/* gets a 404 — not 403.
 * We do not reveal the existence of these routes to other roles.
 */
export function requireInternal(req, res, next) {
  const role = req.resolved?.effectiveRole ?? "visitor";
  if (role !== "super_admin") {
    // 404, not 403 — don't leak the route exists
    return res.status(404).json({ message: "Not found" });
  }
  return next();
}

// ── Denial logging ────────────────────────────────────────────────────────────

/** Non-blocking write to permission_denials. Never throws. */
function logDenial(req, reason) {
  if (!_pool) return;
  const userId = req.userId ?? null;
  const route  = req.originalUrl ?? req.url ?? "unknown";
  const ip     = req.ip ?? req.socket?.remoteAddress ?? null;
  setImmediate(() => {
    _pool.query(
      `INSERT INTO permission_denials (user_id, route, reason, ip_address, attempted_at)
       VALUES ($1, $2, $3, $4::inet, NOW())
       ON CONFLICT DO NOTHING`,
      [userId, route.slice(0, 255), reason?.slice(0, 120) ?? null, ip]
    ).catch(() => {}); // never propagate
  });
}

/**
 * Role resolution with Redis cache.
 *
 * The DB is the source of truth. Redis caches resolved roles for 5 minutes.
 * Cache MUST be invalidated immediately on any role write — do not rely on TTL.
 *
 * Any write to arena_memberships MUST call invalidateRoleCache(userId) after commit.
 */
import { getRedis, redisSetex, redisGet, redisDel } from "../redis.mjs";

const CACHE_TTL_SECONDS = 300; // 5 minutes — fallback only; invalidated on write

function cacheKey(userId) {
  return `permissions:user:${userId}`;
}

/**
 * Resolves a user's full role profile from the database (or Redis cache).
 *
 * Returns:
 * {
 *   userId: number,
 *   isSuspended: boolean,
 *   effectiveRole: "player" | "coach" | "arena_admin" | "super_admin",
 *   roles: Array<{ role, arena_id, head_coach_flag }>,
 * }
 * Returns null if the user is not found.
 */
export async function resolveUserRoles(userId, pool) {
  if (!userId) return null;

  // ── 1. Try Redis ──────────────────────────────────────────────────────────
  const cached = await redisGet(cacheKey(userId));
  if (cached) {
    try { return JSON.parse(cached); } catch { /* fall through to DB */ }
  }

  // ── 2. Resolve from DB ────────────────────────────────────────────────────
  // Try the full RBAC query first. If migration 001 hasn't been applied yet
  // (missing columns), fall back to a query that only uses the base schema.
  let rows;
  try {
    ({ rows } = await pool.query(
      `SELECT
         u.id,
         u.platform_role,
         u.is_suspended,
         am.arena_id,
         am.role           AS membership_role,
         am.status         AS membership_status,
         am.head_coach_flag,
         am.revoked_at
       FROM users u
       LEFT JOIN arena_memberships am
              ON am.user_id = u.id
             AND am.revoked_at IS NULL
       WHERE u.id = $1`,
      [userId]
    ));
  } catch (err) {
    // 42703 = undefined_column — migration not yet applied, use base schema
    if (err.code !== "42703") throw err;
    ({ rows } = await pool.query(
      `SELECT
         u.id,
         u.platform_role,
         false            AS is_suspended,
         am.arena_id,
         am.role          AS membership_role,
         am.status        AS membership_status,
         false            AS head_coach_flag
       FROM users u
       LEFT JOIN arena_memberships am ON am.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    ));
  }

  if (rows.length === 0) return null;

  const base = rows[0];
  const isSuspended = Boolean(base.is_suspended);

  const roles = [];

  // Super admin is platform-level (not arena-scoped)
  if (base.platform_role === "super_admin") {
    roles.push({ role: "super_admin", arena_id: null, head_coach_flag: false });
  }

  // Arena-scoped roles — only active, non-revoked memberships
  for (const row of rows) {
    if (!row.arena_id || row.membership_status !== "active") continue;
    // Normalise legacy "admin" to "arena_admin"
    const normRole = row.membership_role === "admin" ? "arena_admin" : (row.membership_role ?? "player");
    roles.push({
      role: normRole,
      arena_id: row.arena_id,
      head_coach_flag: Boolean(row.head_coach_flag),
    });
  }

  // Fallback: global player for users with no active memberships
  if (roles.length === 0 || (roles.length === 1 && roles[0].role === "super_admin")) {
    if (base.platform_role !== "super_admin") {
      roles.push({ role: "player", arena_id: null, head_coach_flag: false });
    }
  }

  const effectiveRole = deriveEffectiveRole(roles);

  const resolved = { userId: Number(userId), isSuspended, effectiveRole, roles };

  // ── 3. Populate Redis ─────────────────────────────────────────────────────
  await redisSetex(cacheKey(userId), CACHE_TTL_SECONDS, resolved);

  return resolved;
}

/**
 * Returns the effective role for a user in the context of a specific arena.
 * Super admin always returns "super_admin".
 * If the user has no membership at this arena returns "player" (they're a visitor there).
 */
export function getArenaRole(resolved, arenaId) {
  if (!resolved) return "visitor";
  if (resolved.effectiveRole === "super_admin") return "super_admin";
  const match = resolved.roles.find(
    (r) => r.arena_id === arenaId || r.arena_id === Number(arenaId)
  );
  return match?.role ?? "player";
}

/**
 * Returns true if the user can access this arena at all.
 * Super admins have global access. Players have access to all arenas (they can browse).
 * But for admin/coach operations, scope must be explicitly checked.
 */
export function canAccessArena(resolved, arenaId) {
  if (!resolved) return false;
  if (resolved.effectiveRole === "super_admin") return true;
  return true; // players can access any arena (read/book); admin ops are checked per-action
}

/**
 * Returns true if the user is an admin or coach at this specific arena.
 */
export function isStaffAtArena(resolved, arenaId) {
  if (!resolved) return false;
  if (resolved.effectiveRole === "super_admin") return true;
  return resolved.roles.some(
    (r) => (r.arena_id === arenaId || r.arena_id === Number(arenaId)) &&
           ["arena_admin", "coach"].includes(r.role)
  );
}

/**
 * Returns true if the user is an admin (or super admin) at this arena.
 */
export function isAdminAtArena(resolved, arenaId) {
  if (!resolved) return false;
  if (resolved.effectiveRole === "super_admin") return true;
  return resolved.roles.some(
    (r) => (r.arena_id === arenaId || r.arena_id === Number(arenaId)) &&
           r.role === "arena_admin"
  );
}

/**
 * Returns true if the user is a coach at this arena.
 */
export function isCoachAtArena(resolved, arenaId) {
  if (!resolved) return false;
  if (resolved.effectiveRole === "super_admin") return true;
  return resolved.roles.some(
    (r) => (r.arena_id === arenaId || r.arena_id === Number(arenaId)) &&
           ["coach", "arena_admin"].includes(r.role)
  );
}

/**
 * Returns the head_coach_flag for this user at this arena (if applicable).
 */
export function isHeadCoachAtArena(resolved, arenaId) {
  if (!resolved) return false;
  const membership = resolved.roles.find(
    (r) => (r.arena_id === arenaId || r.arena_id === Number(arenaId)) &&
           r.role === "coach"
  );
  return Boolean(membership?.head_coach_flag);
}

/**
 * MUST be called after any write to arena_memberships.
 * Invalidates immediately; does not wait for TTL.
 */
export async function invalidateRoleCache(userId) {
  await redisDel(cacheKey(userId));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveEffectiveRole(roles) {
  if (roles.some((r) => r.role === "super_admin")) return "super_admin";
  if (roles.some((r) => r.role === "arena_admin")) return "arena_admin";
  if (roles.some((r) => r.role === "coach"))       return "coach";
  return "player";
}

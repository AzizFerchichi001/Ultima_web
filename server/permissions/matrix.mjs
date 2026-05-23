/**
 * PERMISSION MATRIX — single source of truth.
 *
 * Every protected route MUST import `can()` or `PERMISSION_MATRIX` from this
 * file. No inline role checks anywhere else in the codebase.
 *
 * Role names used throughout:
 *   visitor     — not logged in
 *   player      — default authenticated user
 *   coach       — player promoted by an arena admin (arena-scoped)
 *   arena_admin — manages a single arena (arena-scoped)
 *   super_admin — server owner (global)
 *
 * Arena scoping is enforced in resolveRoles.mjs and the permission middleware,
 * NOT here. This file defines WHAT each role can do; scoping defines WHERE.
 */

// ── Action constants ──────────────────────────────────────────────────────────

export const ACTIONS = Object.freeze({

  // Public / visitor
  ARENA_READ:               "arena:read",
  COURT_READ:               "court:read",
  COACH_PROFILE_READ:       "coach_profile:read",
  COMPETITION_READ:         "competition:read",
  LIVE_SCORES_READ:         "live_scores:read",

  // Player
  COURT_BOOK:               "court:book",
  RESERVATION_CREATE:       "reservation:create",
  RESERVATION_VIEW_OWN:     "reservation:view_own",
  RESERVATION_CANCEL_OWN:   "reservation:cancel_own",
  PROFILE_EDIT_OWN:         "profile:edit_own",
  STATS_VIEW_OWN:           "stats:view_own",
  AI_VIEW_OWN:              "ai:view_own",
  AI_FLAG_SCORE:            "ai:flag_score",
  COMPETITION_REGISTER:     "competition:register",
  NOTIFICATION_VIEW_OWN:    "notification:view_own",
  COACHING_REQUEST_CREATE:  "coaching_request:create",
  COACHING_REQUEST_VIEW_OWN:"coaching_request:view_own",
  RATE_COACH:               "rate:coach",
  RATE_ARENA:               "rate:arena",
  CLIP_SHARE:               "clip:share",
  CLIP_UPLOAD:              "clip:upload",

  // Coach — at their arena only (enforced by scope check, not this matrix)
  COACH_SCHEDULE_VIEW:      "coach:schedule_view",
  COACH_AVAILABILITY_MANAGE:"coach:availability_manage",
  COACH_STUDENT_STATS:      "coach:student_stats",
  COACH_SESSION_NOTES:      "coach:session_notes",
  COACH_DRILL_MANAGE:       "coach:drill_manage",
  COACH_GOALS_MANAGE:       "coach:goals_manage",
  COACH_VIDEO_ANNOTATE:     "coach:video_annotate",
  COACH_RECOMMEND_STUDENT:  "coach:recommend_student",
  COACH_INCOME_VIEW:        "coach:income_view",
  COACHING_REQUEST_RESPOND: "coaching_request:respond",

  // Arena admin — scoped to their arena
  RESERVATION_VIEW_ARENA:   "reservation:view_arena",
  RESERVATION_CANCEL_ANY:   "reservation:cancel_any",
  USER_VIEW_ARENA:          "user:view_arena",
  USER_PROMOTE_COACH:       "user:promote_coach",
  USER_DEMOTE_COACH:        "user:demote_coach",
  USER_SUSPEND_ARENA:       "user:suspend_arena",
  ARENA_MANAGE_OWN:         "arena:manage_own",
  COURT_MANAGE:             "court:manage",
  COMPETITION_MANAGE:       "competition:manage",
  FINANCE_VIEW_ARENA:       "finance:view_arena",
  FINANCE_REFUND:           "finance:refund",
  AI_CORRECT_SCORE:         "ai:correct_score",
  AI_REVIEW_QUEUE:          "ai:review_queue",
  STATS_VIEW_ARENA:         "stats:view_arena",
  NOTIFICATION_SEND_ARENA:  "notification:send_arena",
  AUDIT_VIEW_ARENA:         "audit:view_arena",
  COACH_HIRE:               "coach:hire",
  COACH_FIRE:               "coach:fire",
  COACH_HEAD_FLAG_GRANT:    "coach:head_flag_grant",
  EXPORT_ARENA_DATA:        "export:arena_data",
  LIVE_SESSION_MANAGE:      "live_session:manage",

  // Super admin — global
  ARENA_CREATE:             "arena:create",
  ARENA_DELETE:             "arena:delete",
  ARENA_MANAGE_ALL:         "arena:manage_all",
  USER_PROMOTE_ADMIN:       "user:promote_admin",
  USER_SUSPEND_GLOBAL:      "user:suspend_global",
  USER_BAN:                 "user:ban",
  FINANCE_VIEW_ALL:         "finance:view_all",
  STATS_VIEW_ALL:           "stats:view_all",
  AI_REPROCESS:             "ai:reprocess",
  SYSTEM_HEALTH:            "system:health",
  SYSTEM_MANAGE:            "system:manage",
  INTERNAL_ACCESS:          "internal:access",
  NOTIFICATION_SEND_ALL:    "notification:send_all",
  AUDIT_VIEW_ALL:           "audit:view_all",
  EXPORT_ALL:               "export:all",
  MODEL_DEPLOY:             "model:deploy",
  ANNOTATION_ACCESS:        "annotation:access",
});

// ── Matrix ────────────────────────────────────────────────────────────────────
// Format: action → minimum roles that can perform it (inclusive of higher roles).
// Super admin can ALWAYS do everything except coaching players (separation of concerns).

const ROLE_HIERARCHY = ["visitor", "player", "coach", "arena_admin", "super_admin"];

/**
 * Map of action → array of roles that may perform it.
 * Higher-privilege roles are always additive.
 */
export const PERMISSION_MATRIX = Object.freeze({

  // ── Visitor+ (public) ──
  [ACTIONS.ARENA_READ]:               ["visitor", "player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.COURT_READ]:               ["visitor", "player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.COACH_PROFILE_READ]:       ["visitor", "player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.COMPETITION_READ]:         ["visitor", "player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.LIVE_SCORES_READ]:         ["visitor", "player", "coach", "arena_admin", "super_admin"],

  // ── Player+ ──
  [ACTIONS.COURT_BOOK]:               ["player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.RESERVATION_CREATE]:       ["player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.RESERVATION_VIEW_OWN]:     ["player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.RESERVATION_CANCEL_OWN]:   ["player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.PROFILE_EDIT_OWN]:         ["player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.STATS_VIEW_OWN]:           ["player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.AI_VIEW_OWN]:              ["player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.AI_FLAG_SCORE]:            ["player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.COMPETITION_REGISTER]:     ["player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.NOTIFICATION_VIEW_OWN]:    ["player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.COACHING_REQUEST_CREATE]:  ["player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.COACHING_REQUEST_VIEW_OWN]:["player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.RATE_COACH]:               ["player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.RATE_ARENA]:               ["player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.CLIP_SHARE]:               ["player", "coach", "arena_admin", "super_admin"],
  [ACTIONS.CLIP_UPLOAD]:              ["player", "coach", "arena_admin", "super_admin"],

  // ── Coach+ (at their arena) ──
  [ACTIONS.COACH_SCHEDULE_VIEW]:      ["coach", "arena_admin", "super_admin"],
  [ACTIONS.COACH_AVAILABILITY_MANAGE]:["coach", "arena_admin", "super_admin"],
  [ACTIONS.COACH_STUDENT_STATS]:      ["coach", "arena_admin", "super_admin"],
  [ACTIONS.COACH_SESSION_NOTES]:      ["coach", "arena_admin", "super_admin"],
  [ACTIONS.COACH_DRILL_MANAGE]:       ["coach", "arena_admin", "super_admin"],
  [ACTIONS.COACH_GOALS_MANAGE]:       ["coach", "arena_admin", "super_admin"],
  [ACTIONS.COACH_VIDEO_ANNOTATE]:     ["coach", "arena_admin", "super_admin"],
  [ACTIONS.COACH_RECOMMEND_STUDENT]:  ["coach", "arena_admin", "super_admin"],
  [ACTIONS.COACH_INCOME_VIEW]:        ["coach", "arena_admin", "super_admin"],
  [ACTIONS.COACHING_REQUEST_RESPOND]: ["coach", "arena_admin", "super_admin"],

  // ── Arena Admin+ ──
  [ACTIONS.RESERVATION_VIEW_ARENA]:   ["arena_admin", "super_admin"],
  [ACTIONS.RESERVATION_CANCEL_ANY]:   ["arena_admin", "super_admin"],
  [ACTIONS.USER_VIEW_ARENA]:          ["arena_admin", "super_admin"],
  [ACTIONS.USER_PROMOTE_COACH]:       ["arena_admin", "super_admin"],
  [ACTIONS.USER_DEMOTE_COACH]:        ["arena_admin", "super_admin"],
  [ACTIONS.USER_SUSPEND_ARENA]:       ["arena_admin", "super_admin"],
  [ACTIONS.ARENA_MANAGE_OWN]:         ["arena_admin", "super_admin"],
  [ACTIONS.COURT_MANAGE]:             ["arena_admin", "super_admin"],
  [ACTIONS.COMPETITION_MANAGE]:       ["arena_admin", "super_admin"],
  [ACTIONS.FINANCE_VIEW_ARENA]:       ["arena_admin", "super_admin"],
  [ACTIONS.FINANCE_REFUND]:           ["arena_admin", "super_admin"],
  [ACTIONS.AI_CORRECT_SCORE]:         ["arena_admin", "super_admin"],
  [ACTIONS.AI_REVIEW_QUEUE]:          ["arena_admin", "super_admin"],
  [ACTIONS.STATS_VIEW_ARENA]:         ["arena_admin", "super_admin"],
  [ACTIONS.NOTIFICATION_SEND_ARENA]:  ["arena_admin", "super_admin"],
  [ACTIONS.AUDIT_VIEW_ARENA]:         ["arena_admin", "super_admin"],
  [ACTIONS.COACH_HIRE]:               ["arena_admin", "super_admin"],
  [ACTIONS.COACH_FIRE]:               ["arena_admin", "super_admin"],
  [ACTIONS.COACH_HEAD_FLAG_GRANT]:    ["arena_admin", "super_admin"],
  [ACTIONS.EXPORT_ARENA_DATA]:        ["arena_admin", "super_admin"],
  [ACTIONS.LIVE_SESSION_MANAGE]:      ["arena_admin", "super_admin"],

  // ── Super Admin only ──
  [ACTIONS.ARENA_CREATE]:             ["super_admin"],
  [ACTIONS.ARENA_DELETE]:             ["super_admin"],
  [ACTIONS.ARENA_MANAGE_ALL]:         ["super_admin"],
  [ACTIONS.USER_PROMOTE_ADMIN]:       ["super_admin"],
  [ACTIONS.USER_SUSPEND_GLOBAL]:      ["super_admin"],
  [ACTIONS.USER_BAN]:                 ["super_admin"],
  [ACTIONS.FINANCE_VIEW_ALL]:         ["super_admin"],
  [ACTIONS.STATS_VIEW_ALL]:           ["super_admin"],
  [ACTIONS.AI_REPROCESS]:             ["super_admin"],
  [ACTIONS.SYSTEM_HEALTH]:            ["super_admin"],
  [ACTIONS.SYSTEM_MANAGE]:            ["super_admin"],
  [ACTIONS.INTERNAL_ACCESS]:          ["super_admin"],
  [ACTIONS.NOTIFICATION_SEND_ALL]:    ["super_admin"],
  [ACTIONS.AUDIT_VIEW_ALL]:           ["super_admin"],
  [ACTIONS.EXPORT_ALL]:               ["super_admin"],
  [ACTIONS.MODEL_DEPLOY]:             ["super_admin"],
  [ACTIONS.ANNOTATION_ACCESS]:        ["super_admin"],
});

// ── Helper functions ──────────────────────────────────────────────────────────

/**
 * Returns true if the given role is allowed to perform the action.
 * This is a ROLE-ONLY check; arena scoping must be verified separately.
 */
export function can(role, action) {
  const allowed = PERMISSION_MATRIX[action];
  if (!allowed) return false;
  return allowed.includes(role ?? "visitor");
}

/**
 * Returns the position of a role in the hierarchy (higher = more privilege).
 */
export function roleRank(role) {
  const idx = ROLE_HIERARCHY.indexOf(role);
  return idx === -1 ? -1 : idx;
}

/**
 * Returns true if roleA is at least as privileged as roleB.
 */
export function roleAtLeast(roleA, roleB) {
  return roleRank(roleA) >= roleRank(roleB);
}

export { ROLE_HIERARCHY };

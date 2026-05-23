/**
 * Permission matrix tests.
 *
 * Run: npm test (vitest)
 * These tests verify the central permission matrix without touching the DB.
 *
 * Test strategy: for each role × action combination that the spec defines,
 * assert the expected allow/deny. Then verify that no unexpected cross-role
 * access is possible.
 */

import { describe, it, expect } from "vitest";
import { can, ACTIONS, PERMISSION_MATRIX, roleAtLeast, ROLE_HIERARCHY } from "../../server/permissions/matrix.mjs";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALL_ROLES = ["visitor", "player", "coach", "arena_admin", "super_admin"];
const ALL_ACTIONS = Object.values(ACTIONS);

// ── 1. Matrix completeness ────────────────────────────────────────────────────

describe("PERMISSION_MATRIX completeness", () => {
  it("every ACTIONS constant has an entry in PERMISSION_MATRIX", () => {
    for (const action of ALL_ACTIONS) {
      expect(PERMISSION_MATRIX).toHaveProperty(action, expect.any(Array));
    }
  });

  it("every entry in PERMISSION_MATRIX uses valid role names", () => {
    for (const [action, roles] of Object.entries(PERMISSION_MATRIX)) {
      for (const role of roles) {
        expect(ALL_ROLES, `action ${action} has unknown role: ${role}`).toContain(role);
      }
    }
  });
});

// ── 2. Visitor — can only access public actions ───────────────────────────────

describe("visitor permissions", () => {
  const publicActions = [
    ACTIONS.ARENA_READ,
    ACTIONS.COURT_READ,
    ACTIONS.COACH_PROFILE_READ,
    ACTIONS.COMPETITION_READ,
    ACTIONS.LIVE_SCORES_READ,
  ];

  it("visitor can access all public actions", () => {
    for (const action of publicActions) {
      expect(can("visitor", action), `visitor should be able to ${action}`).toBe(true);
    }
  });

  it("visitor cannot book courts or see own stats", () => {
    const denied = [
      ACTIONS.COURT_BOOK,
      ACTIONS.RESERVATION_CREATE,
      ACTIONS.STATS_VIEW_OWN,
      ACTIONS.AI_VIEW_OWN,
      ACTIONS.AI_FLAG_SCORE,
    ];
    for (const action of denied) {
      expect(can("visitor", action), `visitor should NOT be able to ${action}`).toBe(false);
    }
  });

  it("visitor cannot access any admin or coach actions", () => {
    const adminActions = [
      ACTIONS.USER_PROMOTE_COACH,
      ACTIONS.AI_CORRECT_SCORE,
      ACTIONS.FINANCE_VIEW_ARENA,
      ACTIONS.ARENA_CREATE,
    ];
    for (const action of adminActions) {
      expect(can("visitor", action)).toBe(false);
    }
  });
});

// ── 3. Player — standard authenticated user ───────────────────────────────────

describe("player permissions", () => {
  it("player can book courts and manage own reservations", () => {
    expect(can("player", ACTIONS.COURT_BOOK)).toBe(true);
    expect(can("player", ACTIONS.RESERVATION_CREATE)).toBe(true);
    expect(can("player", ACTIONS.RESERVATION_CANCEL_OWN)).toBe(true);
    expect(can("player", ACTIONS.RESERVATION_VIEW_OWN)).toBe(true);
  });

  it("player can view own stats and flag scores", () => {
    expect(can("player", ACTIONS.STATS_VIEW_OWN)).toBe(true);
    expect(can("player", ACTIONS.AI_VIEW_OWN)).toBe(true);
    expect(can("player", ACTIONS.AI_FLAG_SCORE)).toBe(true);
  });

  it("player cannot correct scores or see review queue", () => {
    expect(can("player", ACTIONS.AI_CORRECT_SCORE)).toBe(false);
    expect(can("player", ACTIONS.AI_REVIEW_QUEUE)).toBe(false);
  });

  it("player cannot access admin actions", () => {
    expect(can("player", ACTIONS.USER_PROMOTE_COACH)).toBe(false);
    expect(can("player", ACTIONS.COURT_MANAGE)).toBe(false);
    expect(can("player", ACTIONS.COMPETITION_MANAGE)).toBe(false);
    expect(can("player", ACTIONS.FINANCE_VIEW_ARENA)).toBe(false);
    expect(can("player", ACTIONS.RESERVATION_VIEW_ARENA)).toBe(false);
  });

  it("player cannot access internal/super-admin actions", () => {
    expect(can("player", ACTIONS.INTERNAL_ACCESS)).toBe(false);
    expect(can("player", ACTIONS.ARENA_CREATE)).toBe(false);
    expect(can("player", ACTIONS.USER_BAN)).toBe(false);
  });
});

// ── 4. Coach ──────────────────────────────────────────────────────────────────

describe("coach permissions", () => {
  it("coach inherits all player permissions", () => {
    const playerActions = [
      ACTIONS.COURT_BOOK,
      ACTIONS.RESERVATION_CREATE,
      ACTIONS.STATS_VIEW_OWN,
      ACTIONS.AI_FLAG_SCORE,
      ACTIONS.COMPETITION_REGISTER,
    ];
    for (const action of playerActions) {
      expect(can("coach", action), `coach should inherit player action ${action}`).toBe(true);
    }
  });

  it("coach can manage their own schedule and students", () => {
    expect(can("coach", ACTIONS.COACH_SCHEDULE_VIEW)).toBe(true);
    expect(can("coach", ACTIONS.COACH_AVAILABILITY_MANAGE)).toBe(true);
    expect(can("coach", ACTIONS.COACH_STUDENT_STATS)).toBe(true);
    expect(can("coach", ACTIONS.COACH_SESSION_NOTES)).toBe(true);
    expect(can("coach", ACTIONS.COACH_DRILL_MANAGE)).toBe(true);
    expect(can("coach", ACTIONS.COACH_GOALS_MANAGE)).toBe(true);
    expect(can("coach", ACTIONS.COACH_VIDEO_ANNOTATE)).toBe(true);
    expect(can("coach", ACTIONS.COACH_INCOME_VIEW)).toBe(true);
  });

  it("coach cannot promote players or manage the arena", () => {
    expect(can("coach", ACTIONS.USER_PROMOTE_COACH)).toBe(false);
    expect(can("coach", ACTIONS.COURT_MANAGE)).toBe(false);
    expect(can("coach", ACTIONS.FINANCE_VIEW_ARENA)).toBe(false);
    expect(can("coach", ACTIONS.AI_CORRECT_SCORE)).toBe(false);
  });

  it("coach cannot access internal routes", () => {
    expect(can("coach", ACTIONS.INTERNAL_ACCESS)).toBe(false);
    expect(can("coach", ACTIONS.ARENA_CREATE)).toBe(false);
    expect(can("coach", ACTIONS.USER_BAN)).toBe(false);
  });
});

// ── 5. Arena Admin ────────────────────────────────────────────────────────────

describe("arena_admin permissions", () => {
  it("arena admin inherits all coach and player permissions", () => {
    const inherited = [
      ACTIONS.COURT_BOOK,
      ACTIONS.RESERVATION_CREATE,
      ACTIONS.COACH_SCHEDULE_VIEW,
      ACTIONS.COACH_STUDENT_STATS,
      ACTIONS.STATS_VIEW_OWN,
    ];
    for (const action of inherited) {
      expect(can("arena_admin", action), `arena_admin should inherit ${action}`).toBe(true);
    }
  });

  it("arena admin can manage their arena fully", () => {
    expect(can("arena_admin", ACTIONS.USER_PROMOTE_COACH)).toBe(true);
    expect(can("arena_admin", ACTIONS.USER_DEMOTE_COACH)).toBe(true);
    expect(can("arena_admin", ACTIONS.COURT_MANAGE)).toBe(true);
    expect(can("arena_admin", ACTIONS.COMPETITION_MANAGE)).toBe(true);
    expect(can("arena_admin", ACTIONS.FINANCE_VIEW_ARENA)).toBe(true);
    expect(can("arena_admin", ACTIONS.FINANCE_REFUND)).toBe(true);
    expect(can("arena_admin", ACTIONS.AI_CORRECT_SCORE)).toBe(true);
    expect(can("arena_admin", ACTIONS.AI_REVIEW_QUEUE)).toBe(true);
    expect(can("arena_admin", ACTIONS.RESERVATION_VIEW_ARENA)).toBe(true);
    expect(can("arena_admin", ACTIONS.RESERVATION_CANCEL_ANY)).toBe(true);
    expect(can("arena_admin", ACTIONS.LIVE_SESSION_MANAGE)).toBe(true);
    expect(can("arena_admin", ACTIONS.EXPORT_ARENA_DATA)).toBe(true);
  });

  it("arena admin cannot access super-admin-only actions", () => {
    expect(can("arena_admin", ACTIONS.INTERNAL_ACCESS)).toBe(false);
    expect(can("arena_admin", ACTIONS.ARENA_CREATE)).toBe(false);
    expect(can("arena_admin", ACTIONS.ARENA_DELETE)).toBe(false);
    expect(can("arena_admin", ACTIONS.USER_PROMOTE_ADMIN)).toBe(false);
    expect(can("arena_admin", ACTIONS.USER_BAN)).toBe(false);
    expect(can("arena_admin", ACTIONS.STATS_VIEW_ALL)).toBe(false);
    expect(can("arena_admin", ACTIONS.AUDIT_VIEW_ALL)).toBe(false);
  });
});

// ── 6. Super Admin ────────────────────────────────────────────────────────────

describe("super_admin permissions", () => {
  it("super admin can perform every action in the matrix", () => {
    for (const action of ALL_ACTIONS) {
      expect(can("super_admin", action), `super_admin should be able to ${action}`).toBe(true);
    }
  });

  it("super admin can access internal routes", () => {
    expect(can("super_admin", ACTIONS.INTERNAL_ACCESS)).toBe(true);
    expect(can("super_admin", ACTIONS.SYSTEM_HEALTH)).toBe(true);
    expect(can("super_admin", ACTIONS.AUDIT_VIEW_ALL)).toBe(true);
    expect(can("super_admin", ACTIONS.ARENA_CREATE)).toBe(true);
    expect(can("super_admin", ACTIONS.USER_BAN)).toBe(true);
    expect(can("super_admin", ACTIONS.MODEL_DEPLOY)).toBe(true);
  });
});

// ── 7. Privilege escalation — no role should punch above its level ────────────

describe("privilege escalation checks", () => {
  const superAdminOnlyActions = [
    ACTIONS.INTERNAL_ACCESS,
    ACTIONS.ARENA_CREATE,
    ACTIONS.ARENA_DELETE,
    ACTIONS.USER_PROMOTE_ADMIN,
    ACTIONS.USER_BAN,
    ACTIONS.MODEL_DEPLOY,
    ACTIONS.ANNOTATION_ACCESS,
    ACTIONS.STATS_VIEW_ALL,
    ACTIONS.AUDIT_VIEW_ALL,
    ACTIONS.EXPORT_ALL,
    ACTIONS.SYSTEM_MANAGE,
  ];

  const nonSuperRoles = ["visitor", "player", "coach", "arena_admin"];

  it("no non-super-admin role can access super-admin-only actions", () => {
    for (const role of nonSuperRoles) {
      for (const action of superAdminOnlyActions) {
        expect(
          can(role, action),
          `${role} should NOT be able to ${action}`
        ).toBe(false);
      }
    }
  });
});

// ── 8. Role hierarchy ─────────────────────────────────────────────────────────

describe("role hierarchy", () => {
  it("ROLE_HIERARCHY is ordered from least to most privileged", () => {
    expect(ROLE_HIERARCHY).toEqual(["visitor", "player", "coach", "arena_admin", "super_admin"]);
  });

  it("roleAtLeast returns correct results", () => {
    expect(roleAtLeast("super_admin", "player")).toBe(true);
    expect(roleAtLeast("player", "super_admin")).toBe(false);
    expect(roleAtLeast("coach", "coach")).toBe(true);
    expect(roleAtLeast("arena_admin", "coach")).toBe(true);
    expect(roleAtLeast("visitor", "player")).toBe(false);
  });
});

// ── 9. Unknown actions / roles ────────────────────────────────────────────────

describe("edge cases", () => {
  it("can() returns false for unknown action", () => {
    expect(can("super_admin", "nonexistent:action")).toBe(false);
  });

  it("can() returns false for null role (visitor fallback)", () => {
    expect(can(null, ACTIONS.COURT_BOOK)).toBe(false);
    expect(can(undefined, ACTIONS.COURT_READ)).toBe(true); // public
  });

  it("can() handles unknown role gracefully", () => {
    expect(can("hacker", ACTIONS.COURT_BOOK)).toBe(false);
    expect(can("hacker", ACTIONS.INTERNAL_ACCESS)).toBe(false);
  });
});

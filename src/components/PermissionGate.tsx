/**
 * PermissionGate — wraps any UI element that should be disabled or hidden
 * based on the current user's role.
 *
 * Per spec: SHOW items but DISABLE with reason. Never silently hide.
 * Exception: super-admin tools are not shown at all to other roles.
 *
 * Usage:
 *   <PermissionGate action="court:book" disabledReason="Sign in to book a court">
 *     <Button>Book</Button>
 *   </PermissionGate>
 *
 *   <PermissionGate action="internal:access" hiddenForUnauthorised>
 *     <InternalNavLink />
 *   </PermissionGate>
 */
import { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getSessionUser } from "@/lib/session";

// Client-side permission check mirrors the server matrix.
// This is for UX only — the server enforces authoritatively.
const PERMISSION_MATRIX: Record<string, string[]> = {
  "arena:read":               ["visitor", "player", "coach", "admin", "super_admin"],
  "court:read":               ["visitor", "player", "coach", "admin", "super_admin"],
  "competition:read":         ["visitor", "player", "coach", "admin", "super_admin"],
  "court:book":               ["player", "coach", "admin", "super_admin"],
  "reservation:create":       ["player", "coach", "admin", "super_admin"],
  "reservation:view_own":     ["player", "coach", "admin", "super_admin"],
  "reservation:cancel_own":   ["player", "coach", "admin", "super_admin"],
  "stats:view_own":           ["player", "coach", "admin", "super_admin"],
  "ai:view_own":              ["player", "coach", "admin", "super_admin"],
  "ai:flag_score":            ["player", "coach", "admin", "super_admin"],
  "competition:register":     ["player", "coach", "admin", "super_admin"],
  "coaching_request:create":  ["player", "coach", "admin", "super_admin"],
  "coach:schedule_view":      ["coach", "admin", "super_admin"],
  "coach:availability_manage":["coach", "admin", "super_admin"],
  "coach:student_stats":      ["coach", "admin", "super_admin"],
  "coach:drill_manage":       ["coach", "admin", "super_admin"],
  "coach:goals_manage":       ["coach", "admin", "super_admin"],
  "coach:video_annotate":     ["coach", "admin", "super_admin"],
  "coach:income_view":        ["coach", "admin", "super_admin"],
  "reservation:view_arena":   ["admin", "super_admin"],
  "reservation:cancel_any":   ["admin", "super_admin"],
  "user:promote_coach":       ["admin", "super_admin"],
  "court:manage":             ["admin", "super_admin"],
  "competition:manage":       ["admin", "super_admin"],
  "finance:view_arena":       ["admin", "super_admin"],
  "ai:correct_score":         ["admin", "super_admin"],
  "ai:review_queue":          ["admin", "super_admin"],
  "live_session:manage":      ["admin", "super_admin"],
  "arena:create":             ["super_admin"],
  "user:promote_admin":       ["super_admin"],
  "internal:access":          ["super_admin"],
  "system:health":            ["super_admin"],
  "audit:view_all":           ["super_admin"],
};

function clientCan(role: string | undefined, action: string): boolean {
  const effectiveRole = normaliseRole(role);
  const allowed = PERMISSION_MATRIX[action];
  if (!allowed) return false;
  return allowed.includes(effectiveRole);
}

function normaliseRole(role?: string): string {
  if (!role) return "visitor";
  if (role === "admin") return "admin"; // arena_admin on client side
  return role;
}

interface PermissionGateProps {
  /** Action key from the permission matrix, e.g. "court:book" */
  action: string;
  children: ReactNode;
  /** If true, renders nothing for unauthorised users instead of disabling */
  hiddenForUnauthorised?: boolean;
  /** Tooltip message shown when the element is disabled */
  disabledReason?: string;
}

const PermissionGate = ({
  action,
  children,
  hiddenForUnauthorised = false,
  disabledReason,
}: PermissionGateProps) => {
  const user = getSessionUser();
  const allowed = clientCan(user?.role, action);

  if (allowed) return <>{children}</>;

  // Super-admin tools are hidden entirely from other roles
  if (hiddenForUnauthorised) return null;

  // Everything else: show but disable with reason
  const reason = disabledReason ??
    (!user ? "Sign in to continue" : "You don't have permission for this action");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-not-allowed" tabIndex={-1} aria-disabled="true">
          <span
            className="pointer-events-none select-none opacity-40"
            aria-hidden="true"
          >
            {children}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs">{reason}</p>
      </TooltipContent>
    </Tooltip>
  );
};

export default PermissionGate;

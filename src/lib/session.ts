const TOKEN_KEY = "ultima-demo-token";
const REFRESH_TOKEN_KEY = "ultima-demo-refresh-token";
const USER_KEY = "ultima-demo-user";

export type SessionUser = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: "player" | "coach" | "admin" | "super_admin";
  status: string;
  accountStatus: string;
  platformRole: "member" | "super_admin";
  membershipRole: "player" | "coach" | "admin" | null;
  membershipStatus: string | null;
  arenaId: number | null;
  arenaName: string | null;
  cinNumber?: string | null;
  emailVerified?: boolean;
  emailVerifiedAt?: string | null;
  createdAt: string;
};

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setSession(token: string, user: SessionUser, refreshToken?: string | null) {
  localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getSessionUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    clearSession();
    return null;
  }
}

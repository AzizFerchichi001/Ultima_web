import { clearSession, getRefreshToken, getToken, setSession } from "@/lib/session";

type RequestOptions = Omit<RequestInit, "body"> & {
  authenticated?: boolean;
  body?: BodyInit | null | Record<string, unknown>;
};

export function resolveApiUrl(path: string) {
  const explicit = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_API_URL;
  if (explicit) {
    return `${explicit.replace(/\/+$/, "")}${path}`;
  }

  if (typeof window !== "undefined" && window.location.port === "5173") {
    return `http://localhost:4001${path}`;
  }

  return path;
}

export async function api<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const resolvedUrl = resolveApiUrl(url);
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (options.authenticated) {
    const token = getToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const resolveBody = (b: RequestOptions["body"]) =>
    b && typeof b === "object" && !(b instanceof FormData) && !(b instanceof URLSearchParams) && !(b instanceof ReadableStream) && !(b instanceof ArrayBuffer) && !ArrayBuffer.isView(b)
      ? JSON.stringify(b)
      : b as BodyInit | null | undefined;

  let response = await fetch(resolvedUrl, {
    ...options,
    body: resolveBody(options.body),
    headers,
  });

  if (response.status === 401 && options.authenticated) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      const refreshResponse = await fetch(resolveApiUrl("/api/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const refreshPayload = await refreshResponse.json().catch(() => ({}));
      if (refreshResponse.ok && refreshPayload.token && refreshPayload.user) {
        setSession(refreshPayload.token, refreshPayload.user, refreshPayload.refreshToken ?? refreshToken);
        const retryHeaders = new Headers(options.headers);
        retryHeaders.set("Content-Type", "application/json");
        retryHeaders.set("Authorization", `Bearer ${refreshPayload.token}`);
        response = await fetch(resolvedUrl, {
          ...options,
          body: resolveBody(options.body),
          headers: retryHeaders,
        });
      } else {
        clearSession();
        window.dispatchEvent(new CustomEvent("auth:session-expired"));
      }
    } else {
      clearSession();
      window.dispatchEvent(new CustomEvent("auth:session-expired"));
    }
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message ?? "Une erreur est survenue.");
  }

  return payload as T;
}

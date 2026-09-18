/**
 * NEXT_PUBLIC_API_BASE is inlined at build time. Normalize it once so an
 * accidentally configured trailing slash cannot produce URLs such as
 * `//auth/me` (which browsers treat as a different path/host).
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3010/api")
  .trim()
  .replace(/\/+$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE}/${path.replace(/^\/+/, "")}`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("custodian.accessToken");
}

export function setTokens(accessToken: string, refreshToken: string) {
  window.localStorage.setItem("custodian.accessToken", accessToken);
  window.localStorage.setItem("custodian.refreshToken", refreshToken);
}

export function clearTokens() {
  window.localStorage.removeItem("custodian.accessToken");
  window.localStorage.removeItem("custodian.refreshToken");
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = window.localStorage.getItem("custodian.refreshToken");
  if (!refreshToken) return false;

  const res = await fetch(apiUrl("/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;

  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return true;
}

/**
 * Fetch wrapper: attaches the access token, and on a 401 tries exactly one
 * silent refresh-and-retry before giving up (avoids infinite retry loops on
 * a genuinely revoked session — see AuthService.refresh on the backend).
 */
export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; retry?: boolean } = {},
): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(apiUrl(path), {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && options.retry !== false) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return api<T>(path, { ...options, retry: false });
    clearTokens();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "Session expired");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Multipart upload — same auth/refresh behaviour as `api`, minus the JSON content-type. */
export async function apiUpload<T = unknown>(path: string, file: File, retry = true): Promise<T> {
  const token = getAccessToken();
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (res.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiUpload<T>(path, file, false);
    clearTokens();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "Session expired");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? "Upload failed");
  }
  return res.json();
}

/**
 * Media URLs are short-lived per-attachment signatures, not session tokens.
 *
 * `<img>`/`<audio>` can't send an Authorization header, so something has to
 * travel in the URL. A session JWT there would end up in access logs, browser
 * history and Referer headers — and would grant everything that session can
 * do. A signature grants one attachment for five minutes and is worthless
 * once it expires.
 *
 * Links are cached until shortly before expiry so a long-lived chat view
 * doesn't re-sign the same image on every render.
 */
const linkCache = new Map<string, { url: string; expiresAt: number }>();

export async function attachmentUrl(attachmentId: string): Promise<string> {
  const hit = linkCache.get(attachmentId);
  if (hit && hit.expiresAt > Date.now()) return hit.url;

  const { url } = await api<{ url: string }>(`/attachments/${attachmentId}/link`);
  const absolute = url.startsWith("http") ? url : `${API_BASE.replace(/\/api$/, "")}/${url.replace(/^\/+/, "")}`;
  // Re-sign a minute before the server's 5-minute expiry.
  linkCache.set(attachmentId, { url: absolute, expiresAt: Date.now() + 4 * 60_000 });
  return absolute;
}

/** Status media still uses the session token — see the note in the README. */
export function statusMediaUrl(statusId: string): string {
  const token = getAccessToken();
  return `${apiUrl(`/status/${statusId}/media`)}?token=${encodeURIComponent(token ?? "")}`;
}

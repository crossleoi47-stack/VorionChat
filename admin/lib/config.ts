const configuredApiBase = process.env.NEXT_PUBLIC_API_BASE?.trim();

if (configuredApiBase && !/\/api\/*$/.test(configuredApiBase)) {
  throw new Error(
    "NEXT_PUBLIC_API_BASE must be an API base URL ending in /api, not an endpoint such as /auth/login.",
  );
}

const rawApiBase =
  configuredApiBase ||
  (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:3010/api");

// Keep the configured origin/path canonical and collapse repeated /api suffixes.
export const API_BASE = rawApiBase.replace(/\/+$/, "").replace(/(?:\/api)+$/, "/api");

export function apiUrl(path: string): string {
  return `${API_BASE}/${path.replace(/^\/+/, "")}`;
}

export const SOCKET_BASE = API_BASE.replace(/\/api$/, "");

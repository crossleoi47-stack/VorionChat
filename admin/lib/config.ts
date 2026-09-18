const configuredApiBase = process.env.NEXT_PUBLIC_API_BASE?.trim();

if (process.env.NODE_ENV === "production" && !configuredApiBase) {
  throw new Error(
    "NEXT_PUBLIC_API_BASE is required in production and must be the public backend URL ending in /api.",
  );
}

const rawApiBase = configuredApiBase || "http://localhost:3010/api";

// Keep the configured origin/path canonical, regardless of a user's trailing
// slash or whether they supplied the /api path separately.
export const API_BASE = rawApiBase.replace(/\/+$/, "").replace(/(?:\/api)+$/, "/api");

export function apiUrl(path: string): string {
  return `${API_BASE}/${path.replace(/^\/+/, "")}`;
}

export const SOCKET_BASE = API_BASE.replace(/\/api$/, "");

export type SupabaseConnectionResult = {
  env: {
    SUPABASE_URL: boolean;
    SUPABASE_PUBLISHABLE_KEY: boolean;
    SUPABASE_SECRET_KEY: boolean;
    DATABASE_URL: boolean;
  };
  connection: "SUCCESS" | "FAILED";
  databaseReachable: boolean;
  error?: string;
  details?: string;
};

function hasRealValue(value: string | undefined | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const upper = trimmed.toUpperCase();
  return !(
    upper.includes("PASTE_") ||
    upper.includes("CHANGE_ME") ||
    upper.includes("YOUR_") ||
    upper.includes("TODO") ||
    upper.includes("REPLACE_ME")
  );
}

export async function testSupabaseConnection(): Promise<SupabaseConnectionResult> {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
  const DATABASE_URL = process.env.DATABASE_URL;

  const env = {
    SUPABASE_URL: hasRealValue(SUPABASE_URL),
    SUPABASE_PUBLISHABLE_KEY: hasRealValue(SUPABASE_PUBLISHABLE_KEY),
    SUPABASE_SECRET_KEY: hasRealValue(SUPABASE_SECRET_KEY),
    DATABASE_URL: hasRealValue(DATABASE_URL),
  };

  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SECRET_KEY) {
    return {
      env,
      connection: "FAILED",
      databaseReachable: false,
      error: "Missing usable Supabase environment variables in api/.env",
    };
  }

  try {
    const res = await fetch(`${SUPABASE_URL!.replace(/\/$/, "")}/rest/v1/`, {
      method: "GET",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY!,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY!}`,
      },
    });

    return {
      env,
      connection: res.ok ? "SUCCESS" : "FAILED",
      databaseReachable: res.ok,
      details: `Supabase REST probe returned HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      env,
      connection: "FAILED",
      databaseReachable: false,
      error: error instanceof Error ? error.message : "Unknown Supabase probe error",
    };
  }
}

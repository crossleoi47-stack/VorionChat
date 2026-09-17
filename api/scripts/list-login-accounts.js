// Read-only account lookup. Never prints service keys or password hashes.
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

async function main() {
  const root = path.resolve(__dirname, "../..");
  const env = {};
  for (const relative of ["admin/.env.local", "api/.env", "api/.env.local"]) {
    const file = path.join(root, relative);
    if (fs.existsSync(file)) Object.assign(env, dotenv.parse(fs.readFileSync(file)));
  }
  Object.assign(env, process.env);
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Missing Supabase server configuration.");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.from("users")
    .select("full_name,email,role,status")
    .order("role").limit(100);
  if (error) throw new Error(`Account lookup failed (${error.code}).`);
  console.table(data);
  console.log("Passwords are stored as one-way hashes and cannot be retrieved by this script.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

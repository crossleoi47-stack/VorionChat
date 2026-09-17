const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

function pgUrl() {
  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "";
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    throw new Error("Set SUPABASE_DB_URL or DATABASE_URL to a PostgreSQL DSN for SQL-level schema checks.");
  }
  return url;
}

async function main() {
  const pg = new Client({ connectionString: pgUrl(), ssl: { rejectUnauthorized: false } });
  await pg.connect();

  for (const table of ["users", "companies", "sessions", "audit_log", "audit_logs", "calls"]) {
    const exists = await pg.query("select to_regclass($1) as table_name", [`public.${table}`]);
    console.log(`TABLE ${table}:`, exists.rows[0].table_name || "MISSING");
    if (exists.rows[0].table_name) {
      const columns = await pg.query(
        `
        select column_name, data_type, is_nullable, column_default
        from information_schema.columns
        where table_schema = 'public' and table_name = $1
        order by ordinal_position
        `,
        [table],
      );
      console.log(
        `COLUMNS ${table}:`,
        columns.rows
          .map((row) => `${row.column_name}:${row.data_type}:${row.is_nullable}:${row.column_default || ""}`)
          .join("|"),
      );
    }
  }

  const superAdmin = await pg.query(
    `
    select id, email, role, status, "companyId", "employeeCode"
    from public.users
    where lower(email) = lower($1)
    limit 1
    `,
    ["superadmin@vorion.local"],
  );
  console.log("SUPER_ADMIN_EXISTS:", superAdmin.rowCount > 0 ? "YES" : "NO");

  await pg.query("NOTIFY pgrst, 'reload schema'");
  console.log("POSTGREST_SCHEMA_RELOAD: SENT");
  await pg.end();

  const supabase = createClient(process.env.SUPABASE_URL.replace(/\/$/, ""), process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const probes = [
    ["users_camel", supabase.from("users").select('id,email,"companyId","employeeCode","fullName","passwordHash",role,status').limit(1)],
    ["calls", supabase.from("calls").select("id,companyId,conversationId,callerId,calleeId,type,status,startedAt,answeredAt,endedAt").limit(1)],
  ];
  for (const [name, promise] of probes) {
    const { data, error, count } = await promise;
    console.log(`REST ${name}:`, error ? JSON.stringify(error) : JSON.stringify({ rows: data.length, count: count ?? null }));
  }
}

main().catch((error) => {
  console.error(
    "SUPABASE_RUNTIME_AUDIT_FAILED:",
    JSON.stringify({ name: error?.name, message: error?.message, code: error?.code, detail: error?.detail, hint: error?.hint }, null, 2),
  );
  process.exit(1);
});

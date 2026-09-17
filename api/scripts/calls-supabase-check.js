const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const fallbackPostgresUrl =
  "postgresql://postgres.rljyeqqgbqfltpkpohmx:Roman%403214321123@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const postgresUrl = /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL || "")
    ? process.env.DATABASE_URL
    : fallbackPostgresUrl;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const pg = new Client({ connectionString: postgresUrl, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const existence = await pg.query(`
    select
      to_regclass('public.calls') as calls_table,
      obj_description('public.calls'::regclass) as comment
  `);
  console.log("POSTGRES_TABLE:", JSON.stringify(existence.rows[0]));

  const columns = await pg.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'calls'
    order by ordinal_position
  `);
  console.log("POSTGRES_COLUMNS:", columns.rows.map((row) => row.column_name).join(","));

  const grants = await pg.query(`
    select grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'calls'
    order by grantee, privilege_type
  `);
  console.log("POSTGRES_GRANTS:", JSON.stringify(grants.rows));

  const rls = await pg.query(`
    select relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
    from pg_class
    where oid = 'public.calls'::regclass
  `);
  console.log("POSTGRES_RLS:", JSON.stringify(rls.rows[0]));

  const policies = await pg.query(`
    select policyname, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename = 'calls'
    order by policyname
  `);
  console.log("POSTGRES_POLICIES:", JSON.stringify(policies.rows));

  await pg.query("NOTIFY pgrst, 'reload schema'");
  console.log("POSTGREST_SCHEMA_RELOAD: SENT");
  await pg.end();

  const supabase = createClient(supabaseUrl.replace(/\/$/, ""), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error, count } = await supabase
    .schema("public")
    .from("calls")
    .select("id,companyId,conversationId,callerId,calleeId,type,status,startedAt,answeredAt,endedAt", { count: "exact" })
    .limit(1);

  if (error) throw error;
  console.log("SUPABASE_REST_PUBLIC_CALLS_READ:", JSON.stringify({ count, rows: data.length }));
}

main().catch((error) => {
  console.error(
    "CALLS_SUPABASE_CHECK_FAILED:",
    JSON.stringify(
      {
        name: error?.name,
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
        hint: error?.hint,
        stack: error?.stack,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});

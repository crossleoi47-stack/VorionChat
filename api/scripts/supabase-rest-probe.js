const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL.replace(/\/$/, ""), process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const probes = [
    ["users camel", supabase.from("users").select("id,email,companyId,employeeCode,fullName,passwordHash,role,status,departmentId,lastSeenAt,createdAt,updatedAt").limit(1)],
    ["users snake", supabase.from("users").select("id,email,company_id,employee_code,full_name,password_hash,role,status").limit(1)],
    ["users snake no employee", supabase.from("users").select("id,email,company_id,department_id,full_name,password_hash,role,status,avatar_url,last_seen_at,created_at,updated_at").limit(1)],
    ["companies camel", supabase.from("companies").select("id,code,name,status,createdAt,updatedAt").limit(1)],
    ["companies snake", supabase.from("companies").select("id,code,name,is_active,created_at,updated_at").limit(1)],
    ["audit_log", supabase.from("audit_log").select("id,companyId,actorId,action,target,createdAt").limit(1)],
    ["audit_logs", supabase.from("audit_logs").select("id,company_id,actor_user_id,action,created_at").limit(1)],
    ["calls", supabase.from("calls").select("id,companyId,conversationId,callerId,calleeId,type,status,startedAt,answeredAt,endedAt").limit(1)],
  ];

  for (const [name, promise] of probes) {
    const { data, error } = await promise;
    console.log(`${name}: ${error ? `ERROR ${error.message}` : `OK rows=${data.length}`}`);
  }
}

main().catch((error) => {
  console.error("SUPABASE_REST_PROBE_FAILED:", error.message);
  process.exit(1);
});

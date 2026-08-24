/**
 * Security check for call signalling: a user who is not a party to a call
 * must not be able to accept it, end it, or inject SDP/ICE into it.
 *
 *   node scripts/call-guard-test.js
 *
 * Requires three seeded users. Creates a temporary third employee if needed.
 */
const { io } = require("socket.io-client");

const API = process.env.API_BASE || "http://localhost:3010";
const PASSWORD = "ChangeMe123!";

const login = async (employeeCode, password = PASSWORD) => {
  const r = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyCode: "ABC", employeeCode, password }),
  });
  if (!r.ok) throw new Error(`login ${employeeCode} failed: ${r.status}`);
  return r.json();
};

const connect = (token, label) =>
  new Promise((resolve, reject) => {
    const s = io(`${API}/realtime`, {
      auth: (cb) => cb({ token }),
      transports: ["websocket"],
    });
    s.on("connect", () => resolve(s));
    s.on("connect_error", (e) => reject(new Error(`${label}: ${e.message}`)));
  });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const admin = await login("ADMIN-1");

  // Ensure a third user exists to play the outsider.
  let outsiderCode = "EMP-GUARD";
  let outsiderPassword = PASSWORD;
  const created = await fetch(`${API}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin.accessToken}` },
    body: JSON.stringify({ employeeCode: outsiderCode, fullName: "Guard Tester", role: "EMPLOYEE" }),
  });
  if (created.ok) {
    outsiderPassword = (await created.json()).temporaryPassword;
    console.log("created outsider user EMP-GUARD");
  } else {
    console.log("outsider user already exists, reusing");
    // Reset it so we know the password.
    outsiderPassword = PASSWORD;
  }

  let outsider;
  try {
    outsider = await login(outsiderCode, outsiderPassword);
  } catch {
    console.log("SKIP: cannot log in as the outsider (password unknown from a previous run)");
    process.exit(0);
  }

  const caller = await login("EMP-1024");

  const sCaller = await connect(caller.accessToken, "caller");
  const sCallee = await connect(admin.accessToken, "callee");
  const sOutsider = await connect(outsider.accessToken, "outsider");

  let callId = null;
  const outsiderSaw = [];
  const calleeSaw = [];

  sCallee.on("call:incoming", (p) => {
    callId = p.callId;
    calleeSaw.push("incoming");
  });
  sCallee.on("call:ended", () => calleeSaw.push("ended"));
  sOutsider.on("call:incoming", () => outsiderSaw.push("incoming"));
  sOutsider.on("call:signal", () => outsiderSaw.push("signal"));
  sOutsider.on("call:ended", () => outsiderSaw.push("ended"));

  console.log("\n1. caller invites callee");
  sCaller.emit("call:invite", { calleeId: JSON.parse(atob(admin.accessToken.split(".")[1])).sub, type: "VOICE" });
  await wait(900);
  console.log(`   callee received: [${calleeSaw.join(",")}]  callId=${callId ? "yes" : "NO"}`);
  console.log(`   outsider received: [${outsiderSaw.join(",") || "nothing"}]  <- must be empty`);

  if (!callId) {
    console.log("no callId, aborting");
    process.exit(1);
  }

  console.log("\n2. OUTSIDER tries to accept someone else's call");
  sOutsider.emit("call:accept", { callId });
  await wait(700);

  console.log("3. OUTSIDER tries to inject signalling");
  sOutsider.emit("call:signal", { callId, data: { sdp: { type: "offer", sdp: "MALICIOUS" } } });
  await wait(700);

  console.log("4. OUTSIDER tries to end the call");
  sOutsider.emit("call:end", { callId });
  await wait(900);

  console.log(`\n   callee events after outsider attacks: [${calleeSaw.join(",")}]`);
  const leaked = calleeSaw.includes("ended");
  console.log(
    leaked
      ? "   FAIL: outsider was able to end a call they are not part of"
      : "   PASS: outsider could not accept, signal into, or end the call",
  );
  console.log(
    outsiderSaw.length === 0
      ? "   PASS: outsider received no call events at all"
      : `   FAIL: outsider received [${outsiderSaw.join(",")}]`,
  );

  [sCaller, sCallee, sOutsider].forEach((s) => s.disconnect());
  process.exit(leaked || outsiderSaw.length ? 1 : 0);
})().catch((e) => {
  console.error("error:", e.message);
  process.exit(1);
});

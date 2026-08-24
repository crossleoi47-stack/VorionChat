/**
 * Dev utility: acts as a second user on the signalling channel so you can
 * exercise the call flow without two browsers.
 *
 *   node scripts/call-probe.js ADMIN-1 answer   # auto-answer incoming calls
 *   node scripts/call-probe.js ADMIN-1 decline  # auto-decline
 *
 * It does NOT do WebRTC — no media, no SDP. It verifies signalling only:
 * invite → incoming → accept/decline → ended, plus the authorization guards.
 */
const { io } = require("socket.io-client");

const API = process.env.API_BASE || "http://localhost:3010";
const [, , employeeCode = "ADMIN-1", mode = "answer"] = process.argv;

(async () => {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyCode: "ABC", employeeCode, password: "ChangeMe123!" }),
  });
  if (!res.ok) {
    console.error("login failed", res.status);
    process.exit(1);
  }
  const { accessToken } = await res.json();

  const socket = io(`${API}/realtime`, {
    auth: (cb) => cb({ token: accessToken }),
    transports: ["websocket"],
  });

  socket.on("connect", () => console.log(`[${employeeCode}] connected, waiting for calls (${mode})`));
  socket.on("connect_error", (e) => console.error("connect_error:", e.message));

  socket.on("call:incoming", (p) => {
    console.log(`[${employeeCode}] INCOMING ${p.type} from ${p.callerName} (call ${p.callId})`);
    setTimeout(() => {
      if (mode === "decline") {
        console.log(`[${employeeCode}] declining`);
        socket.emit("call:decline", { callId: p.callId });
      } else {
        console.log(`[${employeeCode}] accepting`);
        socket.emit("call:accept", { callId: p.callId });
      }
    }, 600);
  });

  socket.on("call:signal", (p) =>
    console.log(`[${employeeCode}] got signal for ${p.callId}:`, Object.keys(p.data ?? {}).join(",")),
  );
  socket.on("call:ended", (p) => console.log(`[${employeeCode}] call ended (${p.reason})`));

  setTimeout(() => {
    socket.disconnect();
    process.exit(0);
  }, 45000);
})();

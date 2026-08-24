/**
 * Dev utility: sign in as a user, hold a realtime socket open for N seconds,
 * then disconnect — so you can watch presence flip online→offline in another
 * browser window. Not used by the app.
 *
 *   node scripts/presence-probe.js ADMIN-1 20
 */
const { io } = require("socket.io-client");

const API = process.env.API_BASE || "http://localhost:3010";
const [, , employeeCode = "ADMIN-1", secondsArg = "20"] = process.argv;
const seconds = Number(secondsArg);

(async () => {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyCode: "ABC",
      employeeCode,
      password: "ChangeMe123!",
    }),
  });
  if (!res.ok) {
    console.error("login failed", res.status, await res.text());
    process.exit(1);
  }
  const { accessToken } = await res.json();

  const socket = io(`${API}/realtime`, {
    auth: (cb) => cb({ token: accessToken }),
    transports: ["websocket"],
  });

  socket.on("connect", () => console.log(`${employeeCode} socket connected (${socket.id})`));
  socket.on("connect_error", (e) => console.error("connect_error:", e.message));
  socket.on("presence:update", (p) =>
    console.log("presence:update ->", p.userId.slice(0, 8), p.online ? "ONLINE" : "offline"),
  );

  setTimeout(() => {
    console.log(`${employeeCode} disconnecting`);
    socket.disconnect();
    setTimeout(() => process.exit(0), 500);
  }, seconds * 1000);
})();

import { io, Socket } from "socket.io-client";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3010/api")
  .trim()
  .replace(/\/+$/, "");
const SOCKET_BASE = API_BASE.replace(/\/api\/?$/, "");

let socket: Socket | null = null;

/**
 * One shared socket for the whole app — conversations join/leave rooms on it
 * rather than each opening a new connection.
 *
 * `auth` is a callback, not a static object, on purpose: access tokens expire
 * every 15 minutes and get silently refreshed by lib/api.ts. With a static
 * `auth: {token}` the socket would keep presenting the token it was built
 * with, so the first reconnect after a refresh would be rejected by the
 * gateway and live messages/presence would stop with no visible error. The
 * callback runs on every (re)connection attempt, so it always sends the
 * current token.
 */
export function getSocket(): Socket {
  if (socket) return socket;

  socket = io(`${SOCKET_BASE}/realtime`, {
    auth: (cb) => cb({ token: window.localStorage.getItem("custodian.accessToken") }),
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 8000,
    // Keep trying indefinitely: a laptop that sleeps for an hour should come
    // back online by itself rather than needing a page reload.
    reconnectionAttempts: Infinity,
  });

  return socket;
}

/** Drop the socket on sign-out so the next user doesn't inherit this session. */
export function resetSocket(): void {
  socket?.disconnect();
  socket = null;
}

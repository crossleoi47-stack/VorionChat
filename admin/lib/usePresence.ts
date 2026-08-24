"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";

export interface Presence {
  userId: string;
  online: boolean;
  lastSeenAt: string | null;
}

/**
 * Presence is push-first: the server emits `presence:update` to everyone in
 * the company room. We fetch once for the ids we care about to seed state,
 * then let the socket keep it current. A heartbeat keeps our own presence
 * key alive server-side.
 */
export function usePresence(userIds: (string | null | undefined)[]) {
  const [map, setMap] = useState<Record<string, Presence>>({});
  const fetched = useRef<Set<string>>(new Set());

  const ids = userIds.filter((v): v is string => !!v);
  const key = ids.slice().sort().join(",");

  useEffect(() => {
    const missing = ids.filter((id) => !fetched.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => fetched.current.add(id));

    api<Presence[]>(`/presence?ids=${encodeURIComponent(missing.join(","))}`)
      .then((list) =>
        setMap((prev) => {
          const next = { ...prev };
          list.forEach((p) => (next[p.userId] = p));
          return next;
        }),
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const socket = getSocket();
    const onUpdate = (p: Presence) => setMap((prev) => ({ ...prev, [p.userId]: p }));
    socket.on("presence:update", onUpdate);

    // Refresh our own TTL well inside the server's 70s expiry.
    const beat = setInterval(() => socket.emit("presence:ping"), 30_000);
    socket.emit("presence:ping");

    return () => {
      socket.off("presence:update", onUpdate);
      clearInterval(beat);
    };
  }, []);

  const statusOf = useCallback(
    (userId: string | null | undefined): string | null => {
      if (!userId) return null;
      const p = map[userId];
      if (!p) return null;
      if (p.online) return "online";
      if (!p.lastSeenAt) return null;

      const d = new Date(p.lastSeenAt);
      const now = new Date();
      const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
      if (d.toDateString() === now.toDateString()) return `last seen today at ${time}`;
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      if (d.toDateString() === y.toDateString()) return `last seen yesterday at ${time}`;
      return `last seen ${d.toLocaleDateString([], { day: "numeric", month: "short" })}`;
    },
    [map],
  );

  const isOnline = useCallback((userId: string | null | undefined) => !!userId && !!map[userId]?.online, [map]);

  return { statusOf, isOnline };
}

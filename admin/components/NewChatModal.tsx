"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { IconSearch } from "@/components/Icons";
import { usePresence } from "@/lib/usePresence";

interface UserRow {
  id: string;
  employeeCode: string;
  fullName: string;
  status: string;
}

interface UserListResult {
  items: UserRow[];
}

/** Pick a colleague to open (or reopen) a 1:1 staff chat. */
export function NewChatModal({
  meId,
  onClose,
  onOpened,
  onNewGroup,
}: {
  meId: string | undefined;
  onClose: () => void;
  onOpened: (conversationId: string) => void;
  onNewGroup: () => void;
}) {
  const [people, setPeople] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<UserListResult | UserRow[]>("/users")
      .then((all) => {
        const rows = Array.isArray(all) ? all : all.items ?? [];
        setPeople(rows.filter((u) => u.status === "ACTIVE" && u.id !== meId));
      })
      .catch(() => setError("Could not load the staff list — your role may not be allowed to list users."));
  }, [meId]);

  const { statusOf, isOnline } = usePresence(people.map((p) => p.id));

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return people;
    return people.filter(
      (p) => p.fullName.toLowerCase().includes(s) || p.employeeCode.toLowerCase().includes(s),
    );
  }, [people, q]);

  async function open(userId: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ conversationId: string }>("/conversations/direct", {
        method: "POST",
        body: { userId },
      });
      onOpened(r.conversationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the chat");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "16px 14px 0" }}>
          <h3 style={{ margin: 0 }}>New chat</h3>
        </div>

        <div style={{ padding: "10px 14px" }}>
          <div className="search-box">
            <span className="s-icon">
              <IconSearch size={18} />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search colleagues"
              aria-label="Search colleagues"
              autoFocus
            />
          </div>
        </div>

        <div className="modal-body">
          <button className="pick-row" onClick={onNewGroup} style={{ fontWeight: 600 }}>
            <span
              className="avatar md"
              style={{ background: "var(--brand-blue)", fontSize: "1.2rem" }}
              aria-hidden="true"
            >
              +
            </span>
            <span className="pk-main">
              <span className="pk-name">New group</span>
              <span className="pk-sub">Staff only — clients can&apos;t be added</span>
            </span>
          </button>

          {error && (
            <div className="error-banner" style={{ margin: "10px 14px" }}>
              {error}
            </div>
          )}

          {filtered.map((p) => (
            <button key={p.id} className="pick-row" disabled={busy} onClick={() => open(p.id)}>
              <span style={{ position: "relative", display: "flex" }}>
                <Avatar name={p.fullName} seed={p.id} size="md" />
                {isOnline(p.id) && <span className="online-dot" />}
              </span>
              <span className="pk-main">
                <span className="pk-name">{p.fullName}</span>
                <span className="pk-sub">{statusOf(p.id) ?? p.employeeCode}</span>
              </span>
            </button>
          ))}

          {!error && filtered.length === 0 && (
            <div style={{ padding: 18 }} className="muted">
              No colleagues found.
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface ClientRow {
  id: string;
  displayCode: string;
  name: string;
}
interface UserRow {
  id: string;
  employeeCode: string;
  fullName: string;
  status: string;
}

export default function AssignmentsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [clientId, setClientId] = useState("");
  const [newUserId, setNewUserId] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    api<ClientRow[]>("/clients").then(setClients).catch(() => {});
    api<UserRow[]>("/users")
      .then((all) => setUsers(all.filter((u) => u.status === "ACTIVE")))
      .catch(() => {});
  }, []);

  async function onReassign(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    try {
      await api("/assignments/reassign", { method: "POST", body: { clientId, newUserId } });
      setStatus({ ok: true, message: "Reassigned. The client's WhatsApp thread doesn't change — only who answers it does." });
    } catch (err) {
      setStatus({ ok: false, message: err instanceof ApiError ? err.message : "Reassignment failed" });
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Assignments</h1>
      </div>

      <div className="card" style={{ maxWidth: 460 }}>
        <h3 style={{ marginBottom: 4 }}>Reassign a client</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.84rem" }}>
          Moves ownership to a new employee. Conversation history stays with the company — this is
          how an offboarded employee's clients get handed off (blueprint §5).
        </p>

        {status && (
          <div
            className="error-banner"
            style={status.ok ? { background: "var(--good-soft)", color: "var(--good)" } : undefined}
          >
            {status.message}
          </div>
        )}

        <form onSubmit={onReassign}>
          <div className="field">
            <label>Client</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              <option value="" disabled>
                Select a client…
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayCode} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>New owner</label>
            <select value={newUserId} onChange={(e) => setNewUserId(e.target.value)} required>
              <option value="" disabled>
                Select an employee…
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.employeeCode})
                </option>
              ))}
            </select>
          </div>
          <button className="primary" type="submit">
            Reassign
          </button>
        </form>
      </div>
    </>
  );
}

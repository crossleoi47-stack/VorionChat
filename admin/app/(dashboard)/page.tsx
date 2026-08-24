"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";

interface UserRow {
  id: string;
  status: string;
}
interface ClientRow {
  id: string;
}
interface ConversationRow {
  id: string;
}
interface AuditRow {
  id: string;
  action: string;
  target: string;
  createdAt: string;
  actor?: { fullName: string; employeeCode: string } | null;
}

export default function DashboardPage() {
  const { user, canManageEmployees, canSeeAudit } = useCurrentUser();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [recent, setRecent] = useState<AuditRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return; // wait for the role check before deciding what to fetch

    const requests: Promise<unknown>[] = [
      api<ClientRow[]>("/clients").then(setClients),
      api<ConversationRow[]>("/conversations").then(setConversations),
    ];
    if (canManageEmployees) requests.push(api<UserRow[]>("/users").then(setUsers));
    if (canSeeAudit) requests.push(api<AuditRow[]>("/audit-log?take=10").then(setRecent));

    // allSettled, not all — one endpoint 403ing for this role (or failing
    // for any other reason) shouldn't blank out everything else on the page.
    Promise.allSettled(requests).finally(() => setLoading(false));
  }, [user, canManageEmployees, canSeeAudit]);

  const activeEmployees = users?.filter((u) => u.status === "ACTIVE").length ?? null;
  const disabledEmployees = users?.filter((u) => u.status === "DISABLED").length ?? null;

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="stat-grid">
            {activeEmployees !== null && (
              <div className="stat-card">
                <div className="label">Active employees</div>
                <div className="value">{activeEmployees}</div>
              </div>
            )}
            {disabledEmployees !== null && (
              <div className="stat-card">
                <div className="label">Disabled employees</div>
                <div className="value">{disabledEmployees}</div>
              </div>
            )}
            <div className="stat-card">
              <div className="label">{canManageEmployees ? "Clients" : "Your clients"}</div>
              <div className="value">{clients.length}</div>
            </div>
            <div className="stat-card">
              <div className="label">{canManageEmployees ? "Conversations" : "Your conversations"}</div>
              <div className="value">{conversations.length}</div>
            </div>
          </div>

          {!canManageEmployees && (
            <div className="card" style={{ marginBottom: 20 }}>
              <p style={{ margin: 0 }}>
                Welcome back, {user?.fullName}. Head to <Link href="/inbox">Inbox</Link> to pick up
                conversations with your assigned clients.
              </p>
            </div>
          )}

          {recent !== null && (
            <div className="card">
              <h3 style={{ marginBottom: 12 }}>Recent activity</h3>
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Target</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((row) => (
                    <tr key={row.id}>
                      <td className="muted">{new Date(row.createdAt).toLocaleString()}</td>
                      <td>{row.actor ? `${row.actor.fullName} (${row.actor.employeeCode})` : "—"}</td>
                      <td>{row.action}</td>
                      <td className="muted">{row.target}</td>
                    </tr>
                  ))}
                  {recent.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        No activity yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

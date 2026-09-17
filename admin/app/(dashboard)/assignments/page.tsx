"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface ClientRow {
  id: string;
  displayCode: string;
  name: string;
  currentOwnerId: string | null;
  currentOwnerName: string | null;
}

interface UserRow {
  id: string;
  employeeCode: string;
  fullName: string;
  departmentName: string | null;
  role: string;
  status: string;
}

interface HistoryRow {
  id: string;
  clientId: string;
  clientName: string;
  clientDisplayCode: string;
  previousOwnerName: string | null;
  newOwnerName: string;
  assignedByName: string | null;
  reason: string | null;
  assignedAt: string;
}

interface HistoryResult {
  items: HistoryRow[];
  page: number;
  pageSize: number;
  total: number;
}

export default function AssignmentsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [clientId, setClientId] = useState("");
  const [newUserId, setNewUserId] = useState("");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("ALL");
  const [ownerFilter, setOwnerFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const selectedClient = useMemo(() => clients.find((c) => c.id === clientId) ?? null, [clients, clientId]);
  const selectedUser = useMemo(() => users.find((u) => u.id === newUserId) ?? null, [users, newUserId]);
  const isReassign = Boolean(selectedClient?.currentOwnerId);

  async function load(nextPage = page) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (clientFilter !== "ALL") params.set("clientId", clientFilter);
      if (ownerFilter !== "ALL") params.set("ownerId", ownerFilter);
      params.set("page", String(nextPage));
      params.set("pageSize", String(pageSize));

      const [context, historyResult] = await Promise.all([
        api<{ clients: ClientRow[]; users: UserRow[] }>("/assignments/context"),
        api<HistoryResult>(`/assignments/history?${params.toString()}`),
      ]);

      setClients(context.clients);
      setUsers(context.users.filter((user) => user.status === "ACTIVE"));
      setHistory(historyResult.items);
      setPage(historyResult.page);
    } catch (err) {
      setStatus({ ok: false, message: err instanceof ApiError ? err.message : "Failed to load assignments" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
  }, []);

  const ownerLabel = selectedClient?.currentOwnerName ?? "Unassigned";
  const buttonLabel = isReassign ? "Reassign" : "Assign";
  const confirmLabel = isReassign ? "Confirm Reassignment" : "Confirm Assignment";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setSaving(true);
    try {
      if (!selectedClient) throw new ApiError(400, "Select a client");
      if (!selectedUser) throw new ApiError(400, "Select a valid employee");
      if (selectedClient.currentOwnerId === selectedUser.id) {
        throw new ApiError(400, "Client is already assigned to this employee");
      }

      const confirmText = isReassign
        ? `Reassign Client?\n\nClient: ${selectedClient.name}\nCurrent Owner: ${ownerLabel}\nNew Owner: ${selectedUser.fullName} — ${selectedUser.employeeCode}${selectedUser.departmentName ? ` — ${selectedUser.departmentName}` : ""}\nReason: ${reason.trim() || "—"}`
        : `Assign Client?\n\nClient: ${selectedClient.name}\nCurrent Owner: Unassigned\nNew Owner: ${selectedUser.fullName} — ${selectedUser.employeeCode}${selectedUser.departmentName ? ` — ${selectedUser.departmentName}` : ""}\nReason: ${reason.trim() || "—"}`;
      if (!confirm(confirmText)) return;

      const result = await api<{ ok: boolean; action: "assigned" | "reassigned" }>("/assignments/reassign", {
        method: "POST",
        body: { clientId, newUserId, reason: reason.trim() || undefined },
      });
      setStatus({
        ok: true,
        message: result.action === "assigned" ? "Client assigned successfully" : "Client reassigned successfully",
      });
      setClientId("");
      setNewUserId("");
      setReason("");
      await load(page);
    } catch (err) {
      setStatus({ ok: false, message: err instanceof ApiError ? err.message : "Assignment failed" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Assign / Reassign Client</h1>
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <h3 style={{ marginBottom: 4 }}>{isReassign ? "Reassign a client" : "Assign a client"}</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.84rem" }}>
          {isReassign
            ? "Moves ownership to another active employee while preserving the full assignment history."
            : "Assigns an unassigned client to an active employee without changing the conversation history."}
        </p>

        {status && (
          <div
            className="error-banner"
            style={status.ok ? { background: "var(--good-soft)", color: "var(--good)" } : undefined}
          >
            {status.message}
          </div>
        )}

        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Client</label>
            <select
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setNewUserId("");
              }}
              required
            >
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

          {selectedClient && (
            <div className="field">
              <label>Current Owner</label>
              <input value={ownerLabel} readOnly />
            </div>
          )}

          <div className="field">
            <label>New Owner</label>
            <select value={newUserId} onChange={(e) => setNewUserId(e.target.value)} required disabled={!clientId}>
              <option value="" disabled>
                Select an employee…
              </option>
              {users
                .filter((u) => u.id !== selectedClient?.currentOwnerId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} — {u.employeeCode}
                    {u.departmentName ? ` — ${u.departmentName}` : ""}
                  </option>
                ))}
            </select>
          </div>

          <div className="field">
            <label>Reason (Optional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Workload balancing, employee unavailable, department change…"
            />
          </div>

          <button className="primary" type="submit" disabled={saving || !clientId || !newUserId}>
            {saving ? "Saving..." : buttonLabel}
          </button>
          <button
            type="button"
            style={{ marginLeft: 8 }}
            onClick={() => {
              setClientId("");
              setNewUserId("");
              setReason("");
              setStatus(null);
            }}
          >
            Cancel
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Search history</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Client, previous owner, new owner, assigned by" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Client</label>
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
              <option value="ALL">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayCode} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Employee</label>
            <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
              <option value="ALL">All employees</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} — {u.employeeCode}
                </option>
              ))}
            </select>
          </div>
          <button className="primary" onClick={() => void load(1)}>
            Apply
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Assignment History</h3>
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Previous Owner</th>
              <th>New Owner</th>
              <th>Assigned By</th>
              <th>Reason</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {(history ?? []).map((row) => (
              <tr key={row.id}>
                <td>
                  {row.clientDisplayCode} — {row.clientName}
                </td>
                <td className="muted">{row.previousOwnerName ?? "Unassigned"}</td>
                <td className="muted">{row.newOwnerName}</td>
                <td className="muted">{row.assignedByName ?? "—"}</td>
                <td className="muted">{row.reason ?? "—"}</td>
                <td className="muted">{new Date(row.assignedAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {!loading && history.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No assignment history yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <span className="muted">
            Showing {history.length} record{history.length === 1 ? "" : "s"}.
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={page <= 1 || loading} onClick={() => void load(page - 1)}>
              Previous
            </button>
            <button disabled={loading || history.length < pageSize} onClick={() => void load(page + 1)}>
              Next
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

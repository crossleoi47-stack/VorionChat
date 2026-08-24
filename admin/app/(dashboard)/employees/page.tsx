"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface UserRow {
  id: string;
  employeeCode: string;
  email: string | null;
  fullName: string;
  role: string;
  status: string;
}

interface CreatedUser {
  employeeCode: string;
  email: string | null;
  temporaryPassword: string;
}

const ROLES = ["EMPLOYEE", "MANAGER", "COMPANY_ADMIN", "AUDITOR"];

export default function EmployeesPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [employeeCode, setEmployeeCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [created, setCreated] = useState<CreatedUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api<UserRow[]>("/users")
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await api<CreatedUser>("/users", {
        method: "POST",
        body: { employeeCode, email: email.trim().toLowerCase(), fullName, role },
      });
      setCreated(result);
      setEmployeeCode("");
      setEmail("");
      setFullName("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create employee");
    }
  }

  async function onDisable(id: string) {
    if (!confirm("Disable this employee? Their sessions will be force-logged-out immediately.")) return;
    await api(`/users/${id}/disable`, { method: "POST" });
    load();
  }

  return (
    <>
      <div className="page-header">
        <h1>Employees</h1>
        <button className="primary" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Cancel" : "+ New employee"}
        </button>
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 420 }}>
          {error && <div className="error-banner">{error}</div>}
          {created && (
            <div className="error-banner" style={{ background: "var(--good-soft)", color: "var(--good)" }}>
              Created <b>{created.employeeCode}</b>. Temporary password (shown once):{" "}
              <code>{created.temporaryPassword}</code>
            </div>
          )}
          <form onSubmit={onCreate}>
            <div className="field">
              <label>Employee ID</label>
              <input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="EMP-1025" required />
            </div>
            <div className="field">
              <label>Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Email (their sign-in)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
              />
            </div>
            <div className="field">
              <label>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <button className="primary" type="submit">
              Create
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="muted">{u.employeeCode}</td>
                <td>{u.fullName}</td>
                <td className="muted">{u.email ?? "—"}</td>
                <td>{u.role}</td>
                <td>
                  <span className={`pill ${u.status === "ACTIVE" ? "pill--good" : "pill--danger"}`}>{u.status}</span>
                </td>
                <td>
                  {u.status === "ACTIVE" && (
                    <button className="danger" onClick={() => onDisable(u.id)}>
                      Disable
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No employees yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

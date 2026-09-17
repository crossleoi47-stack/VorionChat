"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";

interface UserRow {
  id: string;
  employeeCode: string;
  email: string | null;
  fullName: string;
  role: string;
  status: string;
  departmentId: string | null;
  department: { id: string; code: string; name: string; status: string } | null;
}

interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
}

interface UserListResult {
  items: UserRow[];
  page: number;
  pageSize: number;
  total: number;
}

interface CreateUserResult {
  success: true;
  message: string;
  user: UserRow;
}

const ROLES = ["EMPLOYEE", "MANAGER", "COMPANY_ADMIN", "AUDITOR", "SUPER_ADMIN"];
const STATUSES = ["ALL", "ACTIVE", "DISABLED"] as const;

export default function EmployeesPage() {
  const { user: currentUser } = useCurrentUser();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUSES)[number]>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [employeeCode, setEmployeeCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [createdMessage, setCreatedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeDepartments = useMemo(() => departments.filter((d) => d.status === "ACTIVE"), [departments]);

  async function load(nextPage = page) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (roleFilter !== "ALL") params.set("role", roleFilter);
      if (departmentFilter !== "ALL") params.set("departmentId", departmentFilter);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      params.set("page", String(nextPage));
      params.set("pageSize", String(pageSize));
      const [nextUsers, nextDepartments] = await Promise.all([
        api<UserListResult>(`/users?${params.toString()}`),
        api<DepartmentRow[]>("/departments"),
      ]);
      setUsers(Array.isArray(nextUsers as unknown as UserRow[]) ? (nextUsers as unknown as UserRow[]) : nextUsers?.items ?? []);
      setDepartments(nextDepartments);
      setPage((nextUsers as UserListResult)?.page ?? nextPage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
  }, []);

  function resetForm(user?: UserRow | null) {
    setEditing(user ?? null);
    setShowForm(Boolean(user));
    setCreatedMessage(null);
    setError(null);
    setEmployeeCode(user?.employeeCode ?? "");
    setFullName(user?.fullName ?? "");
    setEmail(user?.email ?? "");
    setRole(user?.role ?? "EMPLOYEE");
    setDepartmentId(user?.departmentId ?? "");
    setStatus(user?.status ?? "ACTIVE");
    setPassword("");
    setShowPassword(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        employeeCode: employeeCode.trim() || undefined,
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        role,
        departmentId: departmentId || undefined,
        status,
        ...(password.trim() ? { password } : {}),
      };

      if (editing) {
        await api(`/users/${editing.id}`, { method: "PATCH", body: payload });
        setCreatedMessage("Employee updated successfully.");
      } else {
        const result = await api<CreateUserResult>("/users", {
          method: "POST",
          body: { ...payload, password: password.trim() },
        });
        setCreatedMessage(result.message ?? "Employee created successfully.");
      }

      setEditing(null);
      setEmployeeCode("");
      setFullName("");
      setEmail("");
      setRole("EMPLOYEE");
      setDepartmentId("");
      setStatus("ACTIVE");
      setPassword("");
      setShowPassword(false);
      setError(null);
      setShowForm(false);
      await load(page);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save employee");
    } finally {
      setSaving(false);
    }
  }

  async function onDisable(id: string) {
    if (!confirm("Disable this employee? They will lose access until re-enabled.")) return;
    await api(`/users/${id}/disable`, { method: "POST" });
    await load(page);
  }

  async function onEnable(id: string) {
    if (!confirm("Re-enable this employee?")) return;
    await api(`/users/${id}/enable`, { method: "POST" });
    await load(page);
  }

  async function onDelete(id: string) {
    if (
      !confirm(
        "Delete Employee?\n\nAre you sure you want to permanently delete this employee? This action cannot be undone.",
      )
    ) {
      return;
    }

    setError(null);
    try {
      await api(`/users/${id}`, { method: "DELETE" });
      setCreatedMessage("Employee deleted successfully.");
      await load(page);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete employee");
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Employees</h1>
        <button
          className="primary"
          onClick={() => {
            if (showForm && !editing) {
              setShowForm(false);
              setError(null);
              return;
            }
            resetForm(null);
            setShowForm(true);
          }}
        >
          {showForm && !editing ? "Cancel" : "+ New employee"}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email, employee ID, department"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Role</label>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="ALL">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Department</label>
            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
              <option value="ALL">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} · {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as (typeof STATUSES)[number])}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === "ALL" ? "All statuses" : s}
                </option>
              ))}
            </select>
          </div>
          <button className="primary" onClick={() => void load(1)}>
            Apply
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 640 }}>
          <h2 style={{ marginTop: 0 }}>{editing ? `Edit ${editing.employeeCode || editing.fullName}` : "Add employee"}</h2>
          {error && <div className="error-banner">{error}</div>}
          <form onSubmit={onSubmit}>
            <div className="field">
              <label>Employee ID</label>
              <input
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="Auto-generated if blank"
                readOnly
              />
            </div>
            <div className="field">
              <label>Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="DISABLED">DISABLED</option>
              </select>
            </div>
            <div className="field">
              <label>Department</label>
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">None</option>
                {(editing ? departments : activeDepartments).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{editing ? "New password (optional)" : "Password"}</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editing ? "Leave blank to keep current password" : "Set a temporary password"}
                  required={!editing}
                  style={{ flex: 1 }}
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="primary" type="submit" disabled={saving}>
                {saving ? (editing ? "Updating..." : "Creating...") : editing ? "Update employee" : "Create employee"}
              </button>
              <button
                type="button"
                onClick={() => {
                  resetForm(null);
                  setShowForm(false);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {createdMessage && (
        <div className="error-banner" style={{ marginBottom: 20, background: "var(--good-soft)", color: "var(--good)" }}>
          {createdMessage}
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Department</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id}>
                <td className="muted">{u.employeeCode || "—"}</td>
                <td>{u.fullName}</td>
                <td className="muted">{u.email ?? "—"}</td>
                <td className="muted">{u.department ? `${u.department.code} · ${u.department.name}` : "—"}</td>
                <td>{u.role.replaceAll("_", " ")}</td>
                <td>
                  <span className={`pill ${u.status === "ACTIVE" ? "pill--good" : "pill--danger"}`}>{u.status}</span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => {
                        resetForm(u);
                        setShowForm(true);
                      }}
                    >
                      Edit
                    </button>
                    {u.status === "ACTIVE" ? (
                      <button className="danger" onClick={() => void onDisable(u.id)}>
                        Disable
                      </button>
                    ) : (
                      <button onClick={() => void onEnable(u.id)}>Enable</button>
                    )}
                    {currentUser?.role === "SUPER_ADMIN" && u.role !== "SUPER_ADMIN" && (
                      <button className="danger" onClick={() => void onDelete(u.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No employees found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <span className="muted">
            Showing {users.length} employee{users.length === 1 ? "" : "s"}.
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={page <= 1 || loading} onClick={() => void load(page - 1)}>
              Previous
            </button>
            <button disabled={loading || users.length < pageSize} onClick={() => void load(page + 1)}>
              Next
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

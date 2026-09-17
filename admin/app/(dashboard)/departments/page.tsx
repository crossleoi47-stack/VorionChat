"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";

interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "INACTIVE";
  userCount: number;
}

type DepartmentStatus = "ACTIVE" | "INACTIVE" | "ALL";

const EMPTY_FORM = {
  id: "",
  name: "",
  code: "",
  description: "",
  status: "ACTIVE" as DepartmentRow["status"],
};

function nextCode(existing: DepartmentRow[]) {
  const numbers = existing
    .map((d) => Number(d.code.replace(/^DEP-/, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return `DEP-${String(next).padStart(3, "0")}`;
}

export default function DepartmentsPage() {
  const { canDeleteDepartments } = useCurrentUser();
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DepartmentStatus>("ALL");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const filteredDepartments = useMemo(() => departments, [departments]);

  async function load(nextSearch = search, nextStatus = status) {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (nextSearch.trim()) query.set("search", nextSearch.trim());
      if (nextStatus !== "ALL") query.set("status", nextStatus);
      const rows = await api<DepartmentRow[]>(`/departments${query.toString() ? `?${query}` : ""}`);
      setDepartments(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load departments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startCreate() {
    setEditingId(null);
    setError(null);
    setSaved(null);
    setForm((current) => ({
      ...EMPTY_FORM,
      code: nextCode(departments),
      status: "ACTIVE",
    }));
  }

  function startEdit(row: DepartmentRow) {
    setEditingId(row.id);
    setError(null);
    setSaved(null);
    setForm({
      id: row.id,
      name: row.name,
      code: row.code,
      description: row.description ?? "",
      status: row.status,
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        description: form.description.trim() || undefined,
        status: form.status,
      };
      if (editingId) {
        await api(`/departments/${editingId}`, { method: "PATCH", body: payload });
        setSaved("Department updated successfully.");
      } else {
        await api("/departments", { method: "POST", body: payload });
        setSaved("Department created successfully.");
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      await load();
      setTimeout(() => setSaved(null), 2200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save department");
    }
  }

  async function onDelete(row: DepartmentRow) {
    if (!confirm(`Delete Department?\n\nAre you sure you want to delete\n"${row.name}"?`)) return;
    try {
      await api(`/departments/${row.id}`, { method: "DELETE" });
      setSaved("Department deleted successfully.");
      await load();
      setTimeout(() => setSaved(null), 2200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete department");
    }
  }

  useEffect(() => {
    load(search, status);
  }, [search, status]);

  return (
    <>
      <div className="page-header">
        <h1>Departments</h1>
        <button className="primary" onClick={startCreate}>
          {editingId ? "New department" : "+ New department"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {saved && <div className="ok-banner">{saved}</div>}

      <div className="card" style={{ marginBottom: 20, maxWidth: 620 }}>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Name *</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="field">
            <label>Department Code *</label>
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="DEP-002"
              required
            />
          </div>
          <div className="field">
            <label>Description</label>
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Support team"
            />
          </div>
          <div className="field">
            <label>Status *</label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as DepartmentRow["status"] }))}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          <button className="primary" type="submit">
            {editingId ? "Update Department" : "Create Department"}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search departments..."
          style={{ maxWidth: 280 }}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as DepartmentStatus)} style={{ maxWidth: 180 }}>
          <option value="ALL">All</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Description</th>
              <th>Users</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDepartments.map((d) => (
              <tr key={d.id}>
                <td className="muted">{d.code}</td>
                <td>{d.name}</td>
                <td className="muted" title={d.description ?? undefined}>
                  {d.description ? (d.description.length > 28 ? `${d.description.slice(0, 25)}...` : d.description) : "—"}
                </td>
                <td className="muted">{d.userCount}</td>
                <td>
                  <span className={`pill ${d.status === "ACTIVE" ? "pill--good" : "pill--neutral"}`}>{d.status}</span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="ghost" onClick={() => startEdit(d)}>
                      Edit
                    </button>
                    {canDeleteDepartments && (
                      <button className="danger" onClick={() => onDelete(d)}>
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filteredDepartments.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No departments found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

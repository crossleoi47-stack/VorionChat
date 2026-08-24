"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface AuditRow {
  id: string;
  action: string;
  target: string;
  createdAt: string;
  ip: string | null;
  actor?: { fullName: string; employeeCode: string } | null;
}

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<AuditRow[]>("/audit-log?take=200")
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Audit log</h1>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="muted">{new Date(r.createdAt).toLocaleString()}</td>
                <td>{r.actor ? `${r.actor.fullName} (${r.actor.employeeCode})` : "system"}</td>
                <td>
                  <code>{r.action}</code>
                </td>
                <td className="muted">{r.target}</td>
                <td className="muted">{r.ip ?? "—"}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Nothing logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

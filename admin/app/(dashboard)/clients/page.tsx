"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";

interface ClientRow {
  id: string;
  displayCode: string;
  name: string;
  org: string | null;
}

interface ClientDetail extends ClientRow {
  phoneE164?: string;
  email?: string | null;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selected, setSelected] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<ClientRow[]>("/clients")
      .then(setClients)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function openClient(id: string) {
    const detail = await api<ClientDetail>(`/clients/${id}`);
    setSelected(detail);
  }

  return (
    <>
      <div className="page-header">
        <h1>Clients</h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 320px" : "1fr", gap: 20 }}>
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Client ID</th>
                <th>Name</th>
                <th>Company</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => openClient(c.id)}>
                  <td className="muted">{c.displayCode}</td>
                  <td>
                    <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <Avatar name={c.name} seed={c.id} size="sm" />
                      {c.name}
                    </span>
                  </td>
                  <td className="muted">{c.org ?? "—"}</td>
                </tr>
              ))}
              {!loading && clients.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No clients visible to your role yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="card">
            <h3 style={{ marginBottom: 10 }}>{selected.name}</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              {selected.displayCode} · {selected.org ?? "No company on file"}
            </p>
            {selected.phoneE164 ? (
              <>
                <div className="field">
                  <label>Phone</label>
                  <div>{selected.phoneE164}</div>
                </div>
                <div className="field">
                  <label>Email</label>
                  <div>{selected.email ?? "—"}</div>
                </div>
                <p className="muted" style={{ fontSize: "0.78rem" }}>
                  This read was written to the audit log.
                </p>
              </>
            ) : (
              <p className="muted" style={{ fontSize: "0.82rem" }}>
                Contact details are not visible to your role — the API never sends them to this
                screen at all.
              </p>
            )}
            <button onClick={() => setSelected(null)}>Close</button>
          </div>
        )}
      </div>
    </>
  );
}

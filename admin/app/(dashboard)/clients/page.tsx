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
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ displayCode: "", name: "", org: "", phoneE164: "", email: "" });

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

  async function addClient(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const created = await api<ClientRow>("/clients", {
        method: "POST",
        body: {
          displayCode: form.displayCode.trim(),
          name: form.name.trim(),
          org: form.org.trim() || undefined,
          phoneE164: form.phoneE164.trim(),
          email: form.email.trim() || undefined,
        },
      });
      setClients((current) => [created, ...current]);
      setForm({ displayCode: "", name: "", org: "", phoneE164: "", email: "" });
      setShowAddForm(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not add client");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Clients</h1>
        <button className="primary" onClick={() => { setFormError(null); setShowAddForm((open) => !open); }}>
          {showAddForm ? "Cancel" : "Add client"}
        </button>
      </div>

      {showAddForm && (
        <form className="card" onSubmit={addClient} style={{ marginBottom: 20, maxWidth: 760 }}>
          <h3 style={{ marginTop: 0 }}>Add client</h3>
          {formError && <div className="error-banner">{formError}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
            <div className="field">
              <label htmlFor="client-id">Client ID</label>
              <input id="client-id" required value={form.displayCode} onChange={(e) => setForm({ ...form, displayCode: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="client-name">Name</label>
              <input id="client-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="client-company">Company</label>
              <input id="client-company" value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="client-phone">Phone</label>
              <input id="client-phone" type="tel" required placeholder="+14155552671" value={form.phoneE164} onChange={(e) => setForm({ ...form, phoneE164: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="client-email">Email</label>
              <input id="client-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <button className="primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save client"}
          </button>
        </form>
      )}

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

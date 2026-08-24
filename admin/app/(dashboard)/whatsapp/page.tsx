"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Account {
  id: string;
  wabaId: string;
  phoneNumberId: string;
  displayNumber: string;
  label: string | null;
  status: "UNVERIFIED" | "CONNECTED" | "ERROR";
  lastCheckedAt: string | null;
  lastError: string | null;
  accessTokenMasked: string | null;
  hasAppSecret: boolean;
  hasVerifyToken: boolean;
  webhookUrl: string;
}

const EMPTY = {
  wabaId: "",
  phoneNumberId: "",
  displayNumber: "",
  label: "",
  accessToken: "",
  appSecret: "",
  verifyToken: "",
};

export default function WhatsappSettingsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = () =>
    api<Account[]>("/whatsapp/accounts")
      .then(setAccounts)
      .catch(() => setError("You don't have permission to manage WhatsApp settings."));

  useEffect(() => {
    load();
  }, []);

  function set<K extends keyof typeof EMPTY>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api<Account>("/whatsapp/accounts", {
        method: "POST",
        body: {
          wabaId: form.wabaId.trim(),
          phoneNumberId: form.phoneNumberId.trim(),
          displayNumber: form.displayNumber.trim(),
          label: form.label.trim() || undefined,
          accessToken: form.accessToken.trim() || undefined,
          appSecret: form.appSecret.trim() || undefined,
          verifyToken: form.verifyToken.trim() || undefined,
        },
      });
      setForm({ ...EMPTY });
      setEditingId(null);
      setOk("Saved. Run “Test connection” to confirm Meta accepts it.");
      setTimeout(() => setOk(null), 4000);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function test(a: Account) {
    setTesting(a.id);
    setError(null);
    try {
      const updated = await api<Account>(`/whatsapp/accounts/${a.id}/test`, { method: "POST" });
      setAccounts((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      if (updated.status === "CONNECTED") {
        setOk(`Connected — Meta accepted the credentials for ${updated.displayNumber}.`);
        setTimeout(() => setOk(null), 4000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(null);
    }
  }

  async function remove(a: Account) {
    if (!confirm(`Remove ${a.displayNumber}? Conversation history stays, but this number stops working.`))
      return;
    try {
      await api(`/whatsapp/accounts/${a.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove");
    }
  }

  function edit(a: Account) {
    setEditingId(a.id);
    setForm({
      wabaId: a.wabaId,
      phoneNumberId: a.phoneNumberId,
      displayNumber: a.displayNumber,
      label: a.label ?? "",
      accessToken: "",
      appSecret: "",
      verifyToken: "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const webhookUrl = accounts[0]?.webhookUrl ?? "https://your-server/api/whatsapp/webhook";

  return (
    <>
      <div className="page-header">
        <h1>WhatsApp</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {ok && <div className="ok-banner">{ok}</div>}

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginBottom: 6 }}>Before you start</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: ".88rem", maxWidth: "68ch" }}>
          These values come from Meta, not from us. You need a verified Meta Business account, a
          WhatsApp Business phone number, and a system-user access token. Meta&apos;s verification
          can take days — nothing here shortens that.
        </p>
        <ol className="muted" style={{ fontSize: ".88rem", maxWidth: "68ch", paddingLeft: "1.2em" }}>
          <li>
            In Meta&apos;s <b>WhatsApp → API Setup</b>, copy the <b>Phone number ID</b> and the{" "}
            <b>WhatsApp Business Account ID</b>.
          </li>
          <li>
            Create a permanent <b>system user access token</b> with the{" "}
            <code>whatsapp_business_messaging</code> and <code>whatsapp_business_management</code>{" "}
            permissions.
          </li>
          <li>
            In <b>App → Settings → Basic</b>, copy the <b>App secret</b> — that&apos;s what proves
            an incoming webhook really came from Meta.
          </li>
          <li>
            Set your webhook to the URL below, choose any <b>verify token</b> you like, and enter
            the same value here.
          </li>
        </ol>
        <div className="field" style={{ maxWidth: 560, marginBottom: 0 }}>
          <label>Your webhook URL (paste this into Meta)</label>
          <input readOnly value={webhookUrl} onFocus={(e) => e.currentTarget.select()} />
          <p className="muted" style={{ fontSize: ".8rem", margin: "6px 0 0" }}>
            Meta only calls public HTTPS URLs. On a laptop, tunnel it with ngrok and set{" "}
            <code>PUBLIC_API_URL</code> on the server.
          </p>
        </div>
      </div>

      {/* Add / edit */}
      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginBottom: 12 }}>
          {editingId ? "Update number" : "Connect a WhatsApp number"}
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14 }}>
          <div className="field">
            <label htmlFor="pid">Phone number ID</label>
            <input
              id="pid"
              value={form.phoneNumberId}
              onChange={(e) => set("phoneNumberId", e.target.value)}
              placeholder="123456789012345"
              disabled={!!editingId}
            />
          </div>
          <div className="field">
            <label htmlFor="waba">WhatsApp Business Account ID</label>
            <input
              id="waba"
              value={form.wabaId}
              onChange={(e) => set("wabaId", e.target.value)}
              placeholder="098765432109876"
            />
          </div>
          <div className="field">
            <label htmlFor="disp">Display number</label>
            <input
              id="disp"
              value={form.displayNumber}
              onChange={(e) => set("displayNumber", e.target.value)}
              placeholder="+971 4 000 0000"
            />
          </div>
          <div className="field">
            <label htmlFor="label">Label (optional)</label>
            <input
              id="label"
              value={form.label}
              onChange={(e) => set("label", e.target.value)}
              placeholder="Sales line"
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14 }}>
          <div className="field">
            <label htmlFor="tok">Access token</label>
            <input
              id="tok"
              type="password"
              value={form.accessToken}
              onChange={(e) => set("accessToken", e.target.value)}
              placeholder={editingId ? "leave blank to keep current" : "EAAG…"}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="sec">App secret</label>
            <input
              id="sec"
              type="password"
              value={form.appSecret}
              onChange={(e) => set("appSecret", e.target.value)}
              placeholder={editingId ? "leave blank to keep current" : "from App → Settings → Basic"}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="vt">Webhook verify token</label>
            <input
              id="vt"
              type="password"
              value={form.verifyToken}
              onChange={(e) => set("verifyToken", e.target.value)}
              placeholder={editingId ? "leave blank to keep current" : "any string you choose"}
              autoComplete="off"
            />
          </div>
        </div>

        <p className="muted" style={{ fontSize: ".82rem", maxWidth: "66ch" }}>
          Tokens are encrypted before they&apos;re stored and are never sent back to this screen —
          you&apos;ll only ever see a masked version. Re-entering a field replaces it; leaving it
          blank keeps what&apos;s already saved.
        </p>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="primary"
            onClick={save}
            disabled={busy || !form.phoneNumberId.trim() || !form.wabaId.trim() || !form.displayNumber.trim()}
          >
            {busy ? "Saving…" : editingId ? "Update" : "Save number"}
          </button>
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null);
                setForm({ ...EMPTY });
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Configured numbers */}
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Connected numbers</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Status</th>
                <th>Token</th>
                <th>Secrets</th>
                <th>Last checked</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.displayNumber}
                    <div className="muted" style={{ fontSize: ".76rem" }}>
                      {a.label ? `${a.label} · ` : ""}
                      {a.phoneNumberId}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`pill ${
                        a.status === "CONNECTED"
                          ? "pill--good"
                          : a.status === "ERROR"
                            ? "pill--danger"
                            : "pill--neutral"
                      }`}
                    >
                      {a.status.toLowerCase()}
                    </span>
                    {a.lastError && (
                      <div className="muted" style={{ fontSize: ".76rem", marginTop: 3, maxWidth: 260 }}>
                        {a.lastError}
                      </div>
                    )}
                  </td>
                  <td className="muted" style={{ fontFamily: "monospace", fontSize: ".8rem" }}>
                    {a.accessTokenMasked ?? "—"}
                  </td>
                  <td className="muted" style={{ fontSize: ".8rem" }}>
                    {a.hasAppSecret ? "app secret ✓" : "app secret ✕"}
                    <br />
                    {a.hasVerifyToken ? "verify token ✓" : "verify token ✕"}
                  </td>
                  <td className="muted" style={{ fontSize: ".8rem" }}>
                    {a.lastCheckedAt ? new Date(a.lastCheckedAt).toLocaleString() : "never"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => test(a)} disabled={testing === a.id}>
                        {testing === a.id ? "Testing…" : "Test connection"}
                      </button>
                      <button onClick={() => edit(a)}>Edit</button>
                      <button className="danger" onClick={() => remove(a)}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No numbers connected yet. Until one is, client messaging runs against the mock
                    provider and nothing reaches a real phone.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

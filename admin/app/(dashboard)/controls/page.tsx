"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";

interface UserRow {
  id: string;
  employeeCode: string;
  fullName: string;
  role: string;
  status: string;
}

interface UserListResponse {
  items: UserRow[];
  page: number;
  pageSize: number;
  total: number;
}

interface CatalogItem {
  key: string;
  label: string;
}

interface Catalog {
  features: CatalogItem[];
  roleDefaults: Record<string, Record<string, boolean>>;
}

interface DlpConfig {
  mode: "off" | "warn" | "flag" | "block";
  detectPhones: boolean;
  detectEmails: boolean;
  detectUrls: boolean;
  blockedPhrases: string[];
}

const MODE_HELP: Record<DlpConfig["mode"], string> = {
  off: "No scanning at all.",
  warn: "Message sends; the attempt is logged.",
  flag: "Message sends; the attempt is logged and surfaced in the audit trail for review.",
  block: "Message is refused and never reaches the client.",
};

export default function ControlsPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean> | null>(null);
  const [dlp, setDlp] = useState<DlpConfig | null>(null);
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    api<UserListResponse>("/users")
      .then(({ items }) => setUsers(items.filter((u) => u.status === "ACTIVE")))
      .catch(() => setError("You don't have permission to manage controls."));
    api<Catalog>("/policy/catalog").then(setCatalog).catch(() => {});
    api<DlpConfig>("/policy/dlp").then(setDlp).catch(() => {});
  }, []);

  function pick(u: UserRow) {
    setSelected(u);
    setFeatures(null);
    api<Record<string, boolean>>(`/policy/users/${u.id}`)
      .then(setFeatures)
      .catch(() => setError("Could not load that person's controls"));
  }

  async function toggle(key: string, value: boolean) {
    if (!selected) return;
    setError(null);
    try {
      const updated = await api<Record<string, boolean>>(`/policy/users/${selected.id}`, {
        method: "PATCH",
        body: { [key]: value },
      });
      setFeatures(updated);
      setSaved(`Updated ${selected.fullName}`);
      setTimeout(() => setSaved(null), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }

  async function saveDlp(patch: Partial<DlpConfig>) {
    setError(null);
    try {
      const next = await api<DlpConfig>("/policy/dlp", { method: "PATCH", body: patch });
      setDlp(next);
      setSaved("Message controls updated");
      setTimeout(() => setSaved(null), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }

  const roleBaseline = selected && catalog ? catalog.roleDefaults[selected.role] : null;

  return (
    <>
      <div className="page-header">
        <h1>Controls</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {saved && <div className="ok-banner">{saved}</div>}

      <p className="muted" style={{ maxWidth: "62ch", marginTop: 0 }}>
        Everything here is enforced on the server. Turning a switch off doesn&apos;t just hide a
        button — the API refuses the action even if someone calls it directly.
      </p>

      {/* ── Per-person feature switches ── */}
      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginBottom: 4 }}>Per-employee controls</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: ".86rem" }}>
          These can only take capability away from what the person&apos;s role already allows —
          never add to it.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", gap: 20, marginTop: 14 }}>
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              overflow: "hidden",
              maxHeight: 380,
              overflowY: "auto",
            }}
          >
            {users.map((u) => (
              <button
                key={u.id}
                className="pick-row"
                onClick={() => pick(u)}
                style={
                  selected?.id === u.id
                    ? { background: "var(--accent-soft)" }
                    : undefined
                }
              >
                <Avatar name={u.fullName} seed={u.id} size="sm" />
                <span className="pk-main">
                  <span className="pk-name" style={{ fontSize: ".86rem" }}>
                    {u.fullName}
                  </span>
                  <span className="pk-sub">{u.role.replace("_", " ").toLowerCase()}</span>
                </span>
              </button>
            ))}
            {users.length === 0 && (
              <div style={{ padding: 16 }} className="muted">
                No employees.
              </div>
            )}
          </div>

          <div>
            {!selected && <p className="muted">Select someone to review their controls.</p>}
            {selected && !features && <p className="muted">Loading…</p>}
            {selected && features && catalog && (
              <>
                <h4 style={{ margin: "0 0 10px" }}>
                  {selected.fullName}{" "}
                  <span className="muted" style={{ fontWeight: 400, fontSize: ".85rem" }}>
                    · {selected.employeeCode}
                  </span>
                </h4>
                {catalog.features.map((f) => {
                  const allowedByRole = roleBaseline?.[f.key] ?? true;
                  const on = features[f.key];
                  return (
                    <label
                      key={f.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "9px 2px",
                        borderTop: "1px solid var(--border)",
                        margin: 0,
                        opacity: allowedByRole ? 1 : 0.55,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!allowedByRole}
                        onChange={(e) => toggle(f.key, e.target.checked)}
                        style={{ width: 16, height: 16, flex: "none" }}
                      />
                      <span style={{ flex: 1, color: "var(--ink)", fontSize: ".9rem" }}>
                        {f.label}
                      </span>
                      {!allowedByRole && (
                        <span className="pill pill--neutral">not available to this role</span>
                      )}
                    </label>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── DLP ── */}
      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Message controls (data-loss prevention)</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: ".86rem" }}>
          Scans outgoing messages for contact details being passed to clients.
        </p>

        {!dlp ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <div className="field" style={{ maxWidth: 420, marginTop: 12 }}>
              <label htmlFor="mode">When something is detected</label>
              <select
                id="mode"
                value={dlp.mode}
                onChange={(e) => saveDlp({ mode: e.target.value as DlpConfig["mode"] })}
              >
                <option value="off">Off — don&apos;t scan</option>
                <option value="warn">Warn — log it</option>
                <option value="flag">Flag — log and surface for review</option>
                <option value="block">Block — refuse to send</option>
              </select>
              <p className="muted" style={{ fontSize: ".82rem", margin: "6px 0 0" }}>
                {MODE_HELP[dlp.mode]}
              </p>
            </div>

            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "6px 0 16px" }}>
              {(
                [
                  ["detectPhones", "Phone numbers"],
                  ["detectEmails", "Email addresses"],
                  ["detectUrls", "Links"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={dlp[key]}
                    onChange={(e) => saveDlp({ [key]: e.target.checked })}
                    style={{ width: 16, height: 16, flex: "none" }}
                  />
                  <span style={{ color: "var(--ink)", fontSize: ".9rem" }}>{label}</span>
                </label>
              ))}
            </div>

            <label>Blocked phrases</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {dlp.blockedPhrases.map((p) => (
                <span
                  key={p}
                  className="pill pill--neutral"
                  style={{ display: "inline-flex", gap: 8, alignItems: "center", padding: "4px 10px" }}
                >
                  {p}
                  <button
                    className="ghost"
                    style={{ padding: 0, fontSize: ".9rem", lineHeight: 1 }}
                    onClick={() =>
                      saveDlp({ blockedPhrases: dlp.blockedPhrases.filter((x) => x !== p) })
                    }
                    aria-label={`Remove ${p}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
              {dlp.blockedPhrases.length === 0 && <span className="muted">None</span>}
            </div>
            <div style={{ display: "flex", gap: 8, maxWidth: 460 }}>
              <input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder="e.g. message me on"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && phrase.trim()) {
                    saveDlp({ blockedPhrases: [...dlp.blockedPhrases, phrase.trim()] });
                    setPhrase("");
                  }
                }}
              />
              <button
                onClick={() => {
                  if (!phrase.trim()) return;
                  saveDlp({ blockedPhrases: [...dlp.blockedPhrases, phrase.trim()] });
                  setPhrase("");
                }}
              >
                Add
              </button>
            </div>

            <p className="muted" style={{ fontSize: ".82rem", marginTop: 16, maxWidth: "64ch" }}>
              <b>What this can&apos;t do:</b> it only sees what passes through Vorion. An employee
              who reads their number aloud on a call, or shows it on screen, is invisible to this.
              Treat it as one layer, not a guarantee.
            </p>
          </>
        )}
      </div>
    </>
  );
}

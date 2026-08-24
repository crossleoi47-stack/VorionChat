"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";

interface Conv {
  id: string;
  type: string;
  title: string;
  clientDisplayCode: string | null;
  ownerName: string | null;
  messageCount: number;
  lastMessageAt: string | null;
}

interface Msg {
  id: string;
  senderName: string;
  senderIsClient: boolean;
  body: string | null;
  type: string;
  createdAt: string;
  hasAttachment: boolean;
}

interface Anomaly {
  userId: string;
  fullName: string;
  employeeCode: string;
  phoneReads: number;
  dlpHits: number;
  exports: number;
  severity: "high" | "medium";
  reasons: string[];
}

export default function OversightPage() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [open, setOpen] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Conv[]>("/oversight/conversations")
      .then(setConvs)
      .catch(() => setError("Oversight is limited to admins and auditors."));
    api<Anomaly[]>("/oversight/anomalies?days=7")
      .then(setAnomalies)
      .catch(() => {});
  }, []);

  function read(c: Conv) {
    setOpen(c);
    setMsgs(null);
    api<Msg[]>(`/oversight/conversations/${c.id}`)
      .then(setMsgs)
      .catch(() => setError("Could not open that conversation"));
  }

  return (
    <>
      <div className="page-header">
        <h1>Oversight</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <p className="muted" style={{ maxWidth: "64ch", marginTop: 0 }}>
        You can read any conversation in the company — and every time you do, that access is
        written to the audit log under your name. Oversight is not invisible, by design.
      </p>

      {/* ── Anomalies ── */}
      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginBottom: 4 }}>Unusual activity · last 7 days</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: ".86rem" }}>
          Bulk access patterns that often precede someone leaving with a client list.
        </p>

        {anomalies.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            Nothing unusual. (This looks at phone-number views, flagged messages, and exports.)
          </p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Signal</th>
                  <th>Phone views</th>
                  <th>Flagged</th>
                  <th>Exports</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((a) => (
                  <tr key={a.userId}>
                    <td>
                      <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <Avatar name={a.fullName} seed={a.userId} size="sm" />
                        <span>
                          {a.fullName}
                          <div className="muted" style={{ fontSize: ".76rem" }}>
                            {a.employeeCode}
                          </div>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${a.severity === "high" ? "pill--danger" : "pill--neutral"}`}>
                        {a.severity}
                      </span>
                      <div className="muted" style={{ fontSize: ".78rem", marginTop: 3 }}>
                        {a.reasons.join(" · ")}
                      </div>
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{a.phoneReads}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{a.dlpHits}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{a.exports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Conversations ── */}
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>All conversations</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Conversation</th>
                <th>Type</th>
                <th>Owner</th>
                <th>Messages</th>
                <th>Last activity</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {convs.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.title}
                    {c.clientDisplayCode && (
                      <div className="muted" style={{ fontSize: ".77rem" }}>
                        {c.clientDisplayCode}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="pill pill--neutral">{c.type}</span>
                  </td>
                  <td className="muted">{c.ownerName ?? "—"}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{c.messageCount}</td>
                  <td className="muted">
                    {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString() : "—"}
                  </td>
                  <td>
                    <button onClick={() => read(c)}>Read</button>
                  </td>
                </tr>
              ))}
              {convs.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="muted">
                    No conversations yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <div className="modal-back" onClick={() => setOpen(null)} role="presentation">
          <div
            className="modal"
            style={{ width: 620, maxHeight: "80vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>
              {open.title}
              <span className="muted" style={{ fontWeight: 400, fontSize: ".82rem", marginLeft: 8 }}>
                · this read has been logged
              </span>
            </h3>
            <div className="modal-body" style={{ padding: "12px 18px" }}>
              {!msgs && <p className="muted">Loading…</p>}
              {msgs?.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: "9px 0",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <b style={{ fontSize: ".84rem", color: m.senderIsClient ? "var(--warn)" : "var(--accent)" }}>
                      {m.senderName}
                      {m.senderIsClient ? " (client)" : ""}
                    </b>
                    <span className="muted" style={{ fontSize: ".76rem" }}>
                      {new Date(m.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: ".9rem", marginTop: 2 }}>
                    {m.body ?? <i className="muted">deleted</i>}
                    {m.hasAttachment && (
                      <span className="pill pill--neutral" style={{ marginLeft: 8 }}>
                        {m.type.toLowerCase()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {msgs?.length === 0 && <p className="muted">No messages in this conversation.</p>}
            </div>
            <div className="modal-foot">
              <button onClick={() => setOpen(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiUpload } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Avatar } from "@/components/Avatar";
import { StoryViewer, StatusEntry } from "@/components/StoryViewer";
import { IconImage, IconPencil } from "@/components/Icons";

const BACKGROUNDS = [
  "#12379B",
  "#0F766E",
  "#B26A00",
  "#9B1C5E",
  "#3F51B5",
  "#2B6A3F",
  "#5B3FA8",
  "#B3261E",
];

function ago(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const h = Math.floor(mins / 60);
  return `${h} hour${h === 1 ? "" : "s"} ago`;
}

/** Segmented ring around the avatar — one arc per status item, dim once seen. */
function Ring({ entry, children }: { entry: StatusEntry; children: React.ReactNode }) {
  const n = entry.items.length;
  const r = 26;
  const c = 2 * Math.PI * r;
  const gap = n > 1 ? 5 : 0;
  const seg = c / n - gap;

  return (
    <span className="ring">
      <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
        {entry.items.map((it, i) => (
          <circle
            key={it.id}
            cx="28"
            cy="28"
            r={r}
            fill="none"
            stroke={it.viewed ? "var(--border-2)" : "var(--brand-gold)"}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeDasharray={`${seg} ${c - seg}`}
            strokeDashoffset={-(i * (seg + gap))}
          />
        ))}
      </svg>
      {children}
    </span>
  );
}

export default function StatusPage() {
  const { user } = useCurrentUser();
  const [entries, setEntries] = useState<StatusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [bg, setBg] = useState(BACKGROUNDS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openAt, setOpenAt] = useState<number | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<StatusEntry[]>("/status")
      .then(setEntries)
      .catch(() => setError("Could not load status updates"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    const socket = getSocket();
    const onNew = () => load();
    socket.on("status:new", onNew);
    return () => {
      socket.off("status:new", onNew);
    };
  }, [load]);

  async function postText() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api("/status", {
        method: "POST",
        body: { type: "TEXT", body: text.trim(), backgroundColor: bg },
      });
      setText("");
      setComposing(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post status");
    } finally {
      setBusy(false);
    }
  }

  async function postImage(file: File) {
    setBusy(true);
    setError(null);
    try {
      const up = await apiUpload<{
        storageKey: string;
        mimeType: string;
        sizeBytes: number;
        kind: string;
      }>("/attachments/upload", file);
      if (up.kind !== "IMAGE") {
        setError("Only images can be posted to status right now.");
        return;
      }
      await api("/status", {
        method: "POST",
        body: {
          type: "IMAGE",
          body: text.trim() || undefined,
          storageKey: up.storageKey,
          mimeType: up.mimeType,
          sizeBytes: up.sizeBytes,
        },
      });
      setText("");
      setComposing(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post status");
    } finally {
      setBusy(false);
    }
  }

  const mine = entries.find((e) => e.isMe) ?? null;
  const recent = entries.filter((e) => !e.isMe && e.unseenCount > 0);
  const seen = entries.filter((e) => !e.isMe && e.unseenCount === 0);

  function markViewedLocally(statusId: string) {
    setEntries((prev) =>
      prev.map((e) => ({
        ...e,
        items: e.items.map((i) => (i.id === statusId ? { ...i, viewed: true } : i)),
        unseenCount: e.items.filter((i) => i.id !== statusId && !i.viewed).length,
      })),
    );
  }

  function Row({ entry, index }: { entry: StatusEntry; index: number }) {
    return (
      <button className="status-row" onClick={() => setOpenAt(index)}>
        <Ring entry={entry}>
          <Avatar name={entry.authorName} seed={entry.authorId} />
        </Ring>
        <span className="sr-main">
          <span className="sr-name">{entry.isMe ? "My status" : entry.authorName}</span>
          <span className="sr-sub">
            {ago(entry.latestAt)}
            {entry.items.length > 1 ? ` · ${entry.items.length} updates` : ""}
          </span>
        </span>
      </button>
    );
  }

  return (
    <>
      <div className="status-pane">
        <div className="pane-head">
          <span className="pane-title">Status</span>
        </div>

        <div className="status-list">
          {mine ? (
            <Row entry={mine} index={entries.indexOf(mine)} />
          ) : (
            <button className="status-row" onClick={() => setComposing(true)}>
              <span className="ring add-status">
                <Avatar name={user?.fullName ?? "Me"} seed={user?.id ?? "me"} />
                <span className="plus">+</span>
              </span>
              <span className="sr-main">
                <span className="sr-name">My status</span>
                <span className="sr-sub">Tap to add a status update</span>
              </span>
            </button>
          )}

          {mine && (
            <button className="status-row" onClick={() => setComposing(true)}>
              <span className="ring add-status">
                <span
                  className="avatar"
                  style={{ background: "var(--surface-sunken)", color: "var(--ink-2)" }}
                >
                  +
                </span>
              </span>
              <span className="sr-main">
                <span className="sr-name">Add to my status</span>
              </span>
            </button>
          )}

          {error && (
            <div className="error-banner" style={{ margin: "10px 16px" }}>
              {error}
            </div>
          )}

          {recent.length > 0 && <div className="status-section-label">Recent updates</div>}
          {recent.map((e) => (
            <Row key={e.authorId} entry={e} index={entries.indexOf(e)} />
          ))}

          {seen.length > 0 && <div className="status-section-label">Viewed</div>}
          {seen.map((e) => (
            <Row key={e.authorId} entry={e} index={entries.indexOf(e)} />
          ))}

          {!loading && entries.length === 0 && (
            <div style={{ padding: 20 }} className="muted">
              No status updates yet. Post one — it disappears after 24 hours.
            </div>
          )}
        </div>
      </div>

      {/* Right-hand explainer panel, mirroring the inbox's empty state */}
      <div className="thread-empty">
        <h2>Status</h2>
        <p>
          Updates vanish after 24 hours and are visible to colleagues only. Clients messaging over
          WhatsApp never see them — Meta gives businesses no status channel.
        </p>
        <div className="rule" />
      </div>

      {composing && (
        <div className="modal-back" onClick={() => setComposing(false)} role="presentation">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>New status</h3>
            <div className="modal-body" style={{ padding: 18 }}>
              <input
                ref={imageRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => e.target.files?.[0] && postImage(e.target.files[0])}
              />

              <div
                className="story-card"
                style={{
                  background: bg,
                  width: "100%",
                  height: 180,
                  fontSize: "1.1rem",
                  padding: 20,
                  marginBottom: 14,
                }}
              >
                {text || "Type something…"}
              </div>

              <div className="field">
                <label htmlFor="stext">Status text</label>
                <input
                  id="stext"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="What's happening?"
                  maxLength={700}
                  autoFocus
                />
              </div>

              <label>Background</label>
              <div className="composer-swatches">
                {BACKGROUNDS.map((c) => (
                  <button
                    key={c}
                    className={`swatch ${bg === c ? "on" : ""}`}
                    style={{ background: c }}
                    onClick={() => setBg(c)}
                    aria-label={`Background ${c}`}
                  />
                ))}
              </div>
            </div>
            <div className="modal-foot" style={{ gap: 8 }}>
              <button onClick={() => imageRef.current?.click()} disabled={busy}>
                <span style={{ display: "inline-flex", gap: 7, alignItems: "center" }}>
                  <IconImage size={17} /> Photo instead
                </span>
              </button>
              <button className="primary" onClick={postText} disabled={busy || !text.trim()}>
                <span style={{ display: "inline-flex", gap: 7, alignItems: "center" }}>
                  <IconPencil size={16} /> {busy ? "Posting…" : "Post status"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {openAt !== null && entries[openAt] && (
        <StoryViewer
          entries={entries}
          startAuthorIndex={openAt}
          onClose={() => setOpenAt(null)}
          onViewed={markViewedLocally}
          onDeleted={load}
        />
      )}
    </>
  );
}

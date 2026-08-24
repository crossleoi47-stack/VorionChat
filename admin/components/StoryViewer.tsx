"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, statusMediaUrl } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { IconTrash } from "@/components/Icons";

export interface StatusItem {
  id: string;
  type: string;
  body: string | null;
  backgroundColor: string | null;
  hasMedia: boolean;
  mimeType: string | null;
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
  viewCount: number | null;
}

export interface StatusEntry {
  authorId: string;
  authorName: string;
  isMe: boolean;
  latestAt: string;
  unseenCount: number;
  items: StatusItem[];
}

interface Viewer {
  userId: string;
  fullName: string;
  viewedAt: string;
}

const SLIDE_MS = 6000;

function ago(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ago`;
}

/**
 * Full-screen story viewer: auto-advancing progress bars, tap left/right to
 * step, and — for your own status — a viewer list. Advancing past the last
 * item in an author's set moves to the next author, like WhatsApp.
 */
export function StoryViewer({
  entries,
  startAuthorIndex,
  onClose,
  onViewed,
  onDeleted,
}: {
  entries: StatusEntry[];
  startAuthorIndex: number;
  onClose: () => void;
  onViewed: (statusId: string) => void;
  onDeleted: () => void;
}) {
  const [ai, setAi] = useState(startAuthorIndex);
  const [ii, setIi] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewers, setViewers] = useState<Viewer[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const entry = entries[ai];
  const item = entry?.items[ii];

  // These deliberately branch on the current ai/ii rather than doing the work
  // inside a setState updater. Updaters must be pure: React re-invokes them
  // (twice in StrictMode), so calling setAi/onClose from inside one fired
  // onClose on mount and slammed the viewer shut the instant it opened.
  const next = useCallback(() => {
    setViewers(null);
    const e = entries[ai];
    if (!e) return;
    if (ii + 1 < e.items.length) {
      setIi(ii + 1);
      return;
    }
    // End of this author's set — advance to the next author, or close.
    if (ai + 1 < entries.length) {
      setAi(ai + 1);
      setIi(0);
      return;
    }
    onClose();
  }, [ai, ii, entries, onClose]);

  const prev = useCallback(() => {
    setViewers(null);
    if (ii > 0) {
      setIi(ii - 1);
      return;
    }
    if (ai > 0) {
      const back = ai - 1;
      setAi(back);
      setIi(Math.max(0, entries[back].items.length - 1));
    }
  }, [ai, ii, entries]);

  // Mark viewed as soon as a slide is shown.
  useEffect(() => {
    if (!item || entry?.isMe) return;
    api(`/status/${item.id}/view`, { method: "POST" })
      .then(() => onViewed(item.id))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  // Auto-advance, paused while the viewer sheet is open.
  useEffect(() => {
    if (!item || paused) return;
    timer.current = setTimeout(next, SLIDE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [item?.id, paused, next]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [next, prev, onClose]);

  async function showViewers() {
    if (!item) return;
    setPaused(true);
    try {
      setViewers(await api<Viewer[]>(`/status/${item.id}/viewers`));
    } catch {
      setViewers([]);
    }
  }

  async function del() {
    if (!item || !confirm("Delete this status?")) return;
    await api(`/status/${item.id}`, { method: "DELETE" }).catch(() => {});
    onDeleted();
    onClose();
  }

  if (!entry || !item) return null;

  return (
    <div className="story-view">
      <div className="story-bars">
        {entry.items.map((s, i) => (
          <span
            key={s.id}
            className={`bar ${i < ii ? "done" : ""} ${i === ii && !paused ? "active" : ""}`}
            style={{ ["--dur" as string]: `${SLIDE_MS}ms` }}
          >
            <i />
          </span>
        ))}
      </div>

      <div className="story-top">
        <Avatar name={entry.authorName} seed={entry.authorId} size="md" />
        <div>
          <div className="st-name">{entry.isMe ? "My status" : entry.authorName}</div>
          <div className="st-time">{ago(item.createdAt)}</div>
        </div>
        <span className="spacer" />
        {entry.isMe && (
          <button onClick={del} title="Delete status" aria-label="Delete status">
            <IconTrash size={20} />
          </button>
        )}
        <button onClick={onClose} title="Close" aria-label="Close">
          ✕
        </button>
      </div>

      <div className="story-body">
        <button className="story-nav prev" onClick={prev} aria-label="Previous" />
        {item.hasMedia ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="story-media" src={statusMediaUrl(item.id)} alt={item.body ?? "Status"} />
        ) : (
          <div
            className="story-card"
            style={{ background: item.backgroundColor ?? "var(--brand-blue)" }}
          >
            {item.body}
          </div>
        )}
        {item.hasMedia && item.body && <div className="story-caption">{item.body}</div>}
        <button className="story-nav next" onClick={next} aria-label="Next" />

        {viewers && (
          <div className="viewer-sheet" onClick={(e) => e.stopPropagation()}>
            <h4>
              {viewers.length} view{viewers.length === 1 ? "" : "s"}
            </h4>
            {viewers.map((v) => (
              <div className="member-row" key={v.userId} style={{ padding: "8px 18px" }}>
                <Avatar name={v.fullName} seed={v.userId} size="md" />
                <span className="m-name">
                  {v.fullName}
                  <div className="muted" style={{ fontSize: ".76rem" }}>
                    {ago(v.viewedAt)}
                  </div>
                </span>
              </div>
            ))}
            {viewers.length === 0 && (
              <div style={{ padding: 18 }} className="muted">
                No one has viewed this yet.
              </div>
            )}
            <div style={{ padding: "8px 18px" }}>
              <button
                onClick={() => {
                  setViewers(null);
                  setPaused(false);
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {entry.isMe && !viewers && (
        <div className="story-foot">
          <button className="story-viewers-btn" onClick={showViewers}>
            👁 {item.viewCount ?? 0} view{item.viewCount === 1 ? "" : "s"}
          </button>
        </div>
      )}
    </div>
  );
}

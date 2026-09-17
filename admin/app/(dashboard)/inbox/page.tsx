"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, apiUpload } from "@/lib/api";
import { clearTokens } from "@/lib/api";
import { getSocket, resetSocket } from "@/lib/socket";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Avatar } from "@/components/Avatar";
import { NewGroupModal } from "@/components/NewGroupModal";
import { NewChatModal } from "@/components/NewChatModal";
import { GroupInfoPane } from "@/components/GroupInfoPane";
import { AttachmentMedia } from "@/components/AttachmentMedia";
import { usePresence } from "@/lib/usePresence";
import { useCallApi } from "@/components/CallProvider";
import {
  IconArchive,
  IconAttach,
  IconCheck,
  IconChevron,
  IconCopy,
  IconDoc,
  IconEmoji,
  IconForward,
  IconImage,
  IconMenu,
  IconMic,
  IconMuted,
  IconNewChat,
  IconPencil,
  IconPhone,
  IconPin,
  IconPlus,
  IconReply,
  IconSearch,
  IconSend,
  IconStar,
  IconStop,
  IconTrash,
  IconShield,
  IconVideo,
} from "@/components/Icons";

interface Conversation {
  id: string;
  type: string;
  groupId?: string | null;
  peerUserId?: string | null;
  peerName?: string | null;
  clientDisplayCode: string | null;
  clientName: string | null;
  groupName: string | null;
  lastMessageAt: string | null;
  archived: boolean;
  pinned: boolean;
  muted: boolean;
  unreadCount: number;
}

interface Att {
  id: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string | null;
}
interface Rx {
  emoji: string;
  count: number;
  mine: boolean;
}
interface ReplyPreview {
  id: string;
  senderLabel: string;
  text: string;
  kind: string;
}

interface Message {
  id: string;
  conversationId: string;
  senderUserId: string | null;
  senderName: string | null;
  senderIsClient: boolean;
  channel: string;
  type: string;
  body: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedForAll: boolean;
  forwarded: boolean;
  attachment: Att | null;
  replyTo: ReplyPreview | null;
  reactions: Rx[];
  starred: boolean;
  deliveredAt?: string | null;
  readAt?: string | null;
}

interface Pending {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  originalName: string;
  kind: "IMAGE" | "VOICE" | "DOCUMENT";
  previewUrl?: string;
}

type Filter = "all" | "unread" | "groups";
const QUICK = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const titleOf = (c: Conversation) =>
  c.clientName ?? c.groupName ?? c.peerName ?? "Conversation";
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();

function listStamp(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return hhmm(iso);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  if ((now.getTime() - d.getTime()) / 86400000 < 7)
    return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  if ((now.getTime() - d.getTime()) / 86400000 < 7)
    return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
}

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const kindOf = (m: string): "IMAGE" | "VOICE" | "DOCUMENT" =>
  m.startsWith("image/") ? "IMAGE" : m.startsWith("audio/") ? "VOICE" : "DOCUMENT";

function splitPrefix(body: string | null): { sender: string | null; text: string } {
  if (!body) return { sender: null, text: "" };
  const m = body.match(/^\*(.+?):\*\s([\s\S]*)$/);
  return m ? { sender: m[1], text: m[2] } : { sender: null, text: body };
}

export default function InboxPage() {
  const { user } = useCurrentUser();
  const router = useRouter();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [lastMsg, setLastMsg] = useState<Record<string, Message>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [typingFrom, setTypingFrom] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<{ id: string; x: number; y: number } | null>(null);
  const [rxFor, setRxFor] = useState<{ id: string; x: number; y: number } | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [newGroup, setNewGroup] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = selectedId;

  const loadConvs = useCallback(() => {
    api<Conversation[]>("/conversations")
      .then(setConvs)
      .catch(() => {});
  }, []);

  useEffect(loadConvs, [loadConvs]);

  const closePopovers = useCallback(() => {
    setMenuFor(null);
    setRxFor(null);
    setAttachOpen(false);
    setHeaderMenuOpen(false);
    setLogoutConfirm(false);
  }, []);

  // Escape closes popovers and cancels reply/edit. Outside-clicks are handled
  // by an explicit backdrop element rather than a window listener — a window
  // listener races React's own root-level click handling and swallowed the
  // very click that opened the menu.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closePopovers();
        setReplyTo(null);
        setEditing(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [closePopovers]);

  useEffect(() => {
    const socket = getSocket();

    function upsert(msg: Message) {
      if (msg.conversationId === selRef.current) {
        setMessages((p) => {
          const i = p.findIndex((m) => m.id === msg.id);
          if (i === -1) return [...p, msg];
          // Preserve this viewer's private flags; the broadcast omits them.
          const next = [...p];
          next[i] = { ...msg, starred: p[i].starred, reactions: msg.reactions };
          return next;
        });
      }
      setLastMsg((p) => ({ ...p, [msg.conversationId]: msg }));
    }

    function onNew(msg: Message) {
      upsert(msg);
      setConvs((p) =>
        p.map((c) =>
          c.id === msg.conversationId
            ? {
                ...c,
                lastMessageAt: msg.createdAt,
                unreadCount:
                  msg.conversationId === selRef.current || msg.senderUserId === user?.id
                    ? c.unreadCount
                    : c.unreadCount + 1,
              }
            : c,
        ),
      );
    }

    function onStatus(p: { messageId: string; status: string }) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === p.messageId
            ? {
                ...m,
                deliveredAt:
                  p.status === "delivered" || p.status === "read"
                    ? new Date().toISOString()
                    : m.deliveredAt,
                readAt: p.status === "read" ? new Date().toISOString() : m.readAt,
              }
            : m,
        ),
      );
    }

    function onTyping(p: { conversationId: string; name: string }) {
      if (p.conversationId !== selRef.current) return;
      setTypingFrom(p.name);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTypingFrom(null), 3000);
    }

    socket.on("message:new", onNew);
    socket.on("message:update", upsert);
    socket.on("message:status", onStatus);
    socket.on("conversation:typing", onTyping);
    return () => {
      socket.off("message:new", onNew);
      socket.off("message:update", upsert);
      socket.off("message:status", onStatus);
      socket.off("conversation:typing", onTyping);
    };
  }, [user?.id]);

  useEffect(() => {
    convs.slice(0, 30).forEach((c) => {
      if (lastMsg[c.id] || !c.lastMessageAt) return;
      api<Message[]>(`/conversations/${c.id}/messages`)
        .then((ms) => {
          const last = ms[ms.length - 1];
          if (last) setLastMsg((p) => ({ ...p, [c.id]: last }));
        })
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convs]);

  useEffect(() => {
    if (!selectedId) return;
    getSocket().emit("conversation:join", selectedId);
    setTypingFrom(null);
    setReplyTo(null);
    setEditing(null);
    setMessages([]);
    api<Message[]>(`/conversations/${selectedId}/messages`)
      .then(setMessages)
      .catch(() => {});
    api(`/conversations/${selectedId}/read`, { method: "POST" }).catch(() => {});
    setConvs((p) => p.map((c) => (c.id === selectedId ? { ...c, unreadCount: 0 } : c)));
  }, [selectedId]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, typingFrom]);

  function onDraft(v: string) {
    setDraft(v);
    if (selectedId && user) {
      getSocket().emit("conversation:typing", { conversationId: selectedId, name: user.fullName });
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setAttachOpen(false);
    setUploading(true);
    try {
      const up = await apiUpload<Omit<Pending, "previewUrl">>("/attachments/upload", file);
      setPending({ ...up, previewUrl: up.kind === "IMAGE" ? URL.createObjectURL(file) : undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function startRec() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        await handleFile(new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" }));
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      setError("Microphone unavailable — check the browser's permission prompt.");
    }
  }

  function stopRec() {
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;

    if (editing) {
      const body = draft.trim();
      if (!body) return;
      try {
        const updated = await api<Message>(`/messages/${editing.id}`, {
          method: "PATCH",
          body: { body },
        });
        setMessages((p) => p.map((m) => (m.id === updated.id ? updated : m)));
        setEditing(null);
        setDraft("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not edit");
      }
      return;
    }

    if (!draft.trim() && !pending) return;
    setSending(true);
    setError(null);
    try {
      const msg = await api<Message>(`/conversations/${selectedId}/messages`, {
        method: "POST",
        body: {
          body: draft.trim() || undefined,
          type: pending?.kind ?? "TEXT",
          replyToId: replyTo?.id,
          attachment: pending
            ? {
                storageKey: pending.storageKey,
                mimeType: pending.mimeType,
                sizeBytes: pending.sizeBytes,
                checksum: pending.checksum,
                originalName: pending.originalName,
              }
            : undefined,
        },
      });
      setMessages((p) => (p.some((m) => m.id === msg.id) ? p : [...p, msg]));
      setLastMsg((p) => ({ ...p, [msg.conversationId]: msg }));
      setDraft("");
      setPending(null);
      setReplyTo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  async function react(id: string, emoji: string) {
    setRxFor(null);
    try {
      const updated = await api<Message>(`/messages/${id}/react`, { method: "POST", body: { emoji } });
      setMessages((p) => p.map((m) => (m.id === id ? updated : m)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not react");
    }
  }

  async function toggleStar(id: string) {
    setMenuFor(null);
    const updated = await api<Message>(`/messages/${id}/star`, { method: "POST" });
    setMessages((p) => p.map((m) => (m.id === id ? updated : m)));
  }

  async function del(id: string, forEveryone: boolean) {
    setMenuFor(null);
    try {
      const updated = await api<Message>(`/messages/${id}?forEveryone=${forEveryone}`, {
        method: "DELETE",
      });
      setMessages((p) =>
        forEveryone ? p.map((m) => (m.id === id ? updated : m)) : p.filter((m) => m.id !== id),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  }

  async function doForward(toConversationId: string) {
    if (!forwarding) return;
    try {
      await api(`/messages/${forwarding.id}/forward`, {
        method: "POST",
        body: { toConversationId },
      });
      setForwarding(null);
      loadConvs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not forward");
    }
  }

  async function setConvState(id: string, patch: Partial<Pick<Conversation, "archived" | "pinned" | "muted">>) {
    setConvs((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await api(`/conversations/${id}/state`, { method: "PATCH", body: patch }).catch(() => {});
  }

  function startEdit(m: Message) {
    setMenuFor(null);
    setEditing(m);
    setReplyTo(null);
    setDraft(splitPrefix(m.body).text);
    inputRef.current?.focus();
  }

  function startReply(m: Message) {
    setMenuFor(null);
    setEditing(null);
    setReplyTo(m);
    inputRef.current?.focus();
  }

  const selected = convs.find((c) => c.id === selectedId) ?? null;
  const archivedCount = convs.filter((c) => c.archived).length;
  const { statusOf, isOnline } = usePresence(convs.map((c) => c.peerUserId));
  const { placeCall } = useCallApi();

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = convs.filter((c) => (showArchived ? c.archived : !c.archived));
    if (q) {
      list = list.filter(
        (c) =>
          titleOf(c).toLowerCase().includes(q) ||
          (c.clientDisplayCode ?? "").toLowerCase().includes(q),
      );
    }
    if (filter === "unread") list = list.filter((c) => c.unreadCount > 0);
    if (filter === "groups") list = list.filter((c) => c.type === "GROUP");
    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "");
    });
  }, [convs, search, filter, showArchived]);

  const unreadTotal = convs.reduce((s, c) => s + (c.archived ? 0 : c.unreadCount), 0);

  function preview(m: Message | undefined) {
    if (!m) return <span className="pv-text muted">No messages yet</span>;
    if (m.deletedForAll)
      return (
        <span className="pv-text" style={{ fontStyle: "italic" }}>
          This message was deleted
        </span>
      );
    const { text } = splitPrefix(m.body);
    const mine = !m.senderIsClient;
    const k = m.attachment ? kindOf(m.attachment.mimeType) : null;
    return (
      <>
        {mine && (
          <span className={`tick-wrap ${m.readAt ? "read" : ""}`}>
            <IconCheck size={15} double={!!(m.deliveredAt || m.readAt)} />
          </span>
        )}
        {k === "IMAGE" && <IconImage size={15} />}
        {k === "VOICE" && <IconMic size={15} />}
        {k === "DOCUMENT" && <IconDoc size={15} />}
        <span className="pv-text">
          {text || (k === "IMAGE" ? "Photo" : k === "VOICE" ? "Voice message" : k ? "Document" : "")}
        </span>
      </>
    );
  }

  return (
    <>
      {/* ── Chat list ── */}
      <div className="chat-list-pane">
        <div className="pane-head">
          <span className="pane-title">{showArchived ? "Archived" : "Chats"}</span>
          <div className="pane-head-actions" style={{ position: "relative" }}>
            <button
              className="head-btn"
              title="New chat"
              aria-label="New chat"
              onClick={() => {
                setHeaderMenuOpen(false);
                setNewChat(true);
              }}
            >
              <IconNewChat />
            </button>
            <button
              className="head-btn"
              title="Menu"
              aria-label="Menu"
              onClick={() => setHeaderMenuOpen((v) => !v)}
            >
              <IconMenu />
            </button>
            {headerMenuOpen && (
              <div
                role="menu"
                aria-label="Chats menu"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  minWidth: 300,
                  padding: 10,
                  background: "#fff",
                  border: "1px solid rgba(134, 150, 160, 0.18)",
                  borderRadius: 16,
                  boxShadow: "0 20px 45px rgba(15, 23, 42, 0.14)",
                  overflow: "visible",
                  zIndex: 90,
                }}
              >
                <button
                  className="pick-row"
                  role="menuitem"
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    setShowArchived((v) => !v);
                  }}
                  style={{ width: "100%", padding: "12px 12px", borderRadius: 10, alignItems: "center", transition: "background-color 0.16s ease, transform 0.16s ease" }}
                >
                  <span
                    className="avatar md"
                    style={{ width: 42, height: 42, minWidth: 42, borderRadius: 12, background: "rgba(79, 70, 229, 0.10)", color: "rgb(67, 56, 202)", fontSize: "1.1rem" }}
                  >
                    <IconArchive size={18} />
                  </span>
                  <span className="pk-main" style={{ gap: 3 }}>
                    <span className="pk-name" style={{ fontSize: 15.5, fontWeight: 600 }}>
                      {showArchived ? "Back to chats" : "Archived chats"}
                    </span>
                    <span className="pk-sub" style={{ fontSize: 12.5, color: "rgba(71, 85, 105, 0.9)" }}>
                      Show archived conversations
                    </span>
                  </span>
                </button>
                <div style={{ height: 1, background: "rgba(148, 163, 184, 0.18)", margin: "4px 10px" }} />
                <Link
                  className="pick-row"
                  role="menuitem"
                  href="/profile"
                  onClick={() => setHeaderMenuOpen(false)}
                  style={{ width: "100%", padding: "12px 12px", borderRadius: 10, alignItems: "center", transition: "background-color 0.16s ease, transform 0.16s ease" }}
                >
                  <span
                    className="avatar md"
                    style={{ width: 42, height: 42, minWidth: 42, borderRadius: 12, background: "rgba(16, 185, 129, 0.10)", color: "rgb(5, 150, 105)", fontSize: "1.1rem" }}
                  >
                    <IconPencil size={18} />
                  </span>
                  <span className="pk-main" style={{ gap: 3 }}>
                    <span className="pk-name" style={{ fontSize: 15.5, fontWeight: 600 }}>
                      My profile
                    </span>
                    <span className="pk-sub" style={{ fontSize: 12.5, color: "rgba(71, 85, 105, 0.9)" }}>
                      View your account
                    </span>
                  </span>
                </Link>
                <Link
                  className="pick-row"
                  role="menuitem"
                  href="/settings"
                  onClick={() => setHeaderMenuOpen(false)}
                  style={{ width: "100%", padding: "12px 12px", borderRadius: 10, alignItems: "center", transition: "background-color 0.16s ease, transform 0.16s ease" }}
                >
                  <span
                    className="avatar md"
                    style={{ width: 42, height: 42, minWidth: 42, borderRadius: 12, background: "rgba(6, 182, 212, 0.10)", color: "rgb(8, 145, 178)", fontSize: "1.1rem" }}
                  >
                    <IconShield size={18} />
                  </span>
                  <span className="pk-main" style={{ gap: 3 }}>
                    <span className="pk-name" style={{ fontSize: 15.5, fontWeight: 600 }}>
                      Settings
                    </span>
                    <span className="pk-sub" style={{ fontSize: 12.5, color: "rgba(71, 85, 105, 0.9)" }}>
                      Account preferences
                    </span>
                  </span>
                </Link>
                <div style={{ height: 1, background: "rgba(148, 163, 184, 0.18)", margin: "4px 10px" }} />
                <button
                  className="pick-row"
                  role="menuitem"
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    setLogoutConfirm(true);
                  }}
                  style={{ width: "100%", padding: "12px 12px", borderRadius: 10, alignItems: "center", transition: "background-color 0.16s ease, transform 0.16s ease" }}
                >
                  <span
                    className="avatar md"
                    style={{ width: 42, height: 42, minWidth: 42, borderRadius: 12, background: "rgba(239, 68, 68, 0.10)", color: "rgb(220, 38, 38)", fontSize: "1.1rem" }}
                  >
                    ↪
                  </span>
                  <span className="pk-main" style={{ gap: 3 }}>
                    <span className="pk-name" style={{ fontSize: 15.5, fontWeight: 600 }}>
                      Logout
                    </span>
                    <span className="pk-sub" style={{ fontSize: 12.5, color: "rgba(71, 85, 105, 0.9)" }}>
                      Sign out of Vorion Chat
                    </span>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
        {logoutConfirm && (
          <div className="modal-back" onClick={() => setLogoutConfirm(false)} role="presentation">
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: 18 }}>
                <h3 style={{ marginTop: 0 }}>Logout?</h3>
                <p className="muted" style={{ marginTop: 0 }}>
                  Are you sure you want to log out of Vorion Chat?
                </p>
              </div>
              <div className="modal-foot" style={{ gap: 8 }}>
                <button onClick={() => setLogoutConfirm(false)}>Cancel</button>
                <button
                  className="primary"
                  onClick={async () => {
                    try {
                      await api("/auth/logout", { method: "POST" });
                    } catch {
                      // If the server session is already gone, still clear local auth.
                    } finally {
                      resetSocket();
                      clearTokens();
                      router.replace("/login");
                    }
                  }}
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="search-row">
          <div className="search-box">
            <span className="s-icon">
              <IconSearch size={18} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or start a new chat"
              aria-label="Search chats"
            />
          </div>
        </div>

        {!showArchived && (
          <div className="filter-row">
            <button className={`chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>
              All
            </button>
            <button
              className={`chip ${filter === "unread" ? "on" : ""}`}
              onClick={() => setFilter("unread")}
            >
              Unread{unreadTotal > 0 ? ` ${unreadTotal}` : ""}
            </button>
            <button
              className={`chip ${filter === "groups" ? "on" : ""}`}
              onClick={() => setFilter("groups")}
            >
              Groups
            </button>
          </div>
        )}

        <button className="archived-row" type="button" onClick={() => setShowArchived((v) => !v)}>
          <span className="arch-icon">
            <IconArchive size={19} />
          </span>
          {showArchived ? "Back to chats" : "Archived"}
          {!showArchived && <span className="arch-count">{archivedCount}</span>}
        </button>

        <div className="chat-rows">
          {rows.map((c) => (
            <button
              key={c.id}
              className={`chat-row ${c.id === selectedId ? "on" : ""} ${c.unreadCount > 0 ? "unread" : ""}`}
              onClick={() => setSelectedId(c.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setConvState(c.id, { pinned: !c.pinned });
              }}
              title="Right-click to pin/unpin"
            >
              <span className="avatar-wrap">
                <Avatar name={titleOf(c)} seed={c.id} />
                {isOnline(c.peerUserId) && <span className="online-dot" />}
              </span>
              <span className="cr-main">
                <span className="cr-top">
                  <span className="cr-name">{titleOf(c)}</span>
                  <span className="cr-time">{listStamp(c.lastMessageAt)}</span>
                </span>
                <span className="cr-bot">
                  <span className="cr-prev">{preview(lastMsg[c.id])}</span>
                  <span className="cr-icons">
                    {c.muted && <IconMuted size={15} />}
                    {c.pinned && <IconPin size={15} />}
                  </span>
                  {c.type === "WHATSAPP" && <span className="wa-tag">WA</span>}
                  {c.unreadCount > 0 && <span className="cr-badge">{c.unreadCount}</span>}
                </span>
              </span>
            </button>
          ))}
          {rows.length === 0 && (
            <div style={{ padding: 20 }} className="muted">
              {search || filter !== "all" ? "No chats match." : "Nothing here."}
            </div>
          )}
        </div>
      </div>

      {/* ── Thread ── */}
      {selected ? (
        <div className="thread-pane">
          <div
            className="thread-head"
            onClick={() => selected.type === "GROUP" && setShowInfo(true)}
            style={selected.type === "GROUP" ? { cursor: "pointer" } : undefined}
            title={selected.type === "GROUP" ? "Group info" : undefined}
          >
            <span className="avatar-wrap">
              <Avatar name={titleOf(selected)} seed={selected.id} size="md" />
              {isOnline(selected.peerUserId) && <span className="online-dot" />}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="th-name">{titleOf(selected)}</div>
              <div className="th-sub">
                {typingFrom
                  ? `${typingFrom} is typing…`
                  : selected.type === "GROUP"
                    ? "Group · tap for info"
                    : selected.type === "DIRECT"
                      ? // Presence is ours to show for staff. A WhatsApp client's
                        // online/last-seen is never exposed by Meta, so that
                        // branch shows the channel instead of a fake status.
                        (statusOf(selected.peerUserId) ?? "")
                      : selected.clientDisplayCode}
                {!typingFrom && selected.type === "WHATSAPP" ? " · via WhatsApp" : ""}
              </div>
            </div>
            <div className="th-actions" onClick={(e) => e.stopPropagation()}>
              {/* Calling is staff-to-staff only: Meta offers businesses no
                  calling channel to a WhatsApp client, and a group call needs
                  an SFU we haven't built. Disabled with a reason rather than
                  hidden, so the limit is visible. */}
              <button
                className="head-btn"
                title={
                  selected.type === "DIRECT"
                    ? `Video call ${titleOf(selected)}`
                    : "Video calls are staff-to-staff only"
                }
                disabled={selected.type !== "DIRECT" || !selected.peerUserId}
                onClick={() =>
                  selected.peerUserId &&
                  placeCall(selected.peerUserId, titleOf(selected), "VIDEO")
                }
              >
                <IconVideo />
              </button>
              <button
                className="head-btn"
                title={
                  selected.type === "DIRECT"
                    ? `Voice call ${titleOf(selected)}`
                    : "Voice calls are staff-to-staff only"
                }
                disabled={selected.type !== "DIRECT" || !selected.peerUserId}
                onClick={() =>
                  selected.peerUserId &&
                  placeCall(selected.peerUserId, titleOf(selected), "VOICE")
                }
              >
                <IconPhone />
              </button>
              <button
                className="head-btn"
                title={selected.muted ? "Unmute" : "Mute"}
                onClick={() => setConvState(selected.id, { muted: !selected.muted })}
              >
                <IconMuted />
              </button>
              <button
                className="head-btn"
                title={selected.archived ? "Unarchive" : "Archive"}
                onClick={() => setConvState(selected.id, { archived: !selected.archived })}
              >
                <IconArchive />
              </button>
            </div>
          </div>

          <div className="thread-body" ref={bodyRef}>
            <div className="thread-inner">
              {messages.map((m, i) => {
                const mine = !m.senderIsClient && m.senderUserId === user?.id;
                const out = !m.senderIsClient;
                const prev = messages[i - 1];
                const newDay =
                  !prev ||
                  new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
                const run =
                  !!prev &&
                  !newDay &&
                  prev.senderIsClient === m.senderIsClient &&
                  prev.senderUserId === m.senderUserId &&
                  !m.replyTo;
                const { sender, text } = splitPrefix(m.body);
                const k = m.attachment ? kindOf(m.attachment.mimeType) : null;
                // In a group, WhatsApp labels every message that isn't yours
                // with the sender's name; on a client thread the label comes
                // from our outbound `*Name:*` prefix instead.
                const label = selected.type === "GROUP" ? m.senderName : sender;
                const showSender = out && !mine && label && !run;

                return (
                  <div key={m.id}>
                    {newDay && <div className="day-pill">{dayLabel(m.createdAt)}</div>}
                    <div className={`row ${out ? "out" : ""} ${run ? "tight" : ""}`}>
                      <div>
                        <div
                          className={`bub ${!run ? "tail" : ""} ${k && !m.deletedForAll ? "media" : ""} ${
                            k && text ? "with-caption" : ""
                          }`}
                        >
                          {!m.deletedForAll && (
                            <button
                              className={`bub-menu-btn ${menuFor?.id === m.id ? "open" : ""}`}
                              aria-label="Message options"
                              onClick={(e) => {
                                e.stopPropagation();
                                const r = (e.target as HTMLElement).getBoundingClientRect();
                                setRxFor(null);
                                setMenuFor(
                                  menuFor?.id === m.id
                                    ? null
                                    : { id: m.id, x: Math.min(r.left, window.innerWidth - 200), y: r.bottom + 4 },
                                );
                              }}
                            >
                              <IconChevron size={17} />
                            </button>
                          )}

                          {m.deletedForAll ? (
                            <div className="deleted-note">
                              <IconTrash size={15} /> This message was deleted
                            </div>
                          ) : (
                            <>
                              {m.forwarded && (
                                <div className="fwd-tag">
                                  <IconForward size={14} /> Forwarded
                                </div>
                              )}
                              {showSender && <div className="bub-sender">{label}</div>}

                              {m.replyTo && (
                                <span
                                  className="quote"
                                  onClick={() => {
                                    const el = document.getElementById(`m-${m.replyTo!.id}`);
                                    el?.scrollIntoView({ behavior: "smooth", block: "center" });
                                  }}
                                >
                                  <span className="q-who">{m.replyTo.senderLabel}</span>
                                  <span className="q-txt">{m.replyTo.text}</span>
                                </span>
                              )}

                              {m.attachment && (
                                <AttachmentMedia attachment={m.attachment} onZoom={setLightbox} />
                              )}

                              {text && <div className="bub-text" id={`m-${m.id}`}>{text}</div>}

                              <span className="bub-meta">
                                {m.starred && <IconStar size={12} filled />}
                                {m.editedAt && <span className="edited">edited</span>}
                                {hhmm(m.createdAt)}
                                {mine && (
                                  <span className={`tick-wrap ${m.readAt ? "read" : ""}`}>
                                    <IconCheck size={16} double={!!(m.deliveredAt || m.readAt)} />
                                  </span>
                                )}
                              </span>
                            </>
                          )}
                        </div>

                        {m.reactions.length > 0 && (
                          <div className="rx-row" style={out ? { justifyContent: "flex-end" } : undefined}>
                            {m.reactions.map((r) => (
                              <button
                                key={r.emoji}
                                className={`rx ${r.mine ? "mine" : ""}`}
                                onClick={() => react(m.id, r.emoji)}
                                title={r.mine ? "Remove your reaction" : "React"}
                              >
                                {r.emoji}
                                {r.count > 1 && <span className="n">{r.count}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="error-banner" style={{ margin: "0 16px 6px", borderRadius: 6 }}>
              {error}
            </div>
          )}

          {(replyTo || editing) && (
            <div className="reply-bar">
              <span style={{ color: "var(--accent)" }}>
                {editing ? <IconPencil size={20} /> : <IconReply size={20} />}
              </span>
              <div className="rb-body">
                <div className="rb-who">
                  {editing
                    ? "Editing message"
                    : replyTo!.senderIsClient
                      ? titleOf(selected)
                      : (splitPrefix(replyTo!.body).sender ?? "You")}
                </div>
                <div className="rb-txt">
                  {splitPrefix((editing ?? replyTo)!.body).text ||
                    (editing ?? replyTo)!.type.toLowerCase()}
                </div>
              </div>
              <button
                className="head-btn"
                onClick={() => {
                  setReplyTo(null);
                  setEditing(null);
                  if (editing) setDraft("");
                }}
                aria-label="Cancel"
              >
                ✕
              </button>
            </div>
          )}

          {pending && (
            <div className="attach-bar">
              {pending.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pending.previewUrl} alt="" />
              ) : pending.kind === "VOICE" ? (
                <IconMic size={22} />
              ) : (
                <IconDoc size={22} />
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{pending.originalName}</b>{" "}
                <span className="muted">({bytes(pending.sizeBytes)})</span>
              </span>
              <button type="button" className="ghost" onClick={() => setPending(null)}>
                Remove
              </button>
            </div>
          )}

          <form className="composer" onSubmit={onSubmit}>
            <input
              ref={imageRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
              hidden
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />

            <div style={{ position: "relative", display: "flex" }}>
              <button
                type="button"
                className="comp-btn"
                title="Attach"
                aria-label="Attach"
                disabled={uploading || recording}
                onClick={(e) => {
                  e.stopPropagation();
                  setAttachOpen((v) => !v);
                }}
                style={attachOpen ? { transform: "rotate(45deg)" } : undefined}
              >
                <IconPlus />
              </button>
              {attachOpen && (
                <div className="ctx" style={{ bottom: 50, left: 0, position: "absolute" }}>
                  <button type="button" onClick={() => imageRef.current?.click()}>
                    <IconImage size={19} /> Photo
                  </button>
                  <button type="button" onClick={() => fileRef.current?.click()}>
                    <IconAttach size={19} /> Document
                  </button>
                </div>
              )}
            </div>

            <button type="button" className="comp-btn" title="Emoji — coming soon" disabled>
              <IconEmoji />
            </button>

            <input
              ref={inputRef}
              className="comp-input"
              type="text"
              value={draft}
              onChange={(e) => onDraft(e.target.value)}
              placeholder={
                uploading
                  ? "Uploading…"
                  : recording
                    ? "Recording… tap stop to finish"
                    : editing
                      ? "Edit your message"
                      : "Type a message"
              }
              disabled={sending || recording}
            />

            {draft.trim() || pending || editing ? (
              <button
                className="comp-btn send"
                type="submit"
                title={editing ? "Save edit" : "Send"}
                aria-label={editing ? "Save edit" : "Send"}
                disabled={sending || uploading}
              >
                <IconSend />
              </button>
            ) : (
              <button
                type="button"
                className={`comp-btn ${recording ? "rec" : ""}`}
                title={recording ? "Stop recording" : "Record voice message"}
                aria-label={recording ? "Stop recording" : "Record voice message"}
                onClick={recording ? stopRec : startRec}
                disabled={uploading}
              >
                {recording ? <IconStop /> : <IconMic />}
              </button>
            )}
          </form>
        </div>
      ) : (
        <div className="thread-empty">
          <h2>Vorion Systems</h2>
          <p>
            Send and receive messages with your assigned clients. Their phone numbers stay with the
            company — you never see them, and they never see yours.
          </p>
          <div className="rule" />
        </div>
      )}

      {selected?.type === "GROUP" && showInfo && selected.groupId && (
        <GroupInfoPane
          groupId={selected.groupId}
          meId={user?.id}
          onClose={() => setShowInfo(false)}
          onLeft={() => {
            setShowInfo(false);
            setSelectedId(null);
            loadConvs();
          }}
        />
      )}

      {newChat && (
        <NewChatModal
          meId={user?.id}
          onClose={() => setNewChat(false)}
          onNewGroup={() => {
            setNewChat(false);
            setNewGroup(true);
          }}
          onOpened={(conversationId) => {
            setNewChat(false);
            loadConvs();
            setSelectedId(conversationId);
          }}
        />
      )}

      {newGroup && (
        <NewGroupModal
          meId={user?.id}
          onClose={() => setNewGroup(false)}
          onCreated={(g) => {
            setNewGroup(false);
            loadConvs();
            setSelectedId(g.conversationId);
          }}
        />
      )}

      {/* One backdrop for every popover — click-away without a window listener. */}
      {(menuFor || rxFor || attachOpen) && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 20 }}
          onClick={closePopovers}
          role="presentation"
        />
      )}

      {/* Message context menu */}
      {menuFor &&
        (() => {
          const m = messages.find((x) => x.id === menuFor.id);
          if (!m) return null;
          const mine = !m.senderIsClient && m.senderUserId === user?.id;
          const isWa = m.channel === "WHATSAPP";
          return (
            <div
              className="ctx"
              style={{ left: menuFor.x, top: menuFor.y, position: "fixed" }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setMenuFor(null);
                  setRxFor({ id: m.id, x: r.left, y: r.top - 48 });
                }}
              >
                <IconEmoji size={19} /> React
              </button>
              <button onClick={() => startReply(m)}>
                <IconReply /> Reply
              </button>
              <button
                onClick={() => {
                  setMenuFor(null);
                  setForwarding(m);
                }}
              >
                <IconForward /> Forward
              </button>
              <button onClick={() => toggleStar(m.id)}>
                <IconStar filled={m.starred} /> {m.starred ? "Unstar" : "Star"}
              </button>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(splitPrefix(m.body).text);
                  setMenuFor(null);
                }}
              >
                <IconCopy /> Copy text
              </button>
              {mine && !isWa && (
                <>
                  <div className="ctx-sep" />
                  <button onClick={() => startEdit(m)}>
                    <IconPencil /> Edit
                  </button>
                </>
              )}
              <div className="ctx-sep" />
              <button className="destructive" onClick={() => del(m.id, false)}>
                <IconTrash /> Delete for me
              </button>
              {mine && !isWa && (
                <button className="destructive" onClick={() => del(m.id, true)}>
                  <IconTrash /> Delete for everyone
                </button>
              )}
            </div>
          );
        })()}

      {/* Quick-reaction bar */}
      {rxFor && (
        <div
          className="react-bar"
          style={{ left: rxFor.x, top: Math.max(rxFor.y, 8), position: "fixed" }}
          onClick={(e) => e.stopPropagation()}
        >
          {QUICK.map((e) => (
            <button key={e} onClick={() => react(rxFor.id, e)} title={`React ${e}`}>
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Forward picker */}
      {forwarding && (
        <div className="modal-back" onClick={() => setForwarding(null)} role="presentation">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Forward to…</h3>
            <div className="modal-body">
              {convs
                .filter((c) => c.id !== forwarding.conversationId)
                .map((c) => (
                  <button key={c.id} className="chat-row" onClick={() => doForward(c.id)}>
                    <Avatar name={titleOf(c)} seed={c.id} size="md" />
                    <span className="cr-main">
                      <span className="cr-name">{titleOf(c)}</span>
                      <span className="cr-prev">
                        <span className="pv-text">{c.clientDisplayCode ?? c.type}</span>
                      </span>
                    </span>
                  </button>
                ))}
              {convs.length < 2 && (
                <div style={{ padding: 20 }} className="muted">
                  No other conversation to forward to yet.
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button onClick={() => setForwarding(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)} role="presentation">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Attachment" />
        </div>
      )}
    </>
  );
}

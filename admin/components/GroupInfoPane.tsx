"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Avatar, initialsOf } from "@/components/Avatar";
import { IconTrash } from "@/components/Icons";

interface Member {
  userId: string;
  fullName: string;
  employeeCode: string;
  isAdmin: boolean;
}

export interface GroupDetail {
  id: string;
  conversationId: string;
  name: string;
  description: string | null;
  createdAt: string;
  members: Member[];
  iAmAdmin: boolean;
}

export function GroupInfoPane({
  groupId,
  meId,
  onClose,
  onLeft,
}: {
  groupId: string;
  meId: string | undefined;
  onClose: () => void;
  onLeft: () => void;
}) {
  const [g, setG] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api<GroupDetail>(`/groups/${groupId}`)
      .then(setG)
      .catch(() => setError("Could not load group info"));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  async function setAdmin(userId: string, isAdmin: boolean) {
    setError(null);
    try {
      const updated = await api<GroupDetail>(`/groups/${groupId}/members/${userId}/admin`, {
        method: "PATCH",
        body: { isAdmin },
      });
      setG(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change admin rights");
    }
  }

  async function remove(userId: string) {
    const leaving = userId === meId;
    if (
      !confirm(
        leaving
          ? "Leave this group? You'll stop receiving its messages."
          : "Remove this member from the group?",
      )
    )
      return;
    try {
      await api(`/groups/${groupId}/members/${userId}`, { method: "DELETE" });
      if (leaving) onLeft();
      else load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update members");
    }
  }

  if (!g) {
    return (
      <div className="info-pane">
        <div className="info-head">
          <button className="head-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
          Group info
        </div>
        <div style={{ padding: 20 }} className="muted">
          {error ?? "Loading…"}
        </div>
      </div>
    );
  }

  return (
    <div className="info-pane">
      <div className="info-head">
        <button className="head-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
        Group info
      </div>

      <div className="info-body">
        <div className="info-hero">
          <div className="big-avatar" style={{ background: "var(--brand-blue)" }}>
            {initialsOf(g.name)}
          </div>
          <h3>{g.name}</h3>
          <div className="sub">
            Group · {g.members.length} member{g.members.length === 1 ? "" : "s"}
          </div>
        </div>

        {g.description && (
          <div className="info-sec">
            <h4>Description</h4>
            <p style={{ margin: 0, fontSize: ".9rem" }}>{g.description}</p>
          </div>
        )}

        <div className="info-sec">
          <h4>
            {g.members.length} member{g.members.length === 1 ? "" : "s"}
          </h4>
          {error && <div className="error-banner">{error}</div>}
          {g.members.map((m) => (
            <div className="member-row" key={m.userId}>
              <Avatar name={m.fullName} seed={m.userId} size="md" />
              <span className="m-name">
                {m.fullName}
                {m.userId === meId ? " (you)" : ""}
                <div className="muted" style={{ fontSize: ".78rem" }}>
                  {m.employeeCode}
                </div>
              </span>
              {m.isAdmin && <span className="m-admin">Admin</span>}
              {g.iAmAdmin && (
                <button
                  className="head-btn"
                  style={{ width: "auto", padding: "0 8px", fontSize: ".74rem", fontWeight: 600 }}
                  title={m.isAdmin ? `Remove admin from ${m.fullName}` : `Make ${m.fullName} an admin`}
                  onClick={() => setAdmin(m.userId, !m.isAdmin)}
                >
                  {m.isAdmin ? "Demote" : "Make admin"}
                </button>
              )}
              {g.iAmAdmin && m.userId !== meId && (
                <button
                  className="head-btn"
                  title={`Remove ${m.fullName}`}
                  onClick={() => remove(m.userId)}
                >
                  <IconTrash size={17} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="info-sec" style={{ padding: 0 }}>
          <button className="info-action" onClick={() => remove(meId!)}>
            <IconTrash size={19} /> Leave group
          </button>
        </div>
      </div>
    </div>
  );
}

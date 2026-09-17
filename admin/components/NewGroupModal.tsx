"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { IconSearch } from "@/components/Icons";

interface UserRow {
  id: string;
  employeeCode: string;
  fullName: string;
  status: string;
}

interface UserListResult {
  items: UserRow[];
}

export interface CreatedGroup {
  id: string;
  conversationId: string;
  name: string;
}

/**
 * Two-step, like WhatsApp: pick members, then name the group. Only colleagues
 * appear — a client can never be a group member (see GroupsService for why).
 */
export function NewGroupModal({
  meId,
  onClose,
  onCreated,
}: {
  meId: string | undefined;
  onClose: () => void;
  onCreated: (g: CreatedGroup) => void;
}) {
  const [step, setStep] = useState<"members" | "name">("members");
  const [people, setPeople] = useState<UserRow[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    api<UserListResult | UserRow[]>("/users")
      .then((all) => {
        const rows = Array.isArray(all) ? all : all.items ?? [];
        setPeople(rows.filter((u) => u.status === "ACTIVE" && u.id !== meId));
      })
      .catch(() => setLoadError(true));
  }, [meId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return people;
    return people.filter(
      (p) => p.fullName.toLowerCase().includes(s) || p.employeeCode.toLowerCase().includes(s),
    );
  }, [people, q]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function create() {
    if (!name.trim() || picked.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const g = await api<CreatedGroup>("/groups", {
        method: "POST",
        body: {
          name: name.trim(),
          description: description.trim() || undefined,
          userIds: [...picked],
        },
      });
      onCreated(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the group");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "16px 14px 0" }}>
          <h3 style={{ margin: 0 }}>{step === "members" ? "Add group members" : "New group"}</h3>
        </div>

        {step === "members" ? (
          <>
            <div style={{ padding: "10px 14px" }}>
              <div className="search-box">
                <span className="s-icon">
                  <IconSearch size={18} />
                </span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search colleagues"
                  aria-label="Search colleagues"
                />
              </div>
            </div>
            <div className="modal-body">
              {loadError && (
                <div style={{ padding: 18 }} className="muted">
                  Could not load the staff list — your role may not be allowed to list users.
                </div>
              )}
              {filtered.map((p) => (
                <button key={p.id} className="pick-row" onClick={() => toggle(p.id)}>
                  <Avatar name={p.fullName} seed={p.id} size="md" />
                  <span className="pk-main">
                    <span className="pk-name">{p.fullName}</span>
                    <span className="pk-sub">{p.employeeCode}</span>
                  </span>
                  <span className={`pick-check ${picked.has(p.id) ? "on" : ""}`}>
                    {picked.has(p.id) ? "✓" : ""}
                  </span>
                </button>
              ))}
              {!loadError && filtered.length === 0 && (
                <div style={{ padding: 18 }} className="muted">
                  No colleagues found.
                </div>
              )}
            </div>
            <div className="modal-foot" style={{ justifyContent: "space-between" }}>
              <span className="muted" style={{ alignSelf: "center", fontSize: ".84rem" }}>
                {picked.size} selected
              </span>
              <span style={{ display: "flex", gap: 8 }}>
                <button onClick={onClose}>Cancel</button>
                <button
                  className="primary"
                  disabled={picked.size === 0}
                  onClick={() => setStep("name")}
                >
                  Next
                </button>
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="modal-body" style={{ padding: 18 }}>
              {error && <div className="error-banner">{error}</div>}
              <div className="field">
                <label htmlFor="gname">Group name</label>
                <input
                  id="gname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dubai Sales"
                  maxLength={60}
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="gdesc">Description (optional)</label>
                <input
                  id="gdesc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this group is for"
                  maxLength={200}
                />
              </div>
              <p className="muted" style={{ fontSize: ".82rem", margin: 0 }}>
                {picked.size} member{picked.size === 1 ? "" : "s"} plus you. Groups are staff-only —
                clients cannot be added.
              </p>
            </div>
            <div className="modal-foot" style={{ gap: 8 }}>
              <button onClick={() => setStep("members")}>Back</button>
              <button className="primary" disabled={!name.trim() || busy} onClick={create}>
                {busy ? "Creating…" : "Create group"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { AppRole } from "../users/user-compat";

export type Resource =
  | "client"
  | "client.phone"
  | "user"
  | "assignment"
  | "department"
  | "group"
  | "conversation"
  | "message"
  | "whatsapp_account"
  | "audit_log";

export type Action = "read" | "create" | "update" | "delete" | "disable" | "reassign" | "export";

/**
 * The single source of truth for "who can do what." Route guards and
 * service-layer projectors both read from this table instead of each
 * re-deriving their own role checks — see clients.projector.ts for the
 * mechanism this exists to serve (§11/§14 of the architecture blueprint:
 * phone numbers must be enforced here, not just hidden in a UI).
 *
 * This is deliberately a static map for MVP rather than a DB-editable table
 * (the blueprint's stretch goal of "managers can see phone numbers only for
 * their own team" is a per-row *condition*, not a different policy shape —
 * add it as a scope check in the relevant service once that's needed,
 * without changing this file's structure).
 */
const POLICY: Record<"SUPER_ADMIN" | "COMPANY_ADMIN" | "MANAGER" | "EMPLOYEE" | "AUDITOR", Partial<Record<Resource, Action[]>>> = {
  SUPER_ADMIN: {
    client: ["read", "create", "update"],
    "client.phone": ["read"],
    user: ["read", "create", "update", "delete", "disable"],
    assignment: ["read", "reassign"],
    department: ["read", "create", "update", "delete"],
    group: ["read", "create", "update"],
    conversation: ["read"],
    message: ["read", "create"],
    whatsapp_account: ["read", "create", "update"],
    audit_log: ["read", "export"],
  },
  COMPANY_ADMIN: {
    client: ["read", "create", "update"],
    "client.phone": ["read"],
    user: ["read", "create", "update", "disable"],
    assignment: ["read", "reassign"],
    department: ["read", "create", "update"],
    group: ["read", "create", "update"],
    conversation: ["read"],
    message: ["read", "create"],
    whatsapp_account: ["read", "create", "update"],
    audit_log: ["read", "export"],
  },
  MANAGER: {
    client: ["read", "create"],
    user: ["read"],
    assignment: ["read", "reassign"],
    department: ["read"],
    group: ["read", "create"],
    conversation: ["read"],
    message: ["read", "create"],
  },
  EMPLOYEE: {
    client: ["read"],
    assignment: ["read"],
    // Staff groups are internal collaboration, so any employee can start one
    // — same as WhatsApp. Client-facing access is still governed by
    // assignment, and a client can never be a group member (see GroupsService).
    group: ["read", "create"],
    conversation: ["read"],
    message: ["read", "create"],
  },
  AUDITOR: {
    whatsapp_account: ["read"],
    client: ["read"],
    user: ["read"],
    assignment: ["read"],
    department: ["read"],
    group: ["read"],
    conversation: ["read"],
    audit_log: ["read", "export"],
  },
};

function normalizeRole(role: AppRole): "SUPER_ADMIN" | "COMPANY_ADMIN" | "MANAGER" | "EMPLOYEE" | "AUDITOR" {
  switch (role) {
    case "ADMIN":
      return "COMPANY_ADMIN";
    case "VA":
      return "EMPLOYEE";
    default:
      return role;
  }
}

export function can(role: AppRole, resource: Resource, action: Action): boolean {
  return POLICY[normalizeRole(role)]?.[resource]?.includes(action) ?? false;
}

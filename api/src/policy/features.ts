import { Role } from "@prisma/client";

/**
 * Per-person capability switches, layered *on top of* RBAC — they can only
 * take capability away, never grant something the role doesn't already have.
 * That ordering matters: an admin toggling a switch must never be able to
 * accidentally escalate someone's access.
 */
export const FEATURES = [
  "sendMedia",
  "sendVoice",
  "downloadAttachments",
  "initiateChat",
  "viewClientPhone",
  "forwardMessages",
  "exportData",
  "createGroups",
  "placeCalls",
] as const;

export type Feature = (typeof FEATURES)[number];
export type FeatureMap = Record<Feature, boolean>;

export const FEATURE_LABELS: Record<Feature, string> = {
  sendMedia: "Send photos & documents",
  sendVoice: "Send voice messages",
  downloadAttachments: "Download or open attachments",
  initiateChat: "Start new conversations",
  viewClientPhone: "See client phone numbers",
  forwardMessages: "Forward messages between chats",
  exportData: "Export conversations or contacts",
  createGroups: "Create staff groups",
  placeCalls: "Place voice & video calls",
};

const all = (v: boolean): FeatureMap =>
  Object.fromEntries(FEATURES.map((f) => [f, v])) as FeatureMap;

/** The starting point for each role, before company or per-person overrides. */
export const ROLE_DEFAULTS: Record<Role, FeatureMap> = {
  SUPER_ADMIN: all(true),
  COMPANY_ADMIN: all(true),
  MANAGER: { ...all(true), viewClientPhone: false, exportData: false },
  EMPLOYEE: {
    ...all(true),
    // The two that matter most for client poaching are off by default:
    // an employee neither sees a client's number nor exports anything.
    viewClientPhone: false,
    exportData: false,
  },
  AUDITOR: {
    ...all(false),
    downloadAttachments: true,
    exportData: true,
  },
};

export function resolveFeatures(
  role: Role,
  companyRoleOverrides: Partial<FeatureMap> | undefined,
  userOverrides: Partial<FeatureMap> | undefined,
): FeatureMap {
  const base = ROLE_DEFAULTS[role];
  const merged: FeatureMap = { ...base, ...(companyRoleOverrides ?? {}), ...(userOverrides ?? {}) };

  // Hard ceiling: an override can only ever restrict what the role allows.
  for (const f of FEATURES) {
    if (!base[f]) merged[f] = false;
  }
  return merged;
}

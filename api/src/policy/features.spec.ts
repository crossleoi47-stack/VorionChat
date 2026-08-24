import { Role } from "@prisma/client";
import { FEATURES, FeatureMap, ROLE_DEFAULTS, resolveFeatures } from "./features";

const ALL_ROLES: Role[] = ["SUPER_ADMIN", "COMPANY_ADMIN", "MANAGER", "EMPLOYEE", "AUDITOR"];

describe("resolveFeatures — layering", () => {
  it("returns the role baseline when there are no overrides", () => {
    for (const role of ALL_ROLES) {
      expect(resolveFeatures(role, undefined, undefined)).toEqual(ROLE_DEFAULTS[role]);
    }
  });

  it("lets a company-level override switch a capability off", () => {
    const out = resolveFeatures("EMPLOYEE", { sendMedia: false }, undefined);
    expect(out.sendMedia).toBe(false);
    expect(out.sendVoice).toBe(true); // untouched
  });

  it("lets a per-user override beat the company override", () => {
    const out = resolveFeatures("EMPLOYEE", { sendMedia: true }, { sendMedia: false });
    expect(out.sendMedia).toBe(false);
  });
});

/**
 * The security-critical invariant. An admin editing switches must never be
 * able to hand someone a capability their role doesn't carry — overrides may
 * only ever subtract. If this suite fails, privilege escalation is possible
 * through the Controls screen.
 */
describe("resolveFeatures — overrides can only subtract, never add", () => {
  it.each(ALL_ROLES)("%s: a user override cannot grant what the role denies", (role) => {
    const baseline = ROLE_DEFAULTS[role];
    const tryToGrantEverything = Object.fromEntries(
      FEATURES.map((f) => [f, true]),
    ) as Partial<FeatureMap>;

    const out = resolveFeatures(role, undefined, tryToGrantEverything);

    for (const f of FEATURES) {
      if (!baseline[f]) {
        expect({ feature: f, granted: out[f] }).toEqual({ feature: f, granted: false });
      }
    }
  });

  it.each(ALL_ROLES)("%s: a company override cannot grant what the role denies", (role) => {
    const baseline = ROLE_DEFAULTS[role];
    const tryToGrantEverything = Object.fromEntries(
      FEATURES.map((f) => [f, true]),
    ) as Partial<FeatureMap>;

    const out = resolveFeatures(role, tryToGrantEverything, undefined);

    for (const f of FEATURES) {
      if (!baseline[f]) expect(out[f]).toBe(false);
    }
  });

  it("never returns a capability set broader than the role baseline", () => {
    for (const role of ALL_ROLES) {
      const out = resolveFeatures(
        role,
        Object.fromEntries(FEATURES.map((f) => [f, true])) as Partial<FeatureMap>,
        Object.fromEntries(FEATURES.map((f) => [f, true])) as Partial<FeatureMap>,
      );
      const grantedBeyondRole = FEATURES.filter((f) => out[f] && !ROLE_DEFAULTS[role][f]);
      expect(grantedBeyondRole).toEqual([]);
    }
  });
});

describe("role baselines encode the anti-poaching defaults", () => {
  it("employees cannot see client phone numbers or export by default", () => {
    expect(ROLE_DEFAULTS.EMPLOYEE.viewClientPhone).toBe(false);
    expect(ROLE_DEFAULTS.EMPLOYEE.exportData).toBe(false);
  });

  it("managers cannot see client phone numbers by default either", () => {
    expect(ROLE_DEFAULTS.MANAGER.viewClientPhone).toBe(false);
  });

  it("auditors cannot send anything", () => {
    expect(ROLE_DEFAULTS.AUDITOR.sendMedia).toBe(false);
    expect(ROLE_DEFAULTS.AUDITOR.sendVoice).toBe(false);
    expect(ROLE_DEFAULTS.AUDITOR.placeCalls).toBe(false);
  });
});

import { Role } from "@prisma/client";
import { can } from "./policy";

describe("RBAC policy — cross-role authorization matrix", () => {
  it("only admins can read client.phone", () => {
    expect(can("SUPER_ADMIN", "client.phone", "read")).toBe(true);
    expect(can("COMPANY_ADMIN", "client.phone", "read")).toBe(true);
    expect(can("MANAGER", "client.phone", "read")).toBe(false);
    expect(can("EMPLOYEE", "client.phone", "read")).toBe(false);
    expect(can("AUDITOR", "client.phone", "read")).toBe(false);
  });

  it("only admins can disable a user", () => {
    const nonAdmins: Role[] = ["MANAGER", "EMPLOYEE", "AUDITOR"];
    for (const role of nonAdmins) {
      expect(can(role, "user", "disable")).toBe(false);
    }
    expect(can("COMPANY_ADMIN", "user", "disable")).toBe(true);
  });

  it("auditor is read-only everywhere it has any access at all", () => {
    const resources = ["client", "user", "assignment", "department", "group", "conversation", "audit_log"] as const;
    for (const resource of resources) {
      expect(can("AUDITOR", resource, "create")).toBe(false);
      expect(can("AUDITOR", resource, "update")).toBe(false);
      expect(can("AUDITOR", resource, "disable")).toBe(false);
      expect(can("AUDITOR", resource, "reassign")).toBe(false);
    }
    expect(can("AUDITOR", "audit_log", "read")).toBe(true);
  });

  it("employee cannot reassign clients or manage users", () => {
    expect(can("EMPLOYEE", "assignment", "reassign")).toBe(false);
    expect(can("EMPLOYEE", "user", "create")).toBe(false);
    expect(can("EMPLOYEE", "user", "disable")).toBe(false);
  });

  it("unknown resource/action combinations default to denied, not throw", () => {
    expect(can("EMPLOYEE", "whatsapp_account", "read")).toBe(false);
  });
});

import { Role } from "@prisma/client";
import { projectClient, projectClientList } from "./clients.projector";

const baseClient = {
  id: "client-1",
  companyId: "company-1",
  displayCode: "CL-12345",
  name: "John Smith",
  org: "John Trading",
  phoneE164: "+971500000001",
  email: "john@example.com",
  createdById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as const;

/**
 * The single highest-value test suite in this codebase (blueprint §24):
 * every role must be checked against whether phoneE164/email leave the
 * projector. A regression here is exactly the class of bug — an endpoint
 * silently serializing a raw entity — the whole architecture exists to
 * prevent.
 */
describe("projectClient — phone/email visibility by role", () => {
  const rolesThatSeePhone: Role[] = ["SUPER_ADMIN", "COMPANY_ADMIN"];
  const rolesThatNeverSeePhone: Role[] = ["MANAGER", "EMPLOYEE", "AUDITOR"];

  it.each(rolesThatSeePhone)("%s sees phoneE164 and email", (role) => {
    const dto = projectClient(baseClient as any, role);
    expect(dto.phoneE164).toBe(baseClient.phoneE164);
    expect(dto.email).toBe(baseClient.email);
  });

  it.each(rolesThatNeverSeePhone)("%s never receives phoneE164 or email", (role) => {
    const dto = projectClient(baseClient as any, role);
    expect(dto.phoneE164).toBeUndefined();
    expect(dto.email).toBeUndefined();
    expect(JSON.stringify(dto)).not.toContain(baseClient.phoneE164);
  });

  it("always includes the non-sensitive identity fields, for every role", () => {
    const allRoles: Role[] = ["SUPER_ADMIN", "COMPANY_ADMIN", "MANAGER", "EMPLOYEE", "AUDITOR"];
    for (const role of allRoles) {
      const dto = projectClient(baseClient as any, role);
      expect(dto).toMatchObject({
        id: baseClient.id,
        displayCode: baseClient.displayCode,
        name: baseClient.name,
        org: baseClient.org,
      });
    }
  });
});

describe("projectClientList — list responses never carry phone/email at all", () => {
  it("strips phoneE164/email even for a role that can read them on the detail endpoint", () => {
    const rows = projectClientList([baseClient as any], "COMPANY_ADMIN");
    expect(rows[0]).not.toHaveProperty("phoneE164");
    expect(rows[0]).not.toHaveProperty("email");
    expect(JSON.stringify(rows)).not.toContain(baseClient.phoneE164);
  });
});

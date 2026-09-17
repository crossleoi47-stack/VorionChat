import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.upsert({
    where: { code: "ABC" },
    update: {},
    create: { code: "ABC", name: "ABC Trading LLC" },
  });

  const sales = await prisma.department.upsert({
    where: { companyId_code: { companyId: company.id, code: "DEP-001" } },
    update: { name: "Sales", description: "Sales team", status: "ACTIVE" },
    create: {
      companyId: company.id,
      code: "DEP-001",
      name: "Sales",
      description: "Sales team",
      status: "ACTIVE",
    },
  });

  const adminPassword = "ChangeMe123!";
  const admin = await prisma.user.upsert({
    where: { companyId_employeeCode: { companyId: company.id, employeeCode: "ADMIN-1" } },
    update: {},
    create: {
      companyId: company.id,
      employeeCode: "ADMIN-1",
      email: "admin@abctrading.example",
      fullName: "Fatima Al Admin",
      role: "COMPANY_ADMIN",
      passwordHash: await argon2.hash(adminPassword),
      mustResetPassword: false,
    },
  });

  const employeePassword = "ChangeMe123!";
  const employee = await prisma.user.upsert({
    where: { companyId_employeeCode: { companyId: company.id, employeeCode: "EMP-1024" } },
    update: {},
    create: {
      companyId: company.id,
      employeeCode: "EMP-1024",
      email: "ahmed@abctrading.example",
      fullName: "Ahmed Hassan",
      role: "EMPLOYEE",
      departmentId: sales.id,
      passwordHash: await argon2.hash(employeePassword),
      mustResetPassword: false,
    },
  });

  const client = await prisma.client.upsert({
    where: { companyId_displayCode: { companyId: company.id, displayCode: "CL-12345" } },
    update: {},
    create: {
      companyId: company.id,
      displayCode: "CL-12345",
      name: "John Smith",
      org: "John Trading",
      phoneE164: "+971500000001",
      email: "john@example.com",
      createdById: admin.id,
    },
  });

  const existingAssignment = await prisma.clientAssignment.findFirst({
    where: { clientId: client.id, unassignedAt: null },
  });
  if (!existingAssignment) {
    await prisma.clientAssignment.create({
      data: { clientId: client.id, userId: employee.id, assignedById: admin.id },
    });
  }

  await prisma.whatsappAccount.upsert({
    where: { phoneNumberId: "mock-phone-number-id" },
    update: {},
    create: {
      companyId: company.id,
      wabaId: "mock-waba-id",
      phoneNumberId: "mock-phone-number-id",
      displayNumber: "+971500000000",
      accessTokenRef: "WHATSAPP_TOKEN__mock-phone-number-id",
    },
  });

  // eslint-disable-next-line no-console
  console.log("Seeded demo data.");
  // eslint-disable-next-line no-console
  console.log(`  Company code: ABC`);
  // eslint-disable-next-line no-console
  console.log(`  Admin login:    admin@abctrading.example / ${adminPassword}`);
  // eslint-disable-next-line no-console
  console.log(`  Employee login: ahmed@abctrading.example / ${employeePassword}`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../src/generated/prisma/client";
import { DEFAULT_AGREEMENT_TERMS } from "../src/lib/defaults";
import { MODULES, STAFF_PERMISSIONS, permissionLabel } from "../src/lib/permissions";

// .env is gitignored; on a host that injects env vars directly (CI, Vercel), there's
// nothing to load here, so a missing file is not an error.
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // ignore
}

const url = new URL(process.env.DATABASE_URL!);
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    database: url.pathname.replace(/^\//, ""),
    timezone: "Z",
  }),
});

const DEFAULT_SETTINGS: Array<{
  key: string;
  value: string;
  group: string;
  valueType: string;
  label: string;
}> = [
  { key: "company.name", value: "Anish Car Rent", group: "company", valueType: "string", label: "Business name" },
  { key: "company.phone", value: "", group: "company", valueType: "string", label: "Phone" },
  { key: "company.email", value: "", group: "company", valueType: "string", label: "Email" },
  { key: "company.address", value: "", group: "company", valueType: "text", label: "Address" },
  { key: "company.gstin", value: "", group: "company", valueType: "string", label: "GSTIN" },
  { key: "billing.currency", value: "INR", group: "billing", valueType: "string", label: "Currency" },
  { key: "billing.taxPercent", value: "0", group: "billing", valueType: "number", label: "Default tax %" },
  { key: "billing.lateFeePerHour", value: "200", group: "billing", valueType: "number", label: "Late return fee per hour" },
  { key: "billing.lateGraceMinutes", value: "60", group: "billing", valueType: "number", label: "Late return grace period (minutes)" },
  { key: "billing.invoiceTerms", value: "Payment due on return of the vehicle.", group: "billing", valueType: "text", label: "Invoice terms" },
  { key: "billing.agreementTerms", value: DEFAULT_AGREEMENT_TERMS, group: "billing", valueType: "text", label: "Rental agreement terms" },
  { key: "reminders.insuranceDays", value: "30", group: "reminders", valueType: "number", label: "Insurance reminder (days before)" },
  { key: "reminders.pucDays", value: "15", group: "reminders", valueType: "number", label: "PUC reminder (days before)" },
  { key: "reminders.fitnessDays", value: "30", group: "reminders", valueType: "number", label: "Fitness reminder (days before)" },
  { key: "reminders.licenceDays", value: "30", group: "reminders", valueType: "number", label: "Licence reminder (days before)" },
  { key: "reminders.serviceKm", value: "500", group: "reminders", valueType: "number", label: "Service reminder (km before due)" },
  { key: "reminders.serviceDays", value: "7", group: "reminders", valueType: "number", label: "Service reminder (days before due date)" },
  { key: "reminders.bookingDays", value: "1", group: "reminders", valueType: "number", label: "Pickup reminder (days before)" },
];

const EXPENSE_CATEGORIES = [
  "Fuel",
  "Service",
  "Repair",
  "Tyre",
  "Battery",
  "Insurance",
  "PUC",
  "Challan",
  "EMI",
  "Cleaning",
  "Parking & Toll",
  "Salary",
  "Other",
];

async function main() {
  console.log("Seeding permissions…");
  for (const mod of MODULES) {
    for (const action of mod.actions) {
      const key = `${mod.key}.${action}`;
      await prisma.permission.upsert({
        where: { key },
        create: { key, module: mod.key, action, label: permissionLabel(mod.key, action) },
        update: { module: mod.key, action, label: permissionLabel(mod.key, action) },
      });
    }
  }

  const allPermissions = await prisma.permission.findMany({ select: { id: true, key: true } });
  const idByKey = new Map(allPermissions.map((p) => [p.key, p.id]));

  console.log("Seeding roles…");
  const adminRole = await prisma.role.upsert({
    where: { name: "admin" },
    create: {
      name: "admin",
      label: "Admin",
      description: "Full access to every module, including settings and users.",
      isSystem: true,
    },
    update: { isSystem: true },
  });

  const staffRole = await prisma.role.upsert({
    where: { name: "staff" },
    create: {
      name: "staff",
      label: "Staff",
      description: "Day-to-day operations: customers, bookings, returns and payments.",
      isSystem: true,
    },
    update: { isSystem: true },
  });

  // Admin always holds every permission, including ones added later.
  await prisma.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: adminRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  const staffPermissionIds = STAFF_PERMISSIONS.map((key) => idByKey.get(key)).filter(
    (id): id is number => id != null,
  );
  await prisma.rolePermission.createMany({
    data: staffPermissionIds.map((permissionId) => ({ roleId: staffRole.id, permissionId })),
    skipDuplicates: true,
  });

  console.log("Seeding admin user…");
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@anishcarrent.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "Admin@12345";
  await prisma.user.upsert({
    where: { email },
    create: {
      staffCode: "STF-00001",
      name: "Administrator",
      email,
      passwordHash: await bcrypt.hash(password, 12),
      roleId: adminRole.id,
      status: "ACTIVE",
      joiningDate: new Date(),
    },
    update: { roleId: adminRole.id, status: "ACTIVE" },
  });

  console.log("Seeding expense categories…");
  for (const name of EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({
      where: { name },
      create: { name, isSystem: true },
      update: {},
    });
  }

  console.log("Seeding settings…");
  for (const setting of DEFAULT_SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      create: setting,
      update: { group: setting.group, valueType: setting.valueType, label: setting.label },
    });
  }

  // Staff codes continue from the seeded administrator.
  await prisma.numberSequence.upsert({
    where: { prefix_year: { prefix: "STF", year: 0 } },
    create: { prefix: "STF", year: 0, lastNumber: 1 },
    update: {},
  });

  console.log(`\nDone. Sign in with ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

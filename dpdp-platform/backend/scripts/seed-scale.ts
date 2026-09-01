/**
 * Check 36 dataset generator.
 *
 * This script is intentionally separate from the demo seed.  It creates a
 * tenant named `DPDP Performance Scale Org` with exactly 12,000 principals
 * and exactly 40,000 consent records.  Rows are deterministic and inserted
 * in bounded batches, so an interrupted run can be safely resumed.
 *
 * Run from `backend/` with:
 *   npx ts-node --project prisma/tsconfig.seed.json scripts/seed-scale.ts
 */
import * as argon2 from "argon2";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PERMISSIONS } from "../prisma/seed/permissions";

export const SCALE_ORG_NAME = "DPDP Performance Scale Org";
export const SCALE_OPERATOR_EMAIL = "scale-operator@performance.demo";
export const SCALE_APPROVER_EMAIL = "scale-approver@performance.demo";
export const SCALE_EMPLOYEE_PASSWORD = "ScalePerformance123!";
export const SCALE_PRINCIPAL_COUNT = 12_000;
export const SCALE_CONSENT_COUNT = 40_000;
export const SCALE_PURPOSE_CODES = [
  "SCALE_PURPOSE_1",
  "SCALE_PURPOSE_2",
  "SCALE_PURPOSE_3",
  "SCALE_PURPOSE_4",
] as const;

const BATCH_SIZE = 1_000;
const SCALE_ROLE_CODE = "SCALE_PERFORMANCE";
const PERFORMANCE_PERMISSION_CODES = [
  "CAN_SEND_MESSAGES",
  "CAN_SEND_BREACH_NOTICES",
  "CAN_MANAGE_REQUESTS",
  "CAN_VIEW_ALL_PERSONAL_DATA",
] as const;

export interface ScaleSeedResult {
  organizationId: string;
  principals: number;
  consentRecords: number;
  principalDataFields: number;
}

async function insertBatches<T>(
  values: readonly T[],
  insert: (batch: T[]) => Promise<void>,
): Promise<void> {
  for (let offset = 0; offset < values.length; offset += BATCH_SIZE) {
    await insert(values.slice(offset, offset + BATCH_SIZE));
  }
}

async function getOrCreateOrganization(prisma: PrismaService): Promise<string> {
  const rows = await prisma.organization.findMany({
    where: { name: SCALE_ORG_NAME },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length > 1) {
    throw new Error(
      `seed-scale: found ${rows.length} organizations named "${SCALE_ORG_NAME}".`,
    );
  }
  if (rows[0]) return rows[0].id;
  const organization = await prisma.organization.create({
    data: {
      name: SCALE_ORG_NAME,
      legalName: "DPDP Performance Scale Limited",
      country: "IN",
      timezone: "Asia/Kolkata",
      dpoName: "Scale Test DPO",
      dpoEmail: "dpo@performance.demo",
      grievanceContactEmail: "grievance@performance.demo",
      publicPrivacyPageUrl: "https://performance.demo/privacy",
    },
    select: { id: true },
  });
  return organization.id;
}

async function seedPurposeIds(
  prisma: PrismaService,
  organizationId: string,
): Promise<string[]> {
  const ids: string[] = [];
  for (const [index, code] of SCALE_PURPOSE_CODES.entries()) {
    const purpose = await prisma.processingPurpose.upsert({
      where: { organizationId_code: { organizationId, code } },
      create: {
        organizationId,
        code,
        name: `Scale purpose ${index + 1}`,
        description:
          "Synthetic purpose used by the Check 36 performance dataset.",
        lawfulBasis: "CONSENT",
        basisJustification:
          "Synthetic performance fixture; not a legal conclusion.",
        dataCategories: ["CONTACT"],
        goodsOrServicesDescription: "Performance test service",
        active: true,
      },
      update: {},
      select: { id: true },
    });
    ids.push(purpose.id);
  }
  return ids;
}

async function seedPrincipals(
  prisma: PrismaService,
  organizationId: string,
): Promise<Array<{ id: string; index: number }>> {
  const existingCount = await prisma.dataPrincipal.count({
    where: { organizationId },
  });
  if (existingCount > SCALE_PRINCIPAL_COUNT) {
    throw new Error(
      `seed-scale: organization already has ${existingCount} principals (expected no more than ${SCALE_PRINCIPAL_COUNT}).`,
    );
  }
  const references = Array.from(
    { length: SCALE_PRINCIPAL_COUNT },
    (_, index) => `SCALE-DP-${String(index + 1).padStart(6, "0")}`,
  );
  const present = await prisma.dataPrincipal.findMany({
    where: { organizationId, reference: { in: references } },
    select: { id: true, reference: true },
  });
  const presentByReference = new Map(
    present.map((row) => [row.reference, row.id]),
  );
  const missing = references.flatMap((reference, index) =>
    presentByReference.has(reference)
      ? []
      : [
          {
            organizationId,
            reference,
            displayName: `Scale Principal ${String(index + 1).padStart(6, "0")}`,
            ageStatus: "ADULT" as const,
          },
        ],
  );
  await insertBatches(missing, async (batch) => {
    await prisma.dataPrincipal.createMany({ data: batch });
  });

  const all = await prisma.dataPrincipal.findMany({
    where: { organizationId, reference: { in: references } },
    select: { id: true, reference: true },
    orderBy: { reference: "asc" },
  });
  if (all.length !== SCALE_PRINCIPAL_COUNT) {
    throw new Error(
      `seed-scale: expected ${SCALE_PRINCIPAL_COUNT} deterministic principals, found ${all.length}.`,
    );
  }
  return all.map((row, index) => ({ id: row.id, index }));
}

async function seedEmailAndCampaignFields(
  prisma: PrismaService,
  organizationId: string,
  principals: readonly { id: string; index: number }[],
): Promise<number> {
  const principalIds = principals.map((principal) => principal.id);
  const existing = await prisma.principalDataField.findMany({
    where: {
      organizationId,
      dataPrincipalId: { in: principalIds },
      canonicalField: "EMAIL",
    },
    select: { dataPrincipalId: true },
  });
  const existingIds = new Set(existing.map((field) => field.dataPrincipalId));
  const missing = principals.flatMap((principal) =>
    existingIds.has(principal.id)
      ? []
      : [
          {
            organizationId,
            dataPrincipalId: principal.id,
            canonicalField: "EMAIL" as const,
            value: `scale-${String(principal.index + 1).padStart(6, "0")}@performance.demo`,
            dataCategory: "CONTACT" as const,
            sourceIds: [],
            isPrimary: true,
          },
        ],
  );
  await insertBatches(missing, async (batch) => {
    await prisma.principalDataField.createMany({ data: batch });
  });

  // A deterministic CITY marker gives the performance test an exact 2,000
  // recipient audience without making its test depend on row ordering.
  const cityExisting = await prisma.principalDataField.findMany({
    where: {
      organizationId,
      dataPrincipalId: { in: principals.slice(0, 2_000).map((p) => p.id) },
      canonicalField: "CITY",
    },
    select: { dataPrincipalId: true },
  });
  const cityIds = new Set(cityExisting.map((field) => field.dataPrincipalId));
  const cityMissing = principals.slice(0, 2_000).flatMap((principal) =>
    cityIds.has(principal.id)
      ? []
      : [
          {
            organizationId,
            dataPrincipalId: principal.id,
            canonicalField: "CITY" as const,
            value: "PERFORMANCE_CAMPAIGN_2000",
            dataCategory: "CONTACT" as const,
            sourceIds: [],
            isPrimary: true,
          },
        ],
  );
  await insertBatches(cityMissing, async (batch) => {
    await prisma.principalDataField.createMany({ data: batch });
  });
  return await prisma.principalDataField.count({ where: { organizationId } });
}

async function seedConsents(
  prisma: PrismaService,
  organizationId: string,
  principals: readonly { id: string; index: number }[],
  purposeIds: readonly string[],
): Promise<number> {
  const desired = principals.flatMap((principal) => {
    // Every principal receives the first three rows; the first 4,000 also
    // receive the fourth row: 12,000*3 + 4,000 = exactly 40,000.
    const count = principal.index < 4_000 ? 4 : 3;
    return purposeIds.slice(0, count).map((purposeId) => ({
      organizationId,
      dataPrincipalId: principal.id,
      purposeId,
      status: "GRANTED" as const,
      grantedAt: new Date("2025-01-01T00:00:00.000Z"),
      channel: "IMPORTED" as const,
    }));
  });
  const existing = await prisma.consentRecord.findMany({
    where: { organizationId },
    select: { dataPrincipalId: true, purposeId: true },
  });
  const existingKeys = new Set(
    existing.map((row) => `${row.dataPrincipalId}:${row.purposeId}`),
  );
  const missing = desired.filter(
    (row) => !existingKeys.has(`${row.dataPrincipalId}:${row.purposeId}`),
  );
  await insertBatches(missing, async (batch) => {
    await prisma.consentRecord.createMany({ data: batch });
  });
  const count = await prisma.consentRecord.count({ where: { organizationId } });
  if (count !== SCALE_CONSENT_COUNT) {
    throw new Error(
      `seed-scale: expected ${SCALE_CONSENT_COUNT} consent records, found ${count}.`,
    );
  }
  return count;
}

async function seedPerformanceEmployees(
  prisma: PrismaService,
  organizationId: string,
): Promise<void> {
  for (const code of PERFORMANCE_PERMISSION_CODES) {
    const permission = PERMISSIONS.find((entry) => entry.code === code);
    if (!permission)
      throw new Error(
        `seed-scale: permission ${code} is not in the seed catalogue.`,
      );
    await prisma.permission.upsert({
      where: { code },
      create: permission,
      update: {},
    });
  }
  const role = await prisma.role.upsert({
    where: { organizationId_code: { organizationId, code: SCALE_ROLE_CODE } },
    create: {
      organizationId,
      code: SCALE_ROLE_CODE,
      name: "Scale performance operator",
      isSystem: false,
      permissions: {
        create: PERFORMANCE_PERMISSION_CODES.map((permissionCode) => ({
          permissionCode,
        })),
      },
    },
    update: { name: "Scale performance operator" },
    select: { id: true },
  });
  for (const permissionCode of PERFORMANCE_PERMISSION_CODES) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionCode: { roleId: role.id, permissionCode } },
      create: { roleId: role.id, permissionCode },
      update: {},
    });
  }
  const passwordHash = await argon2.hash(SCALE_EMPLOYEE_PASSWORD, {
    type: argon2.argon2id,
  });
  for (const [email, fullName] of [
    [SCALE_OPERATOR_EMAIL, "Scale performance operator"],
    [SCALE_APPROVER_EMAIL, "Scale performance approver"],
  ] as const) {
    await prisma.employee.upsert({
      where: { organizationId_email: { organizationId, email } },
      create: {
        organizationId,
        email,
        fullName,
        roleId: role.id,
        passwordHash,
        status: "ACTIVE",
      },
      // Keep the credential stable across runs; re-hashing is unnecessary
      // and would make an idempotent seed mutate existing rows.
      update: { roleId: role.id, fullName, status: "ACTIVE" },
    });
  }
}

export async function seedScale(
  prisma: PrismaService,
): Promise<ScaleSeedResult> {
  const organizationId = await getOrCreateOrganization(prisma);
  const purposeIds = await seedPurposeIds(prisma, organizationId);
  const principals = await seedPrincipals(prisma, organizationId);
  const principalDataFields = await seedEmailAndCampaignFields(
    prisma,
    organizationId,
    principals,
  );
  const consentRecords = await seedConsents(
    prisma,
    organizationId,
    principals,
    purposeIds,
  );
  await seedPerformanceEmployees(prisma, organizationId);
  return {
    organizationId,
    principals: principals.length,
    consentRecords,
    principalDataFields,
  };
}

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const result = await seedScale(prisma);
    // eslint-disable-next-line no-console
    console.log(`Scale seed complete: ${JSON.stringify(result)}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  });
}

/**
 * Idempotent, human-readable fixtures used by the §7 acceptance demo.
 *
 * This is deliberately a separate seed from `prisma/seed.ts`: the child
 * principals are produced by the MVP 1 sync, so a guardian cannot be
 * attached until that sync has run.  The integrator may call this function
 * after the sync (the preferred order), or call it from the regular seed
 * first and call it again afterwards.  Existing rows are never replaced.
 */
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { DEMO_ORG } from "./demo-org";

export const DEMO_NOTICE_CODES = [
  "ACCOUNT_SIGNUP",
  "MARKETING_OPTIN",
  "LEGACY_CONSENT",
] as const;

export const DEMO_GUARDIAN_NAME = "Priya Sharma (demo guardian)";
export const DEMO_RETENTION_POLICY_NAME = "Demo short inactivity review";

export interface Mvp2DemoSeedResult {
  organizationId: string;
  noticesCreated: number;
  noticeVersionsCreated: number;
  guardianCreated: boolean;
  retentionPolicyCreated: boolean;
  /** Prerequisites absent at invocation time (normally because sync has not run yet). */
  deferred: readonly ("child" | "purpose")[];
}

function contentHash(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

async function resolveOrganizationId(
  prisma: PrismaService,
  organizationId?: string,
): Promise<string> {
  if (organizationId) {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!organization) {
      throw new Error(
        `mvp2-demo seed: organization "${organizationId}" not found.`,
      );
    }
    return organization.id;
  }

  const organizations = await prisma.organization.findMany({
    where: { name: DEMO_ORG.name },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (organizations.length === 0) {
    throw new Error(
      `mvp2-demo seed: demo organization "${DEMO_ORG.name}" not found. ` +
        'Run "npm run seed" first.',
    );
  }
  if (organizations.length > 1) {
    throw new Error(
      `mvp2-demo seed: found ${organizations.length} organizations named ` +
        `"${DEMO_ORG.name}"; pass the exact organization id rather than guessing.`,
    );
  }
  return organizations[0]!.id;
}

async function seedNotices(
  prisma: PrismaService,
  organizationId: string,
  purposeIds: readonly string[],
  employeeId: string,
): Promise<{ created: number; versionsCreated: number }> {
  // Include the source mappings that are actually attached to one of the
  // selected purposes.  An empty list is intentional when this is called
  // before the source mapping workflow: the rows remain DRAFT until a DPO
  // completes the required Rule 3(b)/3(c) fields in the notice builder.
  const links = purposeIds.length
    ? await prisma.dataSourcePurpose.findMany({
        where: { purposeId: { in: [...purposeIds] } },
        select: { dataSourceId: true },
      })
    : [];
  const sourceIds = [...new Set(links.map((link) => link.dataSourceId))];
  const mappings = sourceIds.length
    ? await prisma.sourceFieldMapping.findMany({
        where: { dataSourceId: { in: sourceIds }, containsPersonalData: true },
        select: { id: true, canonicalField: true, dataCategory: true },
        orderBy: [{ dataSourceId: "asc" }, { sourceField: "asc" }],
        take: 25,
      })
    : [];
  const purposeRows = purposeIds.length
    ? await prisma.processingPurpose.findMany({
        where: { id: { in: [...purposeIds] } },
        select: {
          id: true,
          name: true,
          goodsOrServicesDescription: true,
          description: true,
        },
        orderBy: { code: "asc" },
      })
    : [];

  const itemisedDataFields = mappings.map((mapping) => ({
    sourceFieldMappingId: mapping.id,
    canonicalField: mapping.canonicalField,
    dataCategory: mapping.dataCategory,
    label: mapping.canonicalField.replaceAll("_", " "),
  }));
  const purposeStatements = purposeRows.map((purpose) => ({
    purposeId: purpose.id,
    purposeName: purpose.name,
    goodsOrServices:
      purpose.goodsOrServicesDescription ??
      purpose.description ??
      "Services provided by the company",
  }));

  let created = 0;
  let versionsCreated = 0;
  for (const code of DEMO_NOTICE_CODES) {
    const existing = await prisma.privacyNotice.findUnique({
      where: { organizationId_code: { organizationId, code } },
      select: { id: true, name: true, purposeIds: true },
    });
    const notice = existing
      ? existing
      : await prisma.privacyNotice.create({
          data: {
            organizationId,
            code,
            name:
              code === "ACCOUNT_SIGNUP"
                ? "Account and service privacy notice"
                : code === "MARKETING_OPTIN"
                  ? "Marketing opt-in privacy notice"
                  : "Legacy consent privacy notice",
            purposeIds: [...purposeIds],
            status: "DRAFT",
          },
          select: { id: true, name: true, purposeIds: true },
        });
    if (!existing) created += 1;

    // A pre-sync invocation creates only the shell.  Once purposes exist,
    // complete that shell on the next invocation; a non-empty list is
    // treated as administrator-owned and is never overwritten.
    if (existing && existing.purposeIds.length === 0 && purposeIds.length > 0) {
      await prisma.privacyNotice.update({
        where: { id: notice.id },
        data: { purposeIds: [...purposeIds] },
      });
    }

    // There is no useful Rule 3(b) version before a purpose/mapping exists.
    // Leave the shell as a DRAFT and let the post-sync invocation create it.
    if (purposeIds.length === 0) continue;

    const version = await prisma.noticeVersion.findUnique({
      where: { noticeId_version: { noticeId: notice.id, version: 1 } },
      select: { id: true },
    });
    if (version) continue;

    const body = [
      `# ${notice.name}`,
      "",
      "This demo notice explains how the company uses personal data to provide its services.",
      "You can withdraw consent, exercise your rights, or complain to the Data Protection Board using the links below.",
    ].join("\n");
    await prisma.noticeVersion.create({
      data: {
        organizationId,
        noticeId: notice.id,
        version: 1,
        itemisedDataFields: itemisedDataFields as Prisma.InputJsonValue,
        purposeStatements: purposeStatements as Prisma.InputJsonValue,
        withdrawalUrl: "https://acmeretail.demo/privacy/withdraw",
        rightsUrl: "https://acmeretail.demo/privacy/rights",
        boardComplaintUrl: "https://acmeretail.demo/privacy/board-complaint",
        bodyMarkdown: body,
        contentHash: contentHash(body),
        createdByEmployeeId: employeeId,
      },
    });
    versionsCreated += 1;
  }
  return { created, versionsCreated };
}

/**
 * Applies the §7 demo fixtures for Acme Retail.  It is safe to call more
 * than once and safe to call before the post-sync child/purpose prerequisites
 * exist; the return value tells the caller which parts were deferred.
 */
export async function seedMvp2Demo(
  prisma: PrismaService,
  organizationId?: string,
): Promise<Mvp2DemoSeedResult> {
  const resolvedOrganizationId = await resolveOrganizationId(
    prisma,
    organizationId,
  );
  const employee = await prisma.employee.findFirst({
    where: { organizationId: resolvedOrganizationId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!employee) {
    throw new Error(
      `mvp2-demo seed: organization "${resolvedOrganizationId}" has no active employee ` +
        "to own seeded notice versions.",
    );
  }

  const purposes = await prisma.processingPurpose.findMany({
    where: { organizationId: resolvedOrganizationId, active: true },
    orderBy: { code: "asc" },
    select: { id: true },
  });
  const child = await prisma.dataPrincipal.findFirst({
    where: {
      organizationId: resolvedOrganizationId,
      // The demo guardian is specifically for an under-18 principal. A
      // GUARDIAN_REPRESENTED row is a separate person-with-disability case
      // and must use LAWFUL_GUARDIAN_OF_PWD plus Rule 11 evidence.
      ageStatus: "CHILD",
    },
    orderBy: { reference: "asc" },
    select: { id: true },
  });

  const notices = await seedNotices(
    prisma,
    resolvedOrganizationId,
    purposes.map((purpose) => purpose.id),
    employee.id,
  );

  let guardianCreated = false;
  if (child) {
    const existing = await prisma.guardianRelationship.findFirst({
      where: {
        organizationId: resolvedOrganizationId,
        dataPrincipalId: child.id,
        kind: "PARENT_OF_CHILD",
        guardianName: DEMO_GUARDIAN_NAME,
      },
      select: { id: true },
    });
    if (!existing) {
      await prisma.guardianRelationship.create({
        data: {
          organizationId: resolvedOrganizationId,
          dataPrincipalId: child.id,
          kind: "PARENT_OF_CHILD",
          guardianName: DEMO_GUARDIAN_NAME,
          guardianEmail: "guardian@acmeretail.demo",
          guardianPhone: "+919900000001",
          verification: "NONE",
          active: true,
        },
      });
      guardianCreated = true;
    }
  }

  let retentionPolicyCreated = false;
  if (purposes[0]) {
    const existing = await prisma.retentionPolicy.findUnique({
      where: {
        organizationId_purposeId_name: {
          organizationId: resolvedOrganizationId,
          purposeId: purposes[0].id,
          name: DEMO_RETENTION_POLICY_NAME,
        },
      },
      select: { id: true },
    });
    if (!existing) {
      await prisma.retentionPolicy.create({
        data: {
          organizationId: resolvedOrganizationId,
          purposeId: purposes[0].id,
          name: DEMO_RETENTION_POLICY_NAME,
          triggerType: "INACTIVITY",
          retentionValue: 1,
          retentionUnit: "DAYS",
          legalBasisForRetention:
            "Internal demo policy; subject to human review",
          legalBasisType: "ORG_POLICY",
          active: true,
        },
      });
      retentionPolicyCreated = true;
    }
  }

  const deferred: ("child" | "purpose")[] = [];
  if (!child) deferred.push("child");
  if (!purposes[0]) deferred.push("purpose");
  return {
    organizationId: resolvedOrganizationId,
    noticesCreated: notices.created,
    noticeVersionsCreated: notices.versionsCreated,
    guardianCreated,
    retentionPolicyCreated,
    deferred,
  };
}

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const result = await seedMvp2Demo(
      prisma,
      process.env["DEMO_ORGANIZATION_ID"],
    );
    // eslint-disable-next-line no-console
    console.log(`MVP 2 demo seed complete: ${JSON.stringify(result)}`);
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

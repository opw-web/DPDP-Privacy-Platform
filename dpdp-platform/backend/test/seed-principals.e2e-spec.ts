import { randomUUID } from "crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  claimDemoPrincipalAccounts,
  DEMO_PRINCIPALS_TO_CLAIM,
  runSeedPrincipals,
} from "../prisma/seed-principals";
import { DEMO_PASSWORD } from "../prisma/seed/demo-org";

/**
 * Task 29 gate: the account-claiming seed. Talks to the real Postgres
 * database directly through the raw `PrismaService` (no HTTP, no Nest
 * app) -- matching how `prisma/seed.ts`'s own idempotency is proven in
 * `employee-auth.e2e-spec.ts` -- against a throwaway fixture organization
 * built with the SAME identifier values `DEMO_PRINCIPALS_TO_CLAIM` names,
 * so the assertions below exercise the real claiming logic without
 * depending on the real "Acme Retail Pvt Ltd" organization or a full
 * four-source sync having already run in this environment.
 */
describe("Account-claiming seed for demo principals (e2e)", () => {
  const prisma = new PrismaService();
  let organizationId: string;
  let personaDataPrincipalIds: string[];
  let unrelatedDataPrincipalId: string;

  beforeAll(async () => {
    await prisma.$connect();

    organizationId = randomUUID();
    await prisma.organization.create({
      data: { id: organizationId, name: `Test Org ${organizationId}` },
    });

    // One DataPrincipal + PrincipalIdentifier per named persona, using
    // the EXACT identifier values `DEMO_PRINCIPALS_TO_CLAIM` looks up --
    // proving the script finds them by identifier, not by name.
    personaDataPrincipalIds = [];
    for (const persona of DEMO_PRINCIPALS_TO_CLAIM) {
      const dataPrincipal = await prisma.dataPrincipal.create({
        data: {
          organizationId,
          reference: `DP-${randomUUID()}`,
          displayName: persona.label,
        },
      });
      personaDataPrincipalIds.push(dataPrincipal.id);
      await prisma.principalIdentifier.create({
        data: {
          organizationId,
          dataPrincipalId: dataPrincipal.id,
          type: persona.identifierType,
          value: persona.identifierValue,
          isPrimary: true,
        },
      });
    }

    // A sixth person in the SAME organization, deliberately not in the
    // claim list (mirrors "Rahul Verma" / "Ishaan Gupta" in the real demo
    // dataset) -- proves the script claims exactly the five named
    // personas, not "everyone in the org".
    const unrelated = await prisma.dataPrincipal.create({
      data: {
        organizationId,
        reference: `DP-${randomUUID()}`,
        displayName: "Ishaan Gupta",
      },
    });
    unrelatedDataPrincipalId = unrelated.id;
    await prisma.principalIdentifier.create({
      data: {
        organizationId,
        dataPrincipalId: unrelated.id,
        type: "EMAIL",
        value: `ishaan-${randomUUID()}@example.com`,
        isPrimary: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.principalAccount.deleteMany({ where: { organizationId } });
    await prisma.dataPrincipal.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("claims an ACTIVE account for exactly the five named personas, looked up by identifier -- and is idempotent on a second run", async () => {
    const firstRun = await claimDemoPrincipalAccounts(prisma, organizationId);

    expect(firstRun).toHaveLength(5);
    expect(firstRun.map((r) => r.label).sort()).toEqual(
      [...DEMO_PRINCIPALS_TO_CLAIM].map((p) => p.label).sort(),
    );
    expect(firstRun.every((r) => r.created)).toBe(true);
    expect(new Set(firstRun.map((r) => r.dataPrincipalId))).toEqual(
      new Set(personaDataPrincipalIds),
    );

    const accountsAfterFirst = await prisma.principalAccount.findMany({
      where: { organizationId },
      orderBy: { dataPrincipalId: "asc" },
    });
    expect(accountsAfterFirst).toHaveLength(5);
    for (const account of accountsAfterFirst) {
      expect(account.status).toBe("ACTIVE");
      expect(account.passwordHash).not.toBeNull();
      expect(await argon2.verify(account.passwordHash!, DEMO_PASSWORD)).toBe(
        true,
      );
    }

    // The sixth, unlisted person never gets an account.
    const unrelatedAccount = await prisma.principalAccount.findUnique({
      where: { dataPrincipalId: unrelatedDataPrincipalId },
    });
    expect(unrelatedAccount).toBeNull();

    // Second run: idempotent -- nothing new created, nothing changed.
    const secondRun = await claimDemoPrincipalAccounts(prisma, organizationId);
    expect(secondRun).toHaveLength(5);
    expect(secondRun.every((r) => r.created)).toBe(false);

    const accountsAfterSecond = await prisma.principalAccount.findMany({
      where: { organizationId },
      orderBy: { dataPrincipalId: "asc" },
    });
    expect(accountsAfterSecond).toHaveLength(5);
    expect(accountsAfterSecond).toEqual(accountsAfterFirst);

    const stillNoUnrelatedAccount = await prisma.principalAccount.findUnique({
      where: { dataPrincipalId: unrelatedDataPrincipalId },
    });
    expect(stillNoUnrelatedAccount).toBeNull();
  });

  it("fails loudly, rather than silently skipping, when a persona's identifier has not been synced yet", async () => {
    const ghostEmail = `ghost-${randomUUID()}@example.com`;
    await expect(
      claimDemoPrincipalAccounts(prisma, organizationId, [
        {
          label: "Ghost Persona",
          identifierType: "EMAIL",
          identifierValue: ghostEmail,
        },
      ]),
    ).rejects.toThrow(/no PrincipalIdentifier found/i);
  });

  it("refuses to run with NODE_ENV=production, checked before any database lookup", async () => {
    const originalNodeEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";
    try {
      await expect(runSeedPrincipals(prisma)).rejects.toThrow(
        /NODE_ENV=production/,
      );
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env["NODE_ENV"];
      } else {
        process.env["NODE_ENV"] = originalNodeEnv;
      }
    }
  });
});

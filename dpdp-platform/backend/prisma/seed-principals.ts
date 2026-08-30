/**
 * Account-claiming seed for the five named demo personas (spec lines
 * 957, 981): Aman Sharma, Neha Rao, Raj Patel, Sara Khan and Vikram Nair
 * each get an `ACTIVE` `PrincipalAccount` with password `Password123!`
 * (`DEMO_PASSWORD`, shared with the demo employee seed).
 *
 * Runs strictly AFTER `prisma/seed.ts` (the Acme organization must
 * already exist) and AFTER the first full sync (each persona's
 * `PrincipalIdentifier` rows -- the only thing this script looks anyone
 * up by -- are written by identity resolution, not by this script).
 *
 * Looks every persona up by an EXACT `PrincipalIdentifier` (organization
 * + type + value), never by `displayName`. Matching a person by name
 * alone is unsound here on purpose: the demo dataset deliberately
 * contains two different real people both named "Rahul Verma" (the
 * anti-merge trap) and capitalisation/format variants of the same name
 * (`personas.ts`), so `DataPrincipal.displayName` is never a safe lookup
 * key anywhere in this codebase, this script included.
 *
 * Idempotent by construction: claiming is keyed on
 * `PrincipalAccount.dataPrincipalId` (`@unique` in schema.prisma), and a
 * persona who already has an account is left completely untouched --
 * no password regenerated, no row updated -- exactly the discipline
 * `seed.ts`'s `seedDemoEmployees` already applies to `Employee`.
 *
 * Refuses to run with `NODE_ENV=production` (checked before anything
 * else, including before the organization lookup): this claims accounts
 * with a fixed, publicly known demo password, which must never touch a
 * production database.
 *
 * Run with `npm run seed:principals` (see package.json).
 */
import * as argon2 from "argon2";
import type { IdentifierType } from "@prisma/client";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { DEMO_ORG, DEMO_PASSWORD } from "./seed/demo-org";

/**
 * Vikram Nair is deliberately the "possible-duplicate pair" persona
 * (spec: same nameKey + pincode, no shared email/phone -- see
 * `demo-company-server/src/seed/personas.ts`): identity resolution
 * cannot and must not auto-merge his sales and e-commerce records, so he
 * exists as TWO separate `DataPrincipal` rows pending review, not one.
 * This script claims the sales-sourced identity (`vikram.n@gmail.com`)
 * specifically -- a deliberate, documented choice of which of the two
 * unmerged records becomes the logged-in demo account, not an
 * assumption that the two are the same principal.
 */
export interface DemoPrincipalToClaim {
  /** Reporting/log label only -- NEVER used to look the persona up. */
  label: string;
  identifierType: IdentifierType;
  identifierValue: string;
}

export const DEMO_PRINCIPALS_TO_CLAIM: readonly DemoPrincipalToClaim[] = [
  {
    label: "Aman Sharma",
    identifierType: "EMAIL",
    identifierValue: "aman.sharma@gmail.com",
  },
  {
    label: "Neha Rao",
    identifierType: "EMAIL",
    identifierValue: "neha.rao@example.com",
  },
  {
    label: "Raj Patel",
    identifierType: "EMAIL",
    identifierValue: "raj.patel@gmail.com",
  },
  {
    label: "Sara Khan",
    identifierType: "EMAIL",
    identifierValue: "sara.khan@example.com",
  },
  {
    label: "Vikram Nair",
    identifierType: "EMAIL",
    identifierValue: "vikram.n@gmail.com",
  },
];

export interface ClaimResult {
  label: string;
  dataPrincipalId: string;
  /** `true` only when THIS run created the account; `false` on an already-claimed persona. */
  created: boolean;
}

/**
 * The claiming core, parameterised on `organizationId` (rather than
 * re-resolving the demo org internally) so it can be exercised against
 * an isolated fixture organization in a test without touching -- or
 * depending on the state of -- the real "Acme Retail Pvt Ltd" org that
 * `seed.ts` and the sync pipeline maintain.
 */
export async function claimDemoPrincipalAccounts(
  prisma: PrismaService,
  organizationId: string,
  personas: readonly DemoPrincipalToClaim[] = DEMO_PRINCIPALS_TO_CLAIM,
): Promise<ClaimResult[]> {
  const results: ClaimResult[] = [];

  for (const persona of personas) {
    const identifier = await prisma.principalIdentifier.findUnique({
      where: {
        organizationId_type_value: {
          organizationId,
          type: persona.identifierType,
          value: persona.identifierValue,
        },
      },
      select: { dataPrincipalId: true },
    });
    if (!identifier) {
      // Fail loudly. A missing identifier means the first sync has not
      // run (or identity resolution produced a different value than
      // expected) -- silently skipping would leave a persona unclaimed
      // with no signal as to why.
      throw new Error(
        `seed-principals.ts: no PrincipalIdentifier found for "${persona.label}" ` +
          `(${persona.identifierType} "${persona.identifierValue}") in organization ` +
          `"${organizationId}". Run the first sync (all four demo sources) before ` +
          "this script.",
      );
    }

    const existing = await prisma.principalAccount.findUnique({
      where: { dataPrincipalId: identifier.dataPrincipalId },
      select: { id: true },
    });
    if (existing) {
      results.push({
        label: persona.label,
        dataPrincipalId: identifier.dataPrincipalId,
        created: false,
      });
      continue;
    }

    const passwordHash = await argon2.hash(DEMO_PASSWORD, {
      type: argon2.argon2id,
    });
    await prisma.principalAccount.create({
      data: {
        organizationId,
        dataPrincipalId: identifier.dataPrincipalId,
        email: persona.identifierValue,
        passwordHash,
        status: "ACTIVE",
      },
    });
    results.push({
      label: persona.label,
      dataPrincipalId: identifier.dataPrincipalId,
      created: true,
    });
  }

  return results;
}

/**
 * Resolves the demo organization and runs the claim. Exported (like
 * `seed.ts`'s `runSeed`) so a caller can invoke it twice in a row and
 * assert the second run creates nothing.
 */
export async function runSeedPrincipals(
  prisma: PrismaService,
): Promise<ClaimResult[]> {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "seed-principals.ts refuses to run with NODE_ENV=production: it claims " +
        "portal accounts with a fixed, publicly known demo password " +
        `("${DEMO_PASSWORD}"), which must never exist on a production database.`,
    );
  }

  const organization = await prisma.organization.findFirst({
    where: { name: DEMO_ORG.name },
    select: { id: true },
  });
  if (!organization) {
    throw new Error(
      `seed-principals.ts: demo organization "${DEMO_ORG.name}" not found. ` +
        'Run "npm run seed" (prisma/seed.ts) first.',
    );
  }

  return claimDemoPrincipalAccounts(prisma, organization.id);
}

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const results = await runSeedPrincipals(prisma);
    for (const result of results) {
      // eslint-disable-next-line no-console
      console.log(
        `${result.label}: ${result.created ? "claimed" : "already claimed"} ` +
          `(dataPrincipalId=${result.dataPrincipalId})`,
      );
    }
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

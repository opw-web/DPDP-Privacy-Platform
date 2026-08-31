import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { MaskingService } from "../src/common/masking/masking.service";
import {
  bootstrapTestApp,
  createOrgWithEmployee,
  cleanupOrgs,
  OrgWithEmployee,
} from "./support/e2e-harness";

/**
 * e2e gate for `POST /api/audiences/preview` -- DPDP_MVP2_COMPLIANCE_OPERATIONS.md
 * §4.7. Talks to the real Postgres database through the full HTTP stack
 * (`bootstrapTestApp`), proving `compileAudience` + `AudienceService`
 * compose correctly against real rows -- not just the pure-function unit
 * suite in `compile-audience.spec.ts`.
 *
 * Uses `test/support/e2e-harness.ts` per the task brief. It only knows
 * the MVP 1 org shape, so every MVP 2 row this file creates
 * (DataPrincipal, PrincipalDataField, ConsentRecord, PrincipalRequest) is
 * deleted in `afterAll`, in FK-safe order, BEFORE `cleanupOrgs` runs.
 */
describe("POST /api/audiences/preview (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const masking = new MaskingService();
  const orgIds: string[] = [];
  const dataPrincipalIds: string[] = [];

  let org: OrgWithEmployee;
  const PURPOSE_ID = `purpose-${randomUUID()}`;

  // Displayed names, chosen so `localeCompare`/`asc` ordering is stable
  // and predictable across the whole suite.
  const NAMES = {
    adultWithEmailGranted: "Aditi Adult",
    adultNoEmailNoConsent: "Bhavna Bare",
    adultDeniedConsent: "Chetan Denied",
    child: "Deepak Child",
    guardianRepresented: "Esha Guarded",
    unknownAgeControl: "Farhan Unrelated",
  };

  beforeAll(async () => {
    const testApp = await bootstrapTestApp();
    app = testApp.app;
    prisma = testApp.prisma;

    org = await createOrgWithEmployee(app, prisma, "AUDIENCE_SENDER", [
      "CAN_SEND_MESSAGES",
    ]);
    orgIds.push(org.organizationId);

    const makePrincipal = async (
      displayName: string,
      ageStatus: "ADULT" | "CHILD" | "GUARDIAN_REPRESENTED" | "UNKNOWN",
    ) => {
      const dp = await prisma.dataPrincipal.create({
        data: {
          organizationId: org.organizationId,
          reference: `DP-${randomUUID()}`,
          displayName,
          ageStatus,
        },
      });
      dataPrincipalIds.push(dp.id);
      return dp;
    };

    const adultWithEmailGranted = await makePrincipal(NAMES.adultWithEmailGranted, "ADULT");
    const adultNoEmailNoConsent = await makePrincipal(NAMES.adultNoEmailNoConsent, "ADULT");
    const adultDeniedConsent = await makePrincipal(NAMES.adultDeniedConsent, "ADULT");
    await makePrincipal(NAMES.child, "CHILD");
    await makePrincipal(NAMES.guardianRepresented, "GUARDIAN_REPRESENTED");
    // NOT in the ADULT/CHILD/GUARDIAN_REPRESENTED filter below -- proves
    // the compiled `where` actually excludes non-matching rows rather
    // than the endpoint just counting the whole organization.
    await makePrincipal(NAMES.unknownAgeControl, "UNKNOWN");

    // Only one principal has a known EMAIL field -- drives withEmail/portalOnly.
    await prisma.principalDataField.create({
      data: {
        organizationId: org.organizationId,
        dataPrincipalId: adultWithEmailGranted.id,
        canonicalField: "EMAIL",
        value: `aditi-${randomUUID()}@example.com`,
        dataCategory: "CONTACT",
      },
    });

    // Consent for PURPOSE_ID: GRANTED for one, DENIED for another, none
    // at all for the rest -- drives suppressedByConsent.
    await prisma.consentRecord.create({
      data: {
        organizationId: org.organizationId,
        dataPrincipalId: adultWithEmailGranted.id,
        purposeId: PURPOSE_ID,
        status: "GRANTED",
        grantedAt: new Date(),
      },
    });
    await prisma.consentRecord.create({
      data: {
        organizationId: org.organizationId,
        dataPrincipalId: adultDeniedConsent.id,
        purposeId: PURPOSE_ID,
        status: "DENIED",
        deniedAt: new Date(),
      },
    });

    // A relation-based field beyond PrincipalDataField/ConsentRecord --
    // proves `requestStatus`'s `requests` traversal end to end over HTTP.
    await prisma.principalRequest.create({
      data: {
        organizationId: org.organizationId,
        reference: `REQ-${randomUUID()}`,
        dataPrincipalId: adultNoEmailNoConsent.id,
        type: "ACCESS",
        status: "OPEN",
        subject: "Access request",
        body: "Please share my data.",
      },
    });
  });

  afterAll(async () => {
    await prisma.principalRequest.deleteMany({
      where: { organizationId: org.organizationId },
    });
    await prisma.consentRecord.deleteMany({
      where: { organizationId: org.organizationId },
    });
    await prisma.principalDataField.deleteMany({
      where: { organizationId: org.organizationId },
    });
    await prisma.dataPrincipal.deleteMany({
      where: { id: { in: dataPrincipalIds } },
    });
    await cleanupOrgs(prisma, orgIds);
    await app.close();
    await prisma.$disconnect();
  });

  function ageStatusFilter() {
    return {
      op: "AND",
      rules: [
        {
          field: "ageStatus",
          operator: "in",
          value: ["ADULT", "CHILD", "GUARDIAN_REPRESENTED"],
        },
      ],
    };
  }

  it("computes total/withEmail/portalOnly/suppressedAsChild/suppressedByConsent correctly against real seeded rows", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/audiences/preview")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send({ filter: ageStatusFilter(), purposeId: PURPOSE_ID });

    expect(res.status).toBe(201);
    // Five principals match ageStatus IN [ADULT, CHILD, GUARDIAN_REPRESENTED];
    // the sixth (UNKNOWN) is excluded by the filter, proving it is a real
    // predicate and not an unfiltered organization-wide count.
    expect(res.body.total).toBe(5);
    // Only adultWithEmailGranted has a known EMAIL field.
    expect(res.body.withEmail).toBe(1);
    expect(res.body.portalOnly).toBe(4);
    // suppressedByConsent(PURPOSE_ID): everyone except adultWithEmailGranted
    // (GRANTED) lacks a GRANTED consent row for PURPOSE_ID -- including the
    // DENIED row and the three with no consent row at all.
    expect(res.body.suppressedByConsent).toBe(4);
    // suppressedAsChild: CHILD *and* GUARDIAN_REPRESENTED both count
    // (the project's deliberate widening past the spec's literal
    // pseudocode -- AgeStatus has four values, not three).
    expect(res.body.suppressedAsChild).toBe(2);
  });

  it("reports suppressedByConsent as 0 when no purposeId is given (nothing to check consent against)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/audiences/preview")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send({ filter: ageStatusFilter() });

    expect(res.status).toBe(201);
    expect(res.body.suppressedByConsent).toBe(0);
  });

  it("filters through a real requests relation for requestStatus", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/audiences/preview")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send({
        filter: {
          op: "AND",
          rules: [{ field: "requestStatus", operator: "in", value: ["OPEN"] }],
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(1);
  });

  it("returns a masked sample of names, never the raw displayName", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/audiences/preview")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send({ filter: ageStatusFilter() });

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body.sample)).toBe(true);
    expect(res.body.sample.length).toBeGreaterThan(0);
    expect(res.body.sample.length).toBeLessThanOrEqual(10);

    const matchingRawNames = [
      NAMES.adultWithEmailGranted,
      NAMES.adultNoEmailNoConsent,
      NAMES.adultDeniedConsent,
      NAMES.child,
      NAMES.guardianRepresented,
    ];
    const expectedMasked = matchingRawNames
      .map((name) => masking.maskValue("FULL_NAME", name))
      .sort();

    expect([...res.body.sample].sort()).toEqual(expectedMasked);
    // Never the raw, unmasked value -- the actor here holds only
    // CAN_SEND_MESSAGES, not CAN_VIEW_ALL_PERSONAL_DATA.
    for (const name of matchingRawNames) {
      expect(res.body.sample).not.toContain(name);
    }
  });

  it("400s on an unknown filter field instead of silently ignoring it", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/audiences/preview")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send({
        filter: {
          op: "AND",
          rules: [{ field: "notARealField", operator: "eq", value: "x" }],
        },
      });

    expect(res.status).toBe(400);
  });

  it("403s without CAN_SEND_MESSAGES, with a positive control on the same route and payload", async () => {
    const withoutPermission = await createOrgWithEmployee(
      app,
      prisma,
      "AUDIENCE_NO_PERM",
      [],
    );
    orgIds.push(withoutPermission.organizationId);

    const payload = { filter: { op: "AND", rules: [] } };

    const okRes = await request(app.getHttpServer())
      .post("/api/audiences/preview")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(payload);
    expect(okRes.status).toBe(201);

    const deniedRes = await request(app.getHttpServer())
      .post("/api/audiences/preview")
      .set("Authorization", `Bearer ${withoutPermission.accessToken}`)
      .send(payload);
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.message).toContain(
      "Missing required permission: CAN_SEND_MESSAGES",
    );
  });
});

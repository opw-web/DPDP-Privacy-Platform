import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import {
  bootstrapTestApp,
  createOrgWithEmployee,
  cleanupOrgs,
  ensurePermission,
} from "./support/e2e-harness";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  TenantContext,
  TenantStore,
} from "../src/common/tenant/tenant-context";
import { GuardiansService } from "../src/modules/children/guardians.service";
import { AgeService } from "../src/modules/identity/age.service";
import type { AgeStatus } from "@prisma/client";

/**
 * Task 8 gate (§4.4 CH-01…CH-10). Every negative (400/403) assertion
 * below has a POSITIVE CONTROL in the same test -- the identical
 * request/payload with only the field under test corrected -- following
 * `purposes.e2e-spec.ts`'s house style, so a passing test cannot be
 * passing for the wrong reason (route not found, an unrelated field
 * failing validation first, the permission guard rejecting before the
 * business rule is even reached).
 *
 * "Check 13" (the guardian-consent-eligibility predicate) has no HTTP
 * route to hit -- the consent module does not exist yet (Wave 3) -- so
 * it is exercised directly against `GuardiansService.assertGuardianConsentEligible`,
 * resolved off the real, fully-compiled `AppModule` via `app.get(...)`,
 * wrapped in `TenantContext.run(...)` the same way
 * `access-log.e2e-spec.ts` calls a service directly outside an HTTP
 * request.
 */
describe("Children, guardians and exemption claims (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let guardiansService: GuardiansService;
  let ageService: AgeService;
  const orgIds: string[] = [];

  const ctxFor = (organizationId: string, actorId: string): TenantStore => ({
    organizationId,
    actorType: "EMPLOYEE",
    actorId,
    actorLabel: `Employee ${actorId}`,
  });

  beforeAll(async () => {
    const testApp = await bootstrapTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    guardiansService = app.get(GuardiansService);
    ageService = app.get(AgeService);
  });

  afterAll(async () => {
    if (orgIds.length > 0) {
      // FK-safe order: GuardianRelationship has a real, onDelete:Restrict
      // FK to DataPrincipal, so it must go first. ChildExemptionClaim
      // carries no FK to DataPrincipal but is an MVP 2 row `cleanupOrgs`
      // does not know about. AuditEvent rows are deliberately NOT
      // deleted -- a DB trigger rejects DELETE ("AuditEvent rows are
      // immutable"), and every other e2e spec that writes audit events
      // leaves them in place for the same reason (see e.g.
      // `access-log.e2e-spec.ts`'s own comment): it has no FK to
      // Organization, so leaving it behind does not block
      // `cleanupOrgs()`'s `organization.deleteMany` below.
      await prisma.guardianRelationship.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.childExemptionClaim.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.dataPrincipal.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
    }
    await cleanupOrgs(prisma, orgIds);
    await app.close();
    await prisma.$disconnect();
  });

  async function makeOrg(
    permissionCodes: readonly string[] = ["CAN_MANAGE_CHILD_DATA"],
  ) {
    const org = await createOrgWithEmployee(
      app,
      prisma,
      "CHILD_DATA_MANAGER",
      permissionCodes,
    );
    orgIds.push(org.organizationId);
    return org;
  }

  /** A second employee in `organizationId` holding NO permissions at all. */
  async function makeNoPermActor(
    organizationId: string,
  ): Promise<{ accessToken: string }> {
    const role = await prisma.role.create({
      data: {
        organizationId,
        code: `NO_PERM_${randomUUID()}`,
        name: "No Permissions",
        isSystem: false,
      },
    });
    const email = `no-perm-${randomUUID()}@example.com`;
    const password = "CorrectHorseBattery9!";
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.employee.create({
      data: {
        organizationId,
        email,
        fullName: "No Perm",
        roleId: role.id,
        passwordHash,
        status: "ACTIVE",
      },
    });
    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email, password });
    return { accessToken: loginRes.body.accessToken as string };
  }

  async function makePrincipal(
    organizationId: string,
    ageStatus: AgeStatus = "CHILD",
  ): Promise<string> {
    const principal = await prisma.dataPrincipal.create({
      data: {
        organizationId,
        reference: `DP-${randomUUID()}`,
        displayName: "Test Principal",
        ageStatus,
      },
    });
    return principal.id;
  }

  function validGuardianPayload(
    dataPrincipalId: string,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      dataPrincipalId,
      kind: "PARENT_OF_CHILD",
      guardianName: "Test Guardian",
      guardianEmail: "guardian@example.com",
      guardianPhone: "+919876543210",
      ...overrides,
    };
  }

  function validExemptionPayload(overrides: Record<string, unknown> = {}) {
    return {
      purposeId: randomUUID(),
      schedulePart: "Fourth Schedule Part A",
      scheduleRow: 3,
      conditionText: "Processing necessary for a bar to entry into employment.",
      justification: "This purpose fits row 3 exactly.",
      ...overrides,
    };
  }

  // ───────────────────────── Check 13 ─────────────────────────

  it("assertGuardianConsentEligible rejects a CHILD principal with no givenByGuardianId, quoting Rule 10; a verified guardian resolves", async () => {
    const org = await makeOrg();
    const principalId = await makePrincipal(org.organizationId, "CHILD");

    // NEGATIVE: no guardianId at all.
    await expect(
      TenantContext.run(ctxFor(org.organizationId, org.employeeId), () =>
        guardiansService.assertGuardianConsentEligible(principalId, undefined),
      ),
    ).rejects.toThrow(/Rule 10/);

    const createRes = await request(app.getHttpServer())
      .post("/api/guardians")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(validGuardianPayload(principalId));
    expect(createRes.status).toBe(201);
    const guardianId = createRes.body.id as string;
    expect(createRes.body.verification).toBe("NONE");

    // NEGATIVE: guardian named, but verification is still NONE.
    await expect(
      TenantContext.run(ctxFor(org.organizationId, org.employeeId), () =>
        guardiansService.assertGuardianConsentEligible(principalId, guardianId),
      ),
    ).rejects.toThrow(/Rule 10/);

    const verifyRes = await request(app.getHttpServer())
      .post(`/api/guardians/${guardianId}/verify`)
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send({
        verification: "EXISTING_RELIABLE_DETAILS",
        verificationReference: "ref-123",
      });
    expect(verifyRes.status).toBe(201);
    expect(verifyRes.body.verification).toBe("EXISTING_RELIABLE_DETAILS");

    // POSITIVE CONTROL: same principal, same guardian, now verified.
    await expect(
      TenantContext.run(ctxFor(org.organizationId, org.employeeId), () =>
        guardiansService.assertGuardianConsentEligible(principalId, guardianId),
      ),
    ).resolves.toBeUndefined();
  });

  it("assertGuardianConsentEligible treats GUARDIAN_REPRESENTED the same as CHILD, and is a no-op for ADULT regardless of guardianId", async () => {
    const org = await makeOrg();
    const pwdPrincipalId = await makePrincipal(
      org.organizationId,
      "GUARDIAN_REPRESENTED",
    );
    const adultPrincipalId = await makePrincipal(org.organizationId, "ADULT");

    await expect(
      TenantContext.run(ctxFor(org.organizationId, org.employeeId), () =>
        guardiansService.assertGuardianConsentEligible(
          pwdPrincipalId,
          undefined,
        ),
      ),
    ).rejects.toThrow(/Rule 10/);

    // POSITIVE CONTROL: an ADULT principal needs no guardian at all.
    await expect(
      TenantContext.run(ctxFor(org.organizationId, org.employeeId), () =>
        guardiansService.assertGuardianConsentEligible(
          adultPrincipalId,
          undefined,
        ),
      ),
    ).resolves.toBeUndefined();
  });

  it("guardian verification cannot itself be set to NONE, quoting Rule 10; a real method succeeds", async () => {
    const org = await makeOrg();
    const principalId = await makePrincipal(org.organizationId, "CHILD");
    const createRes = await request(app.getHttpServer())
      .post("/api/guardians")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(validGuardianPayload(principalId));
    const guardianId = createRes.body.id as string;

    // NEGATIVE
    const badRes = await request(app.getHttpServer())
      .post(`/api/guardians/${guardianId}/verify`)
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send({ verification: "NONE" });
    expect(badRes.status).toBe(400);
    expect(JSON.stringify(badRes.body)).toContain("Rule 10");

    // POSITIVE CONTROL
    const okRes = await request(app.getHttpServer())
      .post(`/api/guardians/${guardianId}/verify`)
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send({ verification: "VIRTUAL_TOKEN", verificationReference: "tok-1" });
    expect(okRes.status).toBe(201);
    expect(okRes.body.verification).toBe("VIRTUAL_TOKEN");
    expect(okRes.body.verifiedByEmployeeId).toBe(org.employeeId);
    expect(okRes.body.verifiedAt).not.toBeNull();

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: org.organizationId,
        action: "GUARDIAN_VERIFIED",
        resourceId: guardianId,
      },
    });
    expect(auditEvent).not.toBeNull();
  });

  it("POST /api/guardians writes a GUARDIAN_REGISTERED audit event", async () => {
    const org = await makeOrg();
    const principalId = await makePrincipal(org.organizationId, "CHILD");
    const createRes = await request(app.getHttpServer())
      .post("/api/guardians")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(validGuardianPayload(principalId));
    expect(createRes.status).toBe(201);

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: org.organizationId,
        action: "GUARDIAN_REGISTERED",
        resourceId: createRes.body.id,
      },
    });
    expect(auditEvent).not.toBeNull();
  });

  // ─────────────────────── CH-08/CH-09, Rule 11 ───────────────────────

  it("a LAWFUL_GUARDIAN_OF_PWD without appointingAuthority returns 400 citing Rule 11; adding it succeeds", async () => {
    const org = await makeOrg();
    const principalId = await makePrincipal(
      org.organizationId,
      "GUARDIAN_REPRESENTED",
    );
    const payload = validGuardianPayload(principalId, {
      kind: "LAWFUL_GUARDIAN_OF_PWD",
      appointmentReference: "CASE-001",
    });

    // NEGATIVE
    const badRes = await request(app.getHttpServer())
      .post("/api/guardians")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(payload);
    expect(badRes.status).toBe(400);
    expect(JSON.stringify(badRes.body)).toContain("Rule 11");
    expect(JSON.stringify(badRes.body)).toContain("appointingAuthority");

    // POSITIVE CONTROL
    const okRes = await request(app.getHttpServer())
      .post("/api/guardians")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send({ ...payload, appointingAuthority: "COURT" });
    expect(okRes.status).toBe(201);
    expect(okRes.body.appointingAuthority).toBe("COURT");
  });

  it("a LAWFUL_GUARDIAN_OF_PWD without appointmentReference returns 400 citing Rule 11; adding it succeeds", async () => {
    const org = await makeOrg();
    const principalId = await makePrincipal(
      org.organizationId,
      "GUARDIAN_REPRESENTED",
    );
    const payload = validGuardianPayload(principalId, {
      kind: "LAWFUL_GUARDIAN_OF_PWD",
      appointingAuthority: "DESIGNATED_AUTHORITY",
    });

    // NEGATIVE
    const badRes = await request(app.getHttpServer())
      .post("/api/guardians")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(payload);
    expect(badRes.status).toBe(400);
    expect(JSON.stringify(badRes.body)).toContain("Rule 11");
    expect(JSON.stringify(badRes.body)).toContain("appointmentReference");

    // POSITIVE CONTROL
    const okRes = await request(app.getHttpServer())
      .post("/api/guardians")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send({ ...payload, appointmentReference: "CASE-002" });
    expect(okRes.status).toBe(201);
    expect(okRes.body.appointmentReference).toBe("CASE-002");
  });

  // ───────────────────────── CH-06/CH-07 ─────────────────────────

  it("a ChildExemptionClaim missing schedulePart returns 400 naming schedulePart; the corrected payload succeeds", async () => {
    const org = await makeOrg();
    const payload: Record<string, unknown> = validExemptionPayload();
    delete payload["schedulePart"];

    // NEGATIVE
    const badRes = await request(app.getHttpServer())
      .post("/api/child-exemptions")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(payload);
    expect(badRes.status).toBe(400);
    expect(JSON.stringify(badRes.body)).toContain("schedulePart");

    // POSITIVE CONTROL
    const okRes = await request(app.getHttpServer())
      .post("/api/child-exemptions")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(validExemptionPayload());
    expect(okRes.status).toBe(201);
  });

  it("a ChildExemptionClaim missing scheduleRow returns 400 naming scheduleRow; the corrected payload succeeds", async () => {
    const org = await makeOrg();
    const payload: Record<string, unknown> = validExemptionPayload();
    delete payload["scheduleRow"];

    // NEGATIVE
    const badRes = await request(app.getHttpServer())
      .post("/api/child-exemptions")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(payload);
    expect(badRes.status).toBe(400);
    expect(JSON.stringify(badRes.body)).toContain("scheduleRow");

    // POSITIVE CONTROL
    const okRes = await request(app.getHttpServer())
      .post("/api/child-exemptions")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(validExemptionPayload());
    expect(okRes.status).toBe(201);
  });

  it("a ChildExemptionClaim missing conditionText returns 400 naming conditionText; the corrected payload succeeds -- free text alone is never accepted", async () => {
    const org = await makeOrg();
    const payload: Record<string, unknown> = validExemptionPayload();
    delete payload["conditionText"];

    // NEGATIVE
    const badRes = await request(app.getHttpServer())
      .post("/api/child-exemptions")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(payload);
    expect(badRes.status).toBe(400);
    expect(JSON.stringify(badRes.body)).toContain("conditionText");

    // POSITIVE CONTROL
    const okRes = await request(app.getHttpServer())
      .post("/api/child-exemptions")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(validExemptionPayload());
    expect(okRes.status).toBe(201);

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: org.organizationId,
        action: "CHILD_EXEMPTION_CLAIMED",
        resourceId: okRes.body.id,
      },
    });
    expect(auditEvent).not.toBeNull();
  });

  it("an invalid schedulePart (not the two literal spec values) returns 400", async () => {
    const org = await makeOrg();

    // NEGATIVE
    const badRes = await request(app.getHttpServer())
      .post("/api/child-exemptions")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(validExemptionPayload({ schedulePart: "Something else" }));
    expect(badRes.status).toBe(400);

    // POSITIVE CONTROL: the OTHER literal value.
    const okRes = await request(app.getHttpServer())
      .post("/api/child-exemptions")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(validExemptionPayload({ schedulePart: "Part B" }));
    expect(okRes.status).toBe(201);
    expect(okRes.body.schedulePart).toBe("Part B");
  });

  // ───────────────────────── age status ─────────────────────────

  it("POST /api/principals/:id/age-status sets EMPLOYEE_SET and writes AGE_STATUS_SET; a later DOB re-derivation does not overwrite it", async () => {
    const org = await makeOrg();
    const principalId = await makePrincipal(org.organizationId, "UNKNOWN");

    const res = await request(app.getHttpServer())
      .post(`/api/principals/${principalId}/age-status`)
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send({ ageStatus: "CHILD" });
    expect(res.status).toBe(201);
    expect(res.body.ageStatus).toBe("CHILD");
    expect(res.body.ageStatusSource).toBe("EMPLOYEE_SET");
    expect(res.body.ageStatusSetAt).not.toBeNull();

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: org.organizationId,
        action: "AGE_STATUS_SET",
        resourceId: principalId,
      },
    });
    expect(auditEvent).not.toBeNull();
    expect(
      (auditEvent!.metadata as Record<string, unknown>)["derivation"],
    ).toBe("EMPLOYEE_SET");

    // A subsequent DOB-derivation pass over the SAME principal must bail
    // out and leave the employee's determination untouched -- this is
    // `AgeService.derive()`'s own documented guarantee; this test proves
    // this task's write actually triggers that guarantee (ageStatusSource
    // reads exactly "EMPLOYEE_SET", not some other truthy value).
    await TenantContext.run(ctxFor(org.organizationId, org.employeeId), () =>
      prisma.scoped.$transaction((tx) => ageService.derive(tx, principalId)),
    );

    const afterDerive = await prisma.dataPrincipal.findUniqueOrThrow({
      where: { id: principalId },
    });
    expect(afterDerive.ageStatus).toBe("CHILD");
    expect(afterDerive.ageStatusSource).toBe("EMPLOYEE_SET");
  });

  it("GET /api/principals/age-status/unknown-count reports the correct count", async () => {
    const org = await makeOrg();
    await makePrincipal(org.organizationId, "UNKNOWN");
    await makePrincipal(org.organizationId, "UNKNOWN");
    await makePrincipal(org.organizationId, "ADULT");

    const res = await request(app.getHttpServer())
      .get("/api/principals/age-status/unknown-count")
      .set("Authorization", `Bearer ${org.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.unknownCount).toBe(2);
  });

  // ───────────────────────── masking ─────────────────────────

  it("guardian contact fields are masked for an actor without CAN_VIEW_ALL_PERSONAL_DATA, and visible for one who holds it", async () => {
    const org = await makeOrg();
    const principalId = await makePrincipal(org.organizationId, "CHILD");
    const rawEmail = "guardian-mask-test@example.com";
    const rawPhone = "+919876500000";
    await request(app.getHttpServer())
      .post("/api/guardians")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(
        validGuardianPayload(principalId, {
          guardianEmail: rawEmail,
          guardianPhone: rawPhone,
        }),
      );

    // NEGATIVE-ish: CAN_MANAGE_CHILD_DATA alone -> masked.
    const maskedRes = await request(app.getHttpServer())
      .get("/api/guardians")
      .query({ dataPrincipalId: principalId })
      .set("Authorization", `Bearer ${org.accessToken}`);
    expect(maskedRes.status).toBe(200);
    expect(maskedRes.body[0].guardianEmail).not.toBe(rawEmail);
    expect(maskedRes.body[0].guardianEmail).toContain("*");
    expect(maskedRes.body[0].guardianPhone).not.toBe(rawPhone);
    expect(maskedRes.body[0].guardianPhone).toContain("*");

    // POSITIVE CONTROL: same org, same guardian, actor also holds
    // CAN_VIEW_ALL_PERSONAL_DATA -> unmasked.
    await ensurePermission(prisma, "CAN_VIEW_ALL_PERSONAL_DATA");
    const fullAccessRole = await prisma.role.create({
      data: {
        organizationId: org.organizationId,
        code: `FULL_ACCESS_${randomUUID()}`,
        name: "Full Access",
        isSystem: false,
        permissions: {
          create: [
            { permissionCode: "CAN_MANAGE_CHILD_DATA" },
            { permissionCode: "CAN_VIEW_ALL_PERSONAL_DATA" },
          ],
        },
      },
    });
    const email = `full-access-${randomUUID()}@example.com`;
    const password = "CorrectHorseBattery9!";
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.employee.create({
      data: {
        organizationId: org.organizationId,
        email,
        fullName: "Full Access",
        roleId: fullAccessRole.id,
        passwordHash,
        status: "ACTIVE",
      },
    });
    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email, password });

    const unmaskedRes = await request(app.getHttpServer())
      .get("/api/guardians")
      .query({ dataPrincipalId: principalId })
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`);
    expect(unmaskedRes.status).toBe(200);
    expect(unmaskedRes.body[0].guardianEmail).toBe(rawEmail);
    expect(unmaskedRes.body[0].guardianPhone).toBe(rawPhone);
  });

  // ───────────────────────── permissions (403 + positive control) ─────────────────────────

  it("GET /api/guardians: CAN_MANAGE_CHILD_DATA succeeds, no permission gets 403 on the identical request", async () => {
    const org = await makeOrg();
    const noPerm = await makeNoPermActor(org.organizationId);

    const deniedRes = await request(app.getHttpServer())
      .get("/api/guardians")
      .set("Authorization", `Bearer ${noPerm.accessToken}`);
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.message).toContain(
      "Missing required permission: CAN_MANAGE_CHILD_DATA",
    );

    // POSITIVE CONTROL
    const okRes = await request(app.getHttpServer())
      .get("/api/guardians")
      .set("Authorization", `Bearer ${org.accessToken}`);
    expect(okRes.status).toBe(200);
  });

  it("POST /api/guardians: CAN_MANAGE_CHILD_DATA succeeds, no permission gets 403 on the identical payload", async () => {
    const org = await makeOrg();
    const noPerm = await makeNoPermActor(org.organizationId);
    const principalId = await makePrincipal(org.organizationId, "CHILD");
    const payload = validGuardianPayload(principalId);

    const deniedRes = await request(app.getHttpServer())
      .post("/api/guardians")
      .set("Authorization", `Bearer ${noPerm.accessToken}`)
      .send(payload);
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.message).toContain(
      "Missing required permission: CAN_MANAGE_CHILD_DATA",
    );

    // POSITIVE CONTROL
    const okRes = await request(app.getHttpServer())
      .post("/api/guardians")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(payload);
    expect(okRes.status).toBe(201);
  });

  it("POST /api/guardians/:id/verify: CAN_MANAGE_CHILD_DATA succeeds, no permission gets 403 on the identical payload", async () => {
    const org = await makeOrg();
    const noPerm = await makeNoPermActor(org.organizationId);
    const principalId = await makePrincipal(org.organizationId, "CHILD");
    const createRes = await request(app.getHttpServer())
      .post("/api/guardians")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(validGuardianPayload(principalId));
    const guardianId = createRes.body.id as string;
    const payload = {
      verification: "SELF_PROVIDED_DETAILS",
      verificationReference: "ref-x",
    };

    const deniedRes = await request(app.getHttpServer())
      .post(`/api/guardians/${guardianId}/verify`)
      .set("Authorization", `Bearer ${noPerm.accessToken}`)
      .send(payload);
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.message).toContain(
      "Missing required permission: CAN_MANAGE_CHILD_DATA",
    );

    // POSITIVE CONTROL
    const okRes = await request(app.getHttpServer())
      .post(`/api/guardians/${guardianId}/verify`)
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(payload);
    expect(okRes.status).toBe(201);
  });

  it("POST /api/principals/:id/age-status: CAN_MANAGE_CHILD_DATA succeeds, no permission gets 403 on the identical payload", async () => {
    const org = await makeOrg();
    const noPerm = await makeNoPermActor(org.organizationId);
    const principalId = await makePrincipal(org.organizationId, "UNKNOWN");
    const payload = { ageStatus: "ADULT" };

    const deniedRes = await request(app.getHttpServer())
      .post(`/api/principals/${principalId}/age-status`)
      .set("Authorization", `Bearer ${noPerm.accessToken}`)
      .send(payload);
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.message).toContain(
      "Missing required permission: CAN_MANAGE_CHILD_DATA",
    );

    // POSITIVE CONTROL
    const okRes = await request(app.getHttpServer())
      .post(`/api/principals/${principalId}/age-status`)
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(payload);
    expect(okRes.status).toBe(201);
  });

  it("GET /api/child-exemptions: CAN_MANAGE_CHILD_DATA succeeds, no permission gets 403 on the identical request", async () => {
    const org = await makeOrg();
    const noPerm = await makeNoPermActor(org.organizationId);

    const deniedRes = await request(app.getHttpServer())
      .get("/api/child-exemptions")
      .set("Authorization", `Bearer ${noPerm.accessToken}`);
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.message).toContain(
      "Missing required permission: CAN_MANAGE_CHILD_DATA",
    );

    // POSITIVE CONTROL
    const okRes = await request(app.getHttpServer())
      .get("/api/child-exemptions")
      .set("Authorization", `Bearer ${org.accessToken}`);
    expect(okRes.status).toBe(200);
  });

  it("POST /api/child-exemptions: CAN_MANAGE_CHILD_DATA succeeds, no permission gets 403 on the identical payload", async () => {
    const org = await makeOrg();
    const noPerm = await makeNoPermActor(org.organizationId);
    const payload = validExemptionPayload();

    const deniedRes = await request(app.getHttpServer())
      .post("/api/child-exemptions")
      .set("Authorization", `Bearer ${noPerm.accessToken}`)
      .send(payload);
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.message).toContain(
      "Missing required permission: CAN_MANAGE_CHILD_DATA",
    );

    // POSITIVE CONTROL
    const okRes = await request(app.getHttpServer())
      .post("/api/child-exemptions")
      .set("Authorization", `Bearer ${org.accessToken}`)
      .send(payload);
    expect(okRes.status).toBe(201);
  });
});

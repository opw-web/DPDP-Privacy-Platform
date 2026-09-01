import { randomUUID } from "crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as argon2 from "argon2";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";

describe("Principal portal MVP2 contracts (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaService();
  let organizationId: string;
  let principalA: { id: string; token: string };
  let principalB: { id: string; token: string };
  let requestReference: string;
  let noticeId: string;
  let noticeVersionId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createPrincipal(displayName: string) {
    const id = randomUUID();
    const email = `${id}@portal-contract.test`;
    await prisma.dataPrincipal.create({
      data: {
        id,
        organizationId,
        reference: `DP-${id.slice(0, 8)}`,
        displayName,
        ageStatus: "ADULT",
      },
    });
    await prisma.principalAccount.create({
      data: {
        organizationId,
        dataPrincipalId: id,
        email,
        passwordHash: await argon2.hash("CorrectHorseBattery9!", {
          type: argon2.argon2id,
        }),
        status: "ACTIVE",
      },
    });
    const response = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({ email, password: "CorrectHorseBattery9!" });
    expect(response.status).toBe(200);
    return { id, token: response.body.accessToken as string };
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await prisma.$connect();

    organizationId = randomUUID();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Portal Contract Organization",
        legalName: "Portal Contract Organization Private Limited",
        grievanceContactEmail: "grievance@portal-contract.test",
        dpoName: "Portal DPO",
        dpoEmail: "dpo@portal-contract.test",
      },
    });
    principalA = await createPrincipal("Portal Alice");
    principalB = await createPrincipal("Portal Bob");

    const notice = await prisma.privacyNotice.create({
      data: {
        organizationId,
        code: `PORTAL-${randomUUID()}`,
        name: "Portal privacy notice",
        purposeIds: [],
        status: "PUBLISHED",
      },
    });
    noticeId = notice.id;
    const version = await prisma.noticeVersion.create({
      data: {
        organizationId,
        noticeId,
        version: 1,
        itemisedDataFields: [],
        purposeStatements: [],
        withdrawalUrl: "https://portal-contract.test/withdraw",
        rightsUrl: "https://portal-contract.test/rights",
        boardComplaintUrl: "https://portal-contract.test/board",
        bodyMarkdown: "Published portal notice",
        contentHash: "contract-hash",
        publishedAt: new Date(),
        createdByEmployeeId: randomUUID(),
      },
    });
    noticeVersionId = version.id;
    await prisma.privacyNotice.update({
      where: { id: noticeId },
      data: { currentVersionId: noticeVersionId },
    });
  });

  afterAll(async () => {
    await prisma.noticeVersion.deleteMany({ where: { noticeId } });
    await prisma.privacyNotice.deleteMany({ where: { id: noticeId } });
    await prisma.notification.deleteMany({ where: { organizationId } });
    await prisma.requestEvent.deleteMany({
      where: { request: { organizationId } },
    });
    await prisma.principalRequest.deleteMany({ where: { organizationId } });
    await prisma.nomination.deleteMany({ where: { organizationId } });
    await prisma.principalAccount.deleteMany({ where: { organizationId } });
    await prisma.dataPrincipal.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.close();
    await prisma.$disconnect();
  });

  it("creates and lists requests only for the token principal", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/me/requests")
      .set(auth(principalA.token))
      .send({
        type: "ACCESS",
        subject: "See my data",
        body: "Please send my data.",
      });
    expect(created.status).toBe(201);
    requestReference = created.body.reference as string;

    const own = await request(app.getHttpServer())
      .get("/api/me/requests")
      .set(auth(principalA.token));
    expect(own.status).toBe(200);
    expect(
      own.body.map((row: { reference: string }) => row.reference),
    ).toContain(requestReference);

    const other = await request(app.getHttpServer())
      .get("/api/me/requests")
      .set(auth(principalB.token));
    expect(other.status).toBe(200);
    expect(other.body).toEqual([]);
  });

  it("creates and lists a correction request with its requested changes", async () => {
    const requestedChanges = {
      "Phone number": { from: "+91 90000 11111", to: "+91 90000 22222" },
    };
    const body = 'Please correct the Phone number value from "+91 90000 11111" to "+91 90000 22222".';
    const created = await request(app.getHttpServer())
      .post("/api/me/requests")
      .set(auth(principalA.token))
      .send({
        type: "CORRECTION",
        subject: "Correct my data",
        body,
        requestedChanges,
      });
    expect(created.status).toBe(201);
    expect(created.body.body).toBe(body);
    expect(created.body.requestedChanges).toEqual(requestedChanges);

    const listed = await request(app.getHttpServer())
      .get("/api/me/requests")
      .set(auth(principalA.token));
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reference: created.body.reference,
          type: "CORRECTION",
          body,
          requestedChanges,
        }),
      ]),
    );
  });

  it("rejects cross-principal request detail and mutation attempts", async () => {
    const detail = await request(app.getHttpServer())
      .get(`/api/me/requests/${requestReference}`)
      .set(auth(principalB.token));
    expect(detail.status).toBe(404);

    const cancel = await request(app.getHttpServer())
      .post(`/api/me/requests/${requestReference}/cancel`)
      .set(auth(principalB.token));
    expect(cancel.status).toBe(404);
  });

  it("shows principal comments and permits only that principal to cancel", async () => {
    const comment = await request(app.getHttpServer())
      .post(`/api/me/requests/${requestReference}/comment`)
      .set(auth(principalA.token))
      .send({ comment: "Here is an additional detail." });
    expect(comment.status).toBe(201);

    const detail = await request(app.getHttpServer())
      .get(`/api/me/requests/${requestReference}`)
      .set(auth(principalA.token));
    expect(detail.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          note: "Here is an additional detail.",
          visibleToPrincipal: true,
        }),
      ]),
    );

    const cancel = await request(app.getHttpServer())
      .post(`/api/me/requests/${requestReference}/cancel`)
      .set(auth(principalA.token));
    expect(cancel.status).toBe(201);
    expect(cancel.body.status).toBe("CANCELLED");
  });

  it("upserts a nomination against the token principal only", async () => {
    const saved = await request(app.getHttpServer())
      .put("/api/me/nomination")
      .set(auth(principalA.token))
      .send({
        nomineeName: "Alice Nominee",
        nomineeEmail: "nominee@test.example",
        relationship: "sister",
        scope: "ALL_RIGHTS",
        activationCondition: "BOTH",
      });
    expect(saved.status).toBe(200);
    expect(saved.body.nomineeName).toBe("Alice Nominee");

    const own = await request(app.getHttpServer())
      .get("/api/me/nomination")
      .set(auth(principalA.token));
    const other = await request(app.getHttpServer())
      .get("/api/me/nomination")
      .set(auth(principalB.token));
    expect(own.body.nomineeName).toBe("Alice Nominee");
    expect(other.status).toBe(200);
    expect(other.body.nomineeName).toBeUndefined();
  });

  it("returns only own messages and the published privacy contract", async () => {
    await prisma.notification.create({
      data: {
        organizationId,
        audience: "PRINCIPAL",
        dataPrincipalId: principalA.id,
        title: "Alice message",
        body: "For Alice",
      },
    });
    await prisma.notification.create({
      data: {
        organizationId,
        audience: "PRINCIPAL",
        dataPrincipalId: principalB.id,
        title: "Bob message",
        body: "For Bob",
      },
    });
    const messages = await request(app.getHttpServer())
      .get("/api/me/messages")
      .set(auth(principalA.token));
    expect(messages.status).toBe(200);
    expect(messages.body).toEqual([
      expect.objectContaining({ title: "Alice message" }),
    ]);

    const privacy = await request(app.getHttpServer())
      .get("/api/me/privacy-contact")
      .set(auth(principalA.token));
    expect(privacy.body).toMatchObject({
      organizationName: "Portal Contract Organization",
      legalName: "Portal Contract Organization Private Limited",
      grievanceContactEmail: "grievance@portal-contract.test",
    });

    const notices = await request(app.getHttpServer())
      .get("/api/me/notices")
      .set(auth(principalA.token));
    expect(notices.status).toBe(200);
    expect(notices.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: noticeId })]),
    );
    const byNotice = await request(app.getHttpServer())
      .get(`/api/me/notices/${noticeId}?lang=en`)
      .set(auth(principalA.token));
    const byVersion = await request(app.getHttpServer())
      .get(`/api/me/notices/${noticeVersionId}?lang=en`)
      .set(auth(principalA.token));
    expect(byNotice.body.bodyMarkdown).toBe("Published portal notice");
    expect(byVersion.body.id).toBe(noticeVersionId);
  });
});

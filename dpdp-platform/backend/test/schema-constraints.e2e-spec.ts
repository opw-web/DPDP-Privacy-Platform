import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { Client as PgClient } from "pg";

/**
 * Proves, against a real Postgres database, the four guarantees that live
 * only in the hand-written second migration (raw SQL Prisma cannot express):
 *  1. AuditEvent is append-only (UPDATE and DELETE both raise).
 *  2. A DATA_PROCESSOR DataRecipient cannot be marked active without a contract.
 *  3. Exactly one ACTIVE IdentityLink per normalizedRecordId.
 *
 * This talks to the raw PrismaClient directly (no Nest module, no tenant
 * extension) because it is testing database-level constraints, not
 * application code.
 */
describe("Schema constraints and triggers (e2e)", () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("AuditEvent immutability (audit_no_update / audit_no_delete)", () => {
    let organizationId: string;
    let auditEventId: string;

    beforeEach(async () => {
      organizationId = randomUUID();
      const event = await prisma.auditEvent.create({
        data: {
          organizationId,
          sequence: BigInt(1),
          actorType: "SYSTEM",
          actorLabel: "test-harness",
          action: "TEST_EVENT",
          resourceType: "TestResource",
          hash: "test-hash",
        },
      });
      auditEventId = event.id;
    });

    it("rejects UPDATE with 'AuditEvent rows are immutable'", async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "AuditEvent" SET action='TAMPERED' WHERE id = $1`,
          auditEventId,
        ),
      ).rejects.toThrow(/AuditEvent rows are immutable \(attempted UPDATE\)/);
    });

    it("rejects DELETE with 'AuditEvent rows are immutable'", async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `DELETE FROM "AuditEvent" WHERE id = $1`,
          auditEventId,
        ),
      ).rejects.toThrow(/AuditEvent rows are immutable \(attempted DELETE\)/);
    });
  });

  describe("processor_requires_contract CHECK constraint", () => {
    it("rejects an active DATA_PROCESSOR DataRecipient with no contract", async () => {
      const organizationId = randomUUID();

      await expect(
        prisma.dataRecipient.create({
          data: {
            organizationId,
            name: `Uncontracted Processor ${randomUUID()}`,
            type: "DATA_PROCESSOR",
            active: true,
            contractExists: false,
          },
        }),
      ).rejects.toThrow(/processor_requires_contract/);
    });

    it("allows an active DATA_PROCESSOR DataRecipient once a contract exists", async () => {
      const organizationId = randomUUID();

      const recipient = await prisma.dataRecipient.create({
        data: {
          organizationId,
          name: `Contracted Processor ${randomUUID()}`,
          type: "DATA_PROCESSOR",
          active: true,
          contractExists: true,
        },
      });

      expect(recipient.active).toBe(true);
    });
  });

  describe("identity_link_one_active partial unique index", () => {
    it("rejects a second ACTIVE IdentityLink for the same normalizedRecordId", async () => {
      const organizationId = randomUUID();

      const dataSource = await prisma.dataSource.create({
        data: {
          organizationId,
          name: `Source ${randomUUID()}`,
          systemType: "TEST",
          baseUrl: "https://example.test",
          recordsPath: "data",
          externalIdField: "id",
        },
      });

      const sourceRecord = await prisma.sourceRecord.create({
        data: {
          organizationId,
          dataSourceId: dataSource.id,
          sourceRecordKey: randomUUID(),
          rawPayload: {},
          payloadHash: "hash",
        },
      });

      const normalizedRecord = await prisma.normalizedRecord.create({
        data: {
          organizationId,
          sourceRecordId: sourceRecord.id,
        },
      });

      const principalOne = await prisma.dataPrincipal.create({
        data: {
          organizationId,
          reference: `DP-${randomUUID()}`,
          displayName: "Principal One",
        },
      });

      const principalTwo = await prisma.dataPrincipal.create({
        data: {
          organizationId,
          reference: `DP-${randomUUID()}`,
          displayName: "Principal Two",
        },
      });

      await prisma.identityLink.create({
        data: {
          organizationId,
          dataPrincipalId: principalOne.id,
          normalizedRecordId: normalizedRecord.id,
          confidence: "EXACT",
          matchedOn: { field: "email" },
          status: "ACTIVE",
        },
      });

      // Go through node-postgres directly (not the Prisma Client, which
      // strips the constraint name off raw-query errors) so we can assert
      // on the actual Postgres constraint that fired.
      const pg = new PgClient({
        connectionString: process.env["DATABASE_URL"],
      });
      await pg.connect();
      try {
        await expect(
          pg.query(
            `INSERT INTO "IdentityLink"
               (id, "organizationId", "dataPrincipalId", "normalizedRecordId", confidence, "matchedOn", status, "createdAt")
             VALUES ($1, $2, $3, $4, 'EXACT'::"MatchConfidence", '{"field":"email"}'::jsonb, 'ACTIVE'::"LinkStatus", now())`,
            [
              randomUUID(),
              organizationId,
              principalTwo.id,
              normalizedRecord.id,
            ],
          ),
        ).rejects.toMatchObject({ constraint: "identity_link_one_active" });
      } finally {
        await pg.end();
      }
    });
  });

  describe("NormalizedRecord tenant nameKey index", () => {
    it("keeps the checked-in migration SQL and deployed index aligned", async () => {
      const migrationSql = readFileSync(
        join(
          process.cwd(),
          "prisma/migrations/20260830120000_normalized_record_name_key_index/migration.sql",
        ),
        "utf8",
      );
      // Compare on content, not on line endings: a Windows clone with
      // core.autocrlf=true checks this .sql file out as CRLF, which is
      // harmless to Prisma and to psql but would fail a byte-for-byte
      // comparison against the LF literal below.
      expect(migrationSql.replace(/\r\n/g, "\n")).toBe(
        "-- Supporting-signal matching searches nameKey within a tenant.\n" +
          'CREATE INDEX "NormalizedRecord_organizationId_nameKey_idx"\n' +
          '  ON "NormalizedRecord"("organizationId", "nameKey");\n',
      );

      const indexes = await prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
        `SELECT indexdef
           FROM pg_indexes
          WHERE schemaname = current_schema()
            AND indexname = 'NormalizedRecord_organizationId_nameKey_idx'`,
      );
      expect(indexes).toHaveLength(1);
      expect(indexes[0]?.indexdef).toContain(
        'ON public."NormalizedRecord" USING btree ("organizationId", "nameKey")',
      );
    });
  });
});

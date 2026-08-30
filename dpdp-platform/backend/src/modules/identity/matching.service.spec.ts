import type { NormalizedRecord } from "@prisma/client";
import { MatchingService } from "./matching.service";
import type { NormalizationMapping } from "../normalization/normalization.service";

const baseRecord = {
  id: "record-1",
  customerId: null,
  emailNormalized: null,
  phoneNormalized: null,
  nameKey: null,
  postalCode: null,
  dateOfBirth: null,
} as Pick<
  NormalizedRecord,
  | "id"
  | "customerId"
  | "emailNormalized"
  | "phoneNormalized"
  | "nameKey"
  | "postalCode"
  | "dateOfBirth"
>;

function mappings(verifiedCustomerId = false): readonly NormalizationMapping[] {
  return [
    {
      sourceField: "customerId",
      canonicalField: "CUSTOMER_ID",
      dataCategory: "IDENTITY",
      containsPersonalData: true,
      isVerifiedCustomerId: verifiedCustomerId,
    },
  ];
}

function createService(
  identifiers: Record<string, { id: string; reference: string }>,
  supportingRecords: Array<
    Pick<
      NormalizedRecord,
      "id" | "nameKey" | "postalCode" | "dateOfBirth" | "phoneNormalized"
    >
  > = [],
  links: Array<{ normalizedRecordId: string; dataPrincipalId: string }> = [],
) {
  const scoped = {
    principalIdentifier: {
      findFirst: jest.fn(
        ({ where }: { where: { type: string; value: string } }) => {
          const principal = identifiers[`${where.type}:${where.value}`];
          return Promise.resolve(
            principal ? { dataPrincipalId: principal.id } : null,
          );
        },
      ),
    },
    dataPrincipal: {
      findFirst: jest.fn(({ where }: { where: { id: string } }) => {
        const principal = Object.values(identifiers).find(
          (candidate) => candidate.id === where.id,
        );
        return Promise.resolve(
          principal
            ? { id: principal.id, reference: principal.reference }
            : null,
        );
      }),
    },
    normalizedRecord: {
      findMany: jest.fn(() => Promise.resolve(supportingRecords)),
    },
    identityLink: {
      findMany: jest.fn(() => Promise.resolve(links)),
    },
  };

  return new MatchingService({ scoped } as never);
}

describe("MatchingService deterministic rules", () => {
  it("rule 1 links only a verified CUSTOMER_ID mapping", async () => {
    const service = createService({
      "CUSTOMER_ID:C-42": { id: "principal-a", reference: "DP-000001" },
    });
    const record = { ...baseRecord, customerId: "C-42" };

    await expect(service.match(record, mappings(false))).resolves.toEqual({
      kind: "NEW",
    });
    await expect(service.match(record, mappings(true))).resolves.toMatchObject({
      kind: "LINK",
      dataPrincipalId: "principal-a",
      confidence: "EXACT",
    });
  });

  it("does not trust a verified CUSTOMER_ID mapping when another source mapping can supply the value", async () => {
    const service = createService({
      "CUSTOMER_ID:C-42": { id: "principal-a", reference: "DP-000001" },
    });
    const record = { ...baseRecord, customerId: "C-42" };
    const lexicalUnverifiedWinner: readonly NormalizationMapping[] = [
      {
        sourceField: "aCustomerId",
        canonicalField: "CUSTOMER_ID",
        dataCategory: "IDENTITY",
        containsPersonalData: true,
        isVerifiedCustomerId: false,
      },
      {
        sourceField: "zVerifiedCustomerId",
        canonicalField: "CUSTOMER_ID",
        dataCategory: "IDENTITY",
        containsPersonalData: true,
        isVerifiedCustomerId: true,
      },
    ];

    await expect(
      service.match(record, lexicalUnverifiedWinner),
    ).resolves.toEqual({ kind: "NEW" });
    await expect(service.match(record, mappings(true))).resolves.toMatchObject({
      kind: "LINK",
      dataPrincipalId: "principal-a",
    });
  });

  it("rule 2 links on an identical normalized email", async () => {
    const service = createService({
      "EMAIL:aman@example.test": { id: "principal-a", reference: "DP-000001" },
    });

    await expect(
      service.match(
        { ...baseRecord, emailNormalized: "aman@example.test" },
        [],
      ),
    ).resolves.toMatchObject({
      kind: "LINK",
      dataPrincipalId: "principal-a",
      confidence: "EXACT",
    });
  });

  it("rule 3 links on an identical normalized phone with HIGH confidence", async () => {
    const service = createService({
      "PHONE:+919876543210": { id: "principal-a", reference: "DP-000001" },
    });

    await expect(
      service.match({ ...baseRecord, phoneNormalized: "+919876543210" }, []),
    ).resolves.toMatchObject({
      kind: "LINK",
      dataPrincipalId: "principal-a",
      confidence: "HIGH",
    });
  });

  it("rule 4 raises a possible candidate for matching nameKey and pincode, never a link", async () => {
    const service = createService(
      {
        "EMAIL:existing@example.test": {
          id: "principal-a",
          reference: "DP-000001",
        },
      },
      [
        {
          id: "other-record",
          nameKey: "rahul verma",
          postalCode: "411001",
          dateOfBirth: null,
          phoneNormalized: null,
        },
      ],
      [{ normalizedRecordId: "other-record", dataPrincipalId: "principal-a" }],
    );

    const result = await service.match(
      { ...baseRecord, nameKey: "rahul verma", postalCode: "411001" },
      [],
    );

    expect(result).toMatchObject({
      kind: "CANDIDATE",
      dataPrincipalId: "principal-a",
      confidence: "POSSIBLE",
      evidence: { rule: "SUPPORTING_SIGNAL", signals: ["POSTAL_CODE"] },
    });
    if (result.kind === "CANDIDATE") {
      expect(result.score).toBeGreaterThanOrEqual(0.5);
      expect(result.score).toBeLessThanOrEqual(0.8);
    }
  });

  it("never merges two people with only the same nameKey", async () => {
    const service = createService(
      {},
      [
        {
          id: "other-record",
          nameKey: "rahul verma",
          postalCode: "560001",
          dateOfBirth: null,
          phoneNormalized: "+919999999999",
        },
      ],
      [{ normalizedRecordId: "other-record", dataPrincipalId: "principal-a" }],
    );

    await expect(
      service.match(
        { ...baseRecord, nameKey: "rahul verma", postalCode: "411001" },
        [],
      ),
    ).resolves.toEqual({ kind: "NEW" });
  });

  it("links the higher-confidence exact email and raises a conflict candidate for phone", async () => {
    const service = createService({
      "EMAIL:aman@example.test": { id: "principal-a", reference: "A" },
      "PHONE:+919876543210": { id: "principal-b", reference: "B" },
    });

    await expect(
      service.match(
        {
          ...baseRecord,
          emailNormalized: "aman@example.test",
          phoneNormalized: "+919876543210",
        },
        [],
      ),
    ).resolves.toMatchObject({
      kind: "LINK",
      dataPrincipalId: "principal-a",
      confidence: "EXACT",
      candidates: [
        {
          dataPrincipalId: "principal-b",
          evidence: { conflict: "EMAIL→A, PHONE→B" },
        },
      ],
    });
  });

  it("uses CUSTOMER_ID then EMAIL as a stable tie-break for competing EXACT signals", async () => {
    const service = createService({
      "CUSTOMER_ID:C-42": { id: "principal-a", reference: "A" },
      "EMAIL:aman@example.test": { id: "principal-b", reference: "B" },
    });

    await expect(
      service.match(
        {
          ...baseRecord,
          customerId: "C-42",
          emailNormalized: "aman@example.test",
        },
        mappings(true),
      ),
    ).resolves.toMatchObject({
      kind: "LINK",
      dataPrincipalId: "principal-a",
      candidates: [
        expect.objectContaining({
          dataPrincipalId: "principal-b",
          confidence: "EXACT",
          evidence: expect.objectContaining({
            conflict: "CUSTOMER_ID→A, EMAIL→B",
          }),
        }),
      ],
    });
  });

  it("raises one deterministic candidate for each distinct losing principal", async () => {
    const service = createService({
      "CUSTOMER_ID:C-42": { id: "principal-a", reference: "A" },
      "EMAIL:aman@example.test": { id: "principal-b", reference: "B" },
      "PHONE:+919876543210": { id: "principal-c", reference: "C" },
    });

    const result = await service.match(
      {
        ...baseRecord,
        customerId: "C-42",
        emailNormalized: "aman@example.test",
        phoneNormalized: "+919876543210",
      },
      mappings(true),
    );

    expect(result).toMatchObject({
      kind: "LINK",
      dataPrincipalId: "principal-a",
      candidates: [
        expect.objectContaining({ dataPrincipalId: "principal-b" }),
        expect.objectContaining({ dataPrincipalId: "principal-c" }),
      ],
    });
    if (result.kind === "LINK") {
      expect(
        result.candidates.map((candidate) => candidate.dataPrincipalId),
      ).toEqual(["principal-b", "principal-c"]);
      expect(
        new Set(result.candidates.map((candidate) => candidate.dataPrincipalId))
          .size,
      ).toBe(2);
    }
  });
});

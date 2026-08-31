import {
  NormalizationService,
  type NormalizationMapping,
} from "./normalization.service";

describe("NormalizationService", () => {
  const service = new NormalizationService();

  it("handles null and missing mapped fields without dropping carried unmapped values", () => {
    const payload = { email: null, carried: { source: "unchanged" } };
    const mappings: NormalizationMapping[] = [
      {
        sourceField: "email",
        canonicalField: "EMAIL",
        dataCategory: "CONTACT",
        containsPersonalData: true,
        isVerifiedCustomerId: false,
      },
      {
        sourceField: "missingPhone",
        canonicalField: "PHONE",
        dataCategory: "CONTACT",
        containsPersonalData: true,
        isVerifiedCustomerId: false,
      },
    ];

    expect(
      service.normalize({ id: "source-1", rawPayload: payload }, mappings),
    ).toMatchObject({
      sourceRecordId: "source-1",
      emailRaw: null,
      emailNormalized: null,
      phoneRaw: null,
      phoneNormalized: null,
      extras: { carried: { source: "unchanged" } },
    });
  });

  it("uses the organization country for unprefixed phones and remains deterministic for duplicate mappings", () => {
    const mappings: NormalizationMapping[] = [
      {
        sourceField: "shared",
        canonicalField: "PHONE",
        dataCategory: "CONTACT",
        containsPersonalData: true,
        isVerifiedCustomerId: false,
      },
      {
        sourceField: "shared",
        canonicalField: "EMAIL",
        dataCategory: "CONTACT",
        containsPersonalData: true,
        isVerifiedCustomerId: false,
      },
      {
        sourceField: "phone",
        canonicalField: "PHONE",
        dataCategory: "CONTACT",
        containsPersonalData: true,
        isVerifiedCustomerId: false,
      },
    ];

    const result = service.normalize(
      {
        id: "source-2",
        rawPayload: { shared: "ALICE@EXAMPLE.COM", phone: "9876543210" },
        organizationCountry: "US",
      },
      mappings,
    );

    expect(result).toMatchObject({
      emailNormalized: "alice@example.com",
      phoneRaw: "9876543210",
      phoneNormalized: null,
    });
  });

  it("keeps an impossible date of birth raw while leaving its normalized column null", () => {
    const result = service.normalize(
      {
        id: "source-invalid-dob",
        rawPayload: { dob: "2024-02-30T00:00:00.000Z" },
      },
      [
        {
          sourceField: "dob",
          canonicalField: "DATE_OF_BIRTH",
          dataCategory: "IDENTITY",
          containsPersonalData: true,
          isVerifiedCustomerId: false,
        },
      ],
    );

    expect(result.dateOfBirth).toBeNull();
    expect(result.extras).toEqual({ dob: "2024-02-30T00:00:00.000Z" });
  });
});

import { ageStatusFor } from "./age.service";
import { assembleFields } from "./assembly.service";

describe("profile assembly", () => {
  const sourceRecords = new Map([
    [
      "record-a",
      {
        id: "record-a",
        dataSourceId: "marketing",
        lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
    [
      "record-b",
      {
        id: "record-b",
        dataSourceId: "sales",
        lastSeenAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    ],
    [
      "record-c",
      {
        id: "record-c",
        dataSourceId: "support",
        lastSeenAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    ],
  ]);
  const mappings = [
    {
      dataSourceId: "marketing",
      sourceField: "email",
      canonicalField: "EMAIL" as const,
      dataCategory: "CONTACT" as const,
    },
    {
      dataSourceId: "marketing",
      sourceField: "city",
      canonicalField: "CITY" as const,
      dataCategory: "LOCATION" as const,
    },
    {
      dataSourceId: "sales",
      sourceField: "email",
      canonicalField: "EMAIL" as const,
      dataCategory: "CONTACT" as const,
    },
    {
      dataSourceId: "sales",
      sourceField: "city",
      canonicalField: "CITY" as const,
      dataCategory: "LOCATION" as const,
    },
    {
      dataSourceId: "support",
      sourceField: "email",
      canonicalField: "EMAIL" as const,
      dataCategory: "CONTACT" as const,
    },
    {
      dataSourceId: "support",
      sourceField: "gender",
      canonicalField: "GENDER" as const,
      dataCategory: "DEMOGRAPHIC" as const,
    },
    {
      dataSourceId: "support",
      sourceField: "ignored",
      canonicalField: "IGNORE" as const,
      dataCategory: "OTHER" as const,
    },
  ];

  const records = [
    {
      id: "normal-a",
      sourceRecordId: "record-a",
      fullName: null,
      firstName: null,
      lastName: null,
      emailNormalized: "aman@example.test",
      phoneNormalized: null,
      customerId: null,
      dateOfBirth: null,
      addressLine1: null,
      city: "Pune",
      state: null,
      postalCode: null,
      country: null,
      extras: {},
    },
    {
      id: "normal-b",
      sourceRecordId: "record-b",
      fullName: null,
      firstName: null,
      lastName: null,
      emailNormalized: "aman@example.test",
      phoneNormalized: null,
      customerId: null,
      dateOfBirth: null,
      addressLine1: null,
      city: "Mumbai",
      state: null,
      postalCode: null,
      country: null,
      extras: {},
    },
    {
      id: "normal-c",
      sourceRecordId: "record-c",
      fullName: null,
      firstName: null,
      lastName: null,
      emailNormalized: "aman@example.test",
      phoneNormalized: null,
      customerId: null,
      dateOfBirth: null,
      addressLine1: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      extras: { gender: "NON_BINARY", ignored: "never" },
    },
  ];

  it("unions lineage, keeps every conflict, and selects the newest value as primary", () => {
    const fields = assembleFields(records, sourceRecords, mappings);
    expect(fields).toEqual([
      {
        canonicalField: "CITY",
        value: "Mumbai",
        dataCategory: "LOCATION",
        sourceIds: ["sales"],
        isPrimary: true,
        conflict: true,
      },
      {
        canonicalField: "CITY",
        value: "Pune",
        dataCategory: "LOCATION",
        sourceIds: ["marketing"],
        isPrimary: false,
        conflict: true,
      },
      {
        canonicalField: "EMAIL",
        value: "aman@example.test",
        dataCategory: "CONTACT",
        sourceIds: ["marketing", "sales", "support"],
        isPrimary: true,
        conflict: false,
      },
      {
        canonicalField: "GENDER",
        value: "NON_BINARY",
        dataCategory: "DEMOGRAPHIC",
        sourceIds: ["support"],
        isPrimary: true,
        conflict: false,
      },
    ]);
    expect(fields.every((field) => field.sourceIds.length > 0)).toBe(true);
  });

  it("is deterministic and uses source-record ID as the newest-record tie break", () => {
    const tiedSources = new Map(sourceRecords);
    tiedSources.set("record-a", {
      id: "record-a",
      dataSourceId: "marketing",
      lastSeenAt: new Date("2026-03-01T00:00:00.000Z"),
    });
    const fields = assembleFields(records, tiedSources, mappings);
    expect(fields).toEqual(
      assembleFields([...records].reverse(), tiedSources, mappings),
    );
    expect(
      fields.find((field) => field.canonicalField === "CITY" && field.isPrimary)
        ?.value,
    ).toBe("Pune");
  });
});

describe("DOB age derivation", () => {
  it("uses calendar dates at the eighteenth birthday boundary", () => {
    const dob = new Date("2008-08-30T00:00:00.000Z");
    expect(ageStatusFor(dob, new Date("2026-08-29T23:59:59.000Z"))).toBe(
      "CHILD",
    );
    expect(ageStatusFor(dob, new Date("2026-08-30T00:00:00.000Z"))).toBe(
      "ADULT",
    );
  });
});

import { ageStatusFor } from "./age.service";
import { assembleFields, displayNameFrom } from "./assembly.service";

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

  it("treats a whitespace-padded value as the same value, not a spurious conflict", () => {
    const paddedSources = new Map([
      [
        "record-x",
        {
          id: "record-x",
          dataSourceId: "marketing",
          lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      [
        "record-y",
        {
          id: "record-y",
          dataSourceId: "sales",
          lastSeenAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      ],
    ]);
    const paddedRecords = [
      {
        id: "n-x",
        sourceRecordId: "record-x",
        fullName: null,
        firstName: null,
        lastName: null,
        emailNormalized: null,
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
        id: "n-y",
        sourceRecordId: "record-y",
        fullName: null,
        firstName: null,
        lastName: null,
        emailNormalized: null,
        phoneNormalized: null,
        customerId: null,
        dateOfBirth: null,
        addressLine1: null,
        city: "  Pune  ",
        state: null,
        postalCode: null,
        country: null,
        extras: {},
      },
    ];
    const cityRows = assembleFields(
      paddedRecords,
      paddedSources,
      mappings,
    ).filter((field) => field.canonicalField === "CITY");
    expect(cityRows).toEqual([
      {
        canonicalField: "CITY",
        value: "Pune",
        dataCategory: "LOCATION",
        sourceIds: ["marketing", "sales"],
        isPrimary: true,
        conflict: false,
      },
    ]);
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

function nameRecord(overrides: {
  id: string;
  sourceRecordId: string;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  return {
    fullName: null,
    firstName: null,
    lastName: null,
    emailNormalized: null,
    phoneNormalized: null,
    customerId: null,
    dateOfBirth: null,
    addressLine1: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    extras: {},
    ...overrides,
  };
}

function nameSources(
  entries: ReadonlyArray<
    readonly [string, { id: string; dataSourceId: string; lastSeenAt: Date }]
  >,
) {
  return new Map(entries);
}

describe("displayName selection", () => {
  it("prefers an explicitly supplied full name over a composed one, even when the composed one is newer", () => {
    const records = [
      nameRecord({ id: "r1", sourceRecordId: "s-old", fullName: "Aman Verma" }),
      nameRecord({
        id: "r2",
        sourceRecordId: "s-new",
        firstName: "Aman",
        lastName: "V",
      }),
    ];
    const sources = nameSources([
      [
        "s-old",
        {
          id: "s-old",
          dataSourceId: "marketing",
          lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      [
        "s-new",
        {
          id: "s-new",
          dataSourceId: "sales",
          lastSeenAt: new Date("2026-06-01T00:00:00.000Z"),
        },
      ],
    ]);
    expect(displayNameFrom(records, sources)).toBe("Aman Verma");
  });

  it("composes firstName and lastName when no full name is supplied anywhere, newest wins", () => {
    const records = [
      nameRecord({
        id: "r1",
        sourceRecordId: "s1",
        firstName: "Asha",
        lastName: "Rao",
      }),
      nameRecord({
        id: "r2",
        sourceRecordId: "s2",
        firstName: "Asha",
        lastName: "R",
      }),
    ];
    const sources = nameSources([
      [
        "s1",
        {
          id: "s1",
          dataSourceId: "marketing",
          lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      [
        "s2",
        {
          id: "s2",
          dataSourceId: "sales",
          lastSeenAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      ],
    ]);
    expect(displayNameFrom(records, sources)).toBe("Asha R");
  });

  it("degrades gracefully to whichever single name part is supplied", () => {
    const sources = nameSources([
      [
        "s1",
        {
          id: "s1",
          dataSourceId: "marketing",
          lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    ]);
    expect(
      displayNameFrom(
        [nameRecord({ id: "r1", sourceRecordId: "s1", firstName: "Rahul" })],
        sources,
      ),
    ).toBe("Rahul");
    expect(
      displayNameFrom(
        [nameRecord({ id: "r2", sourceRecordId: "s1", lastName: "Mehta" })],
        sources,
      ),
    ).toBe("Mehta");
  });

  it("breaks a same-priority, same-timestamp tie deterministically by source-record ID, independent of row order", () => {
    const records = [
      nameRecord({ id: "r-a", sourceRecordId: "s-a", fullName: "Name A" }),
      nameRecord({ id: "r-b", sourceRecordId: "s-b", fullName: "Name B" }),
    ];
    const sources = nameSources([
      [
        "s-a",
        {
          id: "s-a",
          dataSourceId: "marketing",
          lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      [
        "s-b",
        {
          id: "s-b",
          dataSourceId: "sales",
          lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    ]);
    expect(displayNameFrom(records, sources)).toBe("Name A");
    expect(displayNameFrom([...records].reverse(), sources)).toBe("Name A");
  });

  it("returns null when no linked record carries any name", () => {
    const sources = nameSources([
      [
        "s1",
        {
          id: "s1",
          dataSourceId: "marketing",
          lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    ]);
    expect(
      displayNameFrom(
        [nameRecord({ id: "r1", sourceRecordId: "s1" })],
        sources,
      ),
    ).toBeNull();
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

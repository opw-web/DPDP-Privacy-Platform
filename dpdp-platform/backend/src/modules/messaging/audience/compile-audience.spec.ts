import { compileAudience } from "./compile-audience";
import { AudienceFilterError } from "./audience-filter.error";
import type { AudienceFilter } from "./audience-filter.types";

/**
 * Unit gate for the audience DSL compiler -- DPDP_MVP2_COMPLIANCE_OPERATIONS.md
 * §4.7. No database, no Nest bootstrap: `compileAudience` is a pure
 * function, called directly with a plain object, exactly as Task 11 will
 * call it.
 *
 * Coverage per the task brief: one test per field (all eleven), one test
 * per operator (all six: eq, neq, in, notIn, before, after), unknown
 * field/operator/depth-3/missing-purposeId all throw
 * `AudienceFilterError`, and an AND/OR combination at depth 2 compiles.
 */
describe("compileAudience", () => {
  const and = (rule: unknown): AudienceFilter =>
    ({ op: "AND", rules: [rule] }) as unknown as AudienceFilter;

  // ─────────────── one test per field ───────────────

  describe("field: consent", () => {
    it("compiles to a consentRecords relation filter keyed on purposeId + status", () => {
      const where = compileAudience(
        and({ field: "consent", purposeId: "purpose-1", operator: "eq", value: "UNKNOWN" }),
      );
      expect(where).toEqual({
        AND: [{ consentRecords: { some: { purposeId: "purpose-1", status: "UNKNOWN" } } }],
      });
    });
  });

  describe("field: hasEmail", () => {
    it("compiles true to an EMAIL PrincipalDataField 'some' filter", () => {
      const where = compileAudience(and({ field: "hasEmail", operator: "eq", value: true }));
      expect(where).toEqual({
        AND: [{ fields: { some: { canonicalField: "EMAIL" } } }],
      });
    });

    it("compiles false to an EMAIL PrincipalDataField 'none' filter", () => {
      const where = compileAudience(and({ field: "hasEmail", operator: "eq", value: false }));
      expect(where).toEqual({
        AND: [{ fields: { none: { canonicalField: "EMAIL" } } }],
      });
    });
  });

  describe("field: dataSource", () => {
    it("compiles to an active-link relation filter traversing normalizedRecord.sourceRecord.dataSourceId", () => {
      const where = compileAudience(
        and({ field: "dataSource", operator: "in", value: ["src-1"] }),
      );
      expect(where).toEqual({
        AND: [
          {
            links: {
              some: {
                status: "ACTIVE",
                normalizedRecord: { sourceRecord: { dataSourceId: { in: ["src-1"] } } },
              },
            },
          },
        ],
      });
    });
  });

  describe("field: breachAffected", () => {
    it("compiles to a breachAffectations relation filter on breachId", () => {
      const where = compileAudience(
        and({ field: "breachAffected", operator: "eq", value: "breach-1" }),
      );
      expect(where).toEqual({
        AND: [{ breachAffectations: { some: { breachId: "breach-1" } } }],
      });
    });
  });

  describe("field: requestStatus", () => {
    it("compiles to a requests relation filter on status", () => {
      const where = compileAudience(
        and({ field: "requestStatus", operator: "in", value: ["OPEN", "IN_PROGRESS"] }),
      );
      expect(where).toEqual({
        AND: [{ requests: { some: { status: { in: ["OPEN", "IN_PROGRESS"] } } } }],
      });
    });
  });

  describe("field: ageStatus", () => {
    it("compiles to a scalar ageStatus filter", () => {
      const where = compileAudience(and({ field: "ageStatus", operator: "eq", value: "ADULT" }));
      expect(where).toEqual({ AND: [{ ageStatus: "ADULT" }] });
    });
  });

  describe("field: country", () => {
    it("compiles to a PrincipalDataField COUNTRY filter", () => {
      const where = compileAudience(and({ field: "country", operator: "eq", value: "IN" }));
      expect(where).toEqual({
        AND: [{ fields: { some: { canonicalField: "COUNTRY", value: "IN" } } }],
      });
    });
  });

  describe("field: city", () => {
    it("compiles to a PrincipalDataField CITY 'in' filter", () => {
      const where = compileAudience(
        and({ field: "city", operator: "in", value: ["Mumbai", "Pune"] }),
      );
      expect(where).toEqual({
        AND: [
          { fields: { some: { canonicalField: "CITY", value: { in: ["Mumbai", "Pune"] } } } },
        ],
      });
    });
  });

  describe("field: lastContactAt", () => {
    it("compiles 'before' to a lastPrincipalContactAt lt filter", () => {
      const where = compileAudience(
        and({ field: "lastContactAt", operator: "before", value: "2023-01-01T00:00:00Z" }),
      );
      expect(where).toEqual({
        AND: [{ lastPrincipalContactAt: { lt: new Date("2023-01-01T00:00:00Z") } }],
      });
    });
  });

  describe("field: hasField", () => {
    it("compiles to a PrincipalDataField canonicalField filter", () => {
      const where = compileAudience(
        and({ field: "hasField", operator: "eq", value: "DATE_OF_BIRTH" }),
      );
      expect(where).toEqual({
        AND: [{ fields: { some: { canonicalField: "DATE_OF_BIRTH" } } }],
      });
    });
  });

  describe("field: erasureState", () => {
    it("compiles to an erasureTasks relation filter on state", () => {
      const where = compileAudience(
        and({ field: "erasureState", operator: "in", value: ["NOTICE_SENT"] }),
      );
      expect(where).toEqual({
        AND: [{ erasureTasks: { some: { state: { in: ["NOTICE_SENT"] } } } }],
      });
    });
  });

  // ─────────────── one test per operator ───────────────

  describe("operator: eq", () => {
    it("compiles a single-value equality filter", () => {
      const where = compileAudience(and({ field: "ageStatus", operator: "eq", value: "ADULT" }));
      expect(where).toEqual({ AND: [{ ageStatus: "ADULT" }] });
    });
  });

  describe("operator: neq", () => {
    it("compiles to the negated (relation 'none' / scalar 'not') shape", () => {
      const where = compileAudience(and({ field: "ageStatus", operator: "neq", value: "CHILD" }));
      expect(where).toEqual({ AND: [{ ageStatus: { not: "CHILD" } }] });
    });
  });

  describe("operator: in", () => {
    it("compiles a membership filter", () => {
      const where = compileAudience(
        and({ field: "ageStatus", operator: "in", value: ["ADULT", "CHILD"] }),
      );
      expect(where).toEqual({ AND: [{ ageStatus: { in: ["ADULT", "CHILD"] } }] });
    });
  });

  describe("operator: notIn", () => {
    it("compiles a non-membership filter", () => {
      const where = compileAudience(
        and({ field: "requestStatus", operator: "notIn", value: ["COMPLETED"] }),
      );
      expect(where).toEqual({
        AND: [{ requests: { none: { status: { in: ["COMPLETED"] } } } }],
      });
    });
  });

  describe("operator: before", () => {
    it("compiles a lt date filter", () => {
      const where = compileAudience(
        and({ field: "lastContactAt", operator: "before", value: "2024-06-01T00:00:00Z" }),
      );
      expect(where).toEqual({
        AND: [{ lastPrincipalContactAt: { lt: new Date("2024-06-01T00:00:00Z") } }],
      });
    });
  });

  describe("operator: after", () => {
    it("compiles a gt date filter", () => {
      const where = compileAudience(
        and({ field: "lastContactAt", operator: "after", value: "2024-06-01T00:00:00Z" }),
      );
      expect(where).toEqual({
        AND: [{ lastPrincipalContactAt: { gt: new Date("2024-06-01T00:00:00Z") } }],
      });
    });
  });

  // ─────────────── validation failures (all 400-mapped) ───────────────

  describe("validation", () => {
    it("throws AudienceFilterError for an unknown field", () => {
      expect(() =>
        compileAudience(and({ field: "notAllowed", operator: "eq", value: "x" })),
      ).toThrow(AudienceFilterError);
    });

    it("throws AudienceFilterError for an unknown operator", () => {
      expect(() =>
        compileAudience(and({ field: "ageStatus", operator: "greaterThan", value: "ADULT" })),
      ).toThrow(AudienceFilterError);
    });

    it("throws AudienceFilterError at nesting depth 3", () => {
      const depth3: AudienceFilter = {
        op: "AND",
        rules: [
          {
            op: "AND",
            rules: [
              {
                op: "AND",
                rules: [{ field: "ageStatus", operator: "eq", value: "ADULT" }],
              },
            ],
          },
        ],
      } as unknown as AudienceFilter;
      expect(() => compileAudience(depth3)).toThrow(AudienceFilterError);
    });

    it("throws AudienceFilterError for a consent rule missing purposeId", () => {
      expect(() =>
        compileAudience(and({ field: "consent", operator: "eq", value: "UNKNOWN" })),
      ).toThrow(AudienceFilterError);
    });

    it("throws AudienceFilterError for a malformed value (wrong type)", () => {
      expect(() =>
        compileAudience(and({ field: "hasEmail", operator: "eq", value: "yes" })),
      ).toThrow(AudienceFilterError);
    });

    it("throws AudienceFilterError for an operator not supported by a given field", () => {
      expect(() =>
        compileAudience(and({ field: "lastContactAt", operator: "eq", value: "2024-01-01" })),
      ).toThrow(AudienceFilterError);
    });
  });

  // ─────────────── nesting ───────────────

  describe("nesting", () => {
    it("compiles an AND/OR combination at depth 2", () => {
      const filter: AudienceFilter = {
        op: "AND",
        rules: [
          { field: "ageStatus", operator: "eq", value: "ADULT" },
          {
            op: "OR",
            rules: [
              { field: "city", operator: "eq", value: "Mumbai" },
              { field: "city", operator: "eq", value: "Pune" },
            ],
          },
        ],
      } as unknown as AudienceFilter;

      const where = compileAudience(filter);

      expect(where).toEqual({
        AND: [
          { ageStatus: "ADULT" },
          {
            OR: [
              { fields: { some: { canonicalField: "CITY", value: "Mumbai" } } },
              { fields: { some: { canonicalField: "CITY", value: "Pune" } } },
            ],
          },
        ],
      });
    });

    it("compiles the full §4.7 example filter without throwing", () => {
      const filter: AudienceFilter = {
        op: "AND",
        rules: [
          { field: "consent", purposeId: "purpose-1", operator: "eq", value: "UNKNOWN" },
          { field: "hasEmail", operator: "eq", value: true },
          { field: "dataSource", operator: "in", value: ["source-1"] },
          { field: "breachAffected", operator: "eq", value: "breach-1" },
          { field: "requestStatus", operator: "in", value: ["OPEN", "IN_PROGRESS"] },
          { field: "ageStatus", operator: "eq", value: "ADULT" },
          { field: "country", operator: "eq", value: "IN" },
          { field: "city", operator: "in", value: ["Mumbai", "Pune"] },
          { field: "lastContactAt", operator: "before", value: "2023-01-01T00:00:00Z" },
          { field: "hasField", operator: "eq", value: "DATE_OF_BIRTH" },
          { field: "erasureState", operator: "in", value: ["NOTICE_SENT"] },
        ],
      } as unknown as AudienceFilter;

      expect(() => compileAudience(filter)).not.toThrow();
      const where = compileAudience(filter);
      expect((where.AND as unknown[]).length).toBe(11);
    });
  });
});

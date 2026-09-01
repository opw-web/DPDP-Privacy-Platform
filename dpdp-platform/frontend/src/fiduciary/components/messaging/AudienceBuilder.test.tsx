import { describe, expect, it } from "vitest";
import { audienceRuleForField, buildAndAudienceFilter } from "./AudienceBuilder";

describe("AudienceBuilder DSL", () => {
  it("creates backend-compatible defaults for consent, email, and adult rules", () => {
    expect(buildAndAudienceFilter([
      { ...audienceRuleForField("consent"), purposeId: "purpose-marketing" },
      audienceRuleForField("hasEmail"),
      audienceRuleForField("ageStatus"),
    ])).toEqual({ op: "AND", rules: [
      { field: "consent", operator: "eq", value: "UNKNOWN", purposeId: "purpose-marketing" },
      { field: "hasEmail", operator: "eq", value: true },
      { field: "ageStatus", operator: "eq", value: "ADULT" },
    ] });
  });
});

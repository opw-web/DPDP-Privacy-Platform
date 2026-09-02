import { describe, expect, it } from "vitest";
import {
  audienceRuleForField,
  buildAndAudienceFilter,
  contactablePreviewCount,
  suppressedPreviewCount,
  type AudiencePreview,
} from "./AudienceBuilder";

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

describe("AudienceBuilder preview honesty (defect 1)", () => {
  const preview = (over: Partial<AudiencePreview>): AudiencePreview => ({
    total: 1,
    withEmail: 1,
    portalOnly: 0,
    suppressedByConsent: 0,
    suppressedAsChild: 0,
    sample: [],
    ...over,
  });

  it("never reports a child-suppressed principal as contactable, matching the walkthrough's reproduction", () => {
    // Step 20's finding: total 1, all 1 suppressed as CHILD -- the panel
    // must not claim "1 people will be contacted".
    const result = preview({ total: 1, suppressedAsChild: 1 });
    expect(contactablePreviewCount(result)).toBe(0);
    expect(suppressedPreviewCount(result)).toBe(1);
  });

  it("subtracts consent and child suppression independently, never going negative", () => {
    expect(contactablePreviewCount(preview({ total: 10, suppressedByConsent: 4, suppressedAsChild: 3 }))).toBe(3);
    expect(contactablePreviewCount(preview({ total: 2, suppressedByConsent: 2, suppressedAsChild: 2 }))).toBe(0);
  });

  it("suppressed + contactable always reconciles to the matched total", () => {
    const result = preview({ total: 50, suppressedByConsent: 12, suppressedAsChild: 5 });
    expect(contactablePreviewCount(result) + suppressedPreviewCount(result)).toBe(result.total);
  });
});

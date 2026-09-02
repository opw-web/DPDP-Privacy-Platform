import { describe, expect, it } from "vitest";
import {
  buildCampaignPayload,
  campaignConfirmationText,
  consentRequestSubmissionBlocked,
  marketingSubmissionBlocked,
  pickDefaultBreachTemplate,
  type CampaignTemplate,
} from "./MessagingCampaignBuilderPage";

describe("campaign guardrails", () => {
  it("blocks MARKETING without a purpose, while other categories may omit it", () => {
    expect(marketingSubmissionBlocked("MARKETING", "")).toBe(true);
    expect(marketingSubmissionBlocked("MARKETING", "purpose-1")).toBe(false);
    expect(marketingSubmissionBlocked("GENERAL_NOTIFICATION", "")).toBe(false);
  });

  it("repeats the audience preview total in the send confirmation", () => {
    expect(campaignConfirmationText(123)).toContain("exactly 123 people");
  });

  it("requires a purpose and a published notice for a consent request", () => {
    expect(consentRequestSubmissionBlocked("CONSENT_REQUEST", "", "notice-1")).toBe(true);
    expect(consentRequestSubmissionBlocked("CONSENT_REQUEST", "purpose-1", "")).toBe(true);
    expect(consentRequestSubmissionBlocked("CONSENT_REQUEST", "purpose-1", "notice-1")).toBe(false);
  });

  it("sends the Step 15 composite audience and published-notice link using CreateCampaignDto's contract", () => {
    expect(buildCampaignPayload({
      name: "Marketing consent request",
      category: "CONSENT_REQUEST",
      subject: "Please choose",
      bodyMarkdown: "Read the notice and choose.",
      purposeId: "purpose-marketing",
      noticeId: "notice-published",
      breachId: "",
      audienceFilter: { op: "AND", rules: [
        { field: "consent", operator: "eq", value: "UNKNOWN", purposeId: "purpose-marketing" },
        { field: "hasEmail", operator: "eq", value: true },
        { field: "ageStatus", operator: "eq", value: "ADULT" },
      ] },
    })).toEqual({
      name: "Marketing consent request",
      category: "CONSENT_REQUEST",
      subject: "Please choose",
      bodyMarkdown: "Read the notice and choose.",
      purposeId: "purpose-marketing",
      noticeId: "notice-published",
      audienceFilter: { op: "AND", rules: [
        { field: "consent", operator: "eq", value: "UNKNOWN", purposeId: "purpose-marketing" },
        { field: "hasEmail", operator: "eq", value: true },
        { field: "ageStatus", operator: "eq", value: "ADULT" },
      ] },
    });
  });

  it("keeps BREACH_NOTICE compatible with its no-filter backend contract", () => {
    const payload = buildCampaignPayload({ name: "Breach", category: "BREACH_NOTICE", subject: "Alert", bodyMarkdown: "Details", purposeId: "", noticeId: "", breachId: "breach-1", audienceFilter: { op: "AND", rules: [] } });
    expect(payload).toMatchObject({ category: "BREACH_NOTICE", breachId: "breach-1" });
    expect(payload).not.toHaveProperty("audienceFilter");
  });
});

describe("BREACH_NOTICE template pre-fill (spec step 23: review a PRE-FILLED notice)", () => {
  const template = (over: Partial<CampaignTemplate>): CampaignTemplate => ({
    id: "tpl-1",
    code: "SOME_OTHER_CODE",
    name: "Some other template",
    category: "BREACH_NOTICE",
    subject: "s",
    bodyMarkdown: "b",
    ...over,
  });

  it("prefers the seeded BREACH_NOTIFICATION template when present", () => {
    const notification = template({ id: "tpl-seed", code: "BREACH_NOTIFICATION" });
    const other = template({ id: "tpl-other" });
    expect(pickDefaultBreachTemplate([other, notification])).toBe(notification);
  });

  it("falls back to the first BREACH_NOTICE template when no BREACH_NOTIFICATION-coded one exists", () => {
    const custom = template({ id: "tpl-custom" });
    expect(pickDefaultBreachTemplate([custom])).toBe(custom);
  });

  it("returns undefined when the org has no BREACH_NOTICE template at all", () => {
    expect(pickDefaultBreachTemplate([])).toBeUndefined();
  });
});


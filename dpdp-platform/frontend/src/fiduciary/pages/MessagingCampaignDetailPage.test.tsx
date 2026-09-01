import { describe, expect, it } from "vitest";
import { canApproveCampaign, canSendCampaign, campaignNoticeLinkText, shouldShowCampaignApproval } from "./MessagingCampaignDetailPage";
describe("campaign approval", () => { it("requires a different employee", () => { expect(canApproveCampaign("employee-1", "employee-1")).toBe(false); expect(canApproveCampaign("employee-1", "employee-2")).toBe(true); }); });
describe("campaign lifecycle actions", () => {
  it("offers approval only for a pending campaign to a different employee", () => {
    expect(shouldShowCampaignApproval("DRAFT", "employee-1", "employee-2")).toBe(false);
    expect(shouldShowCampaignApproval("PENDING_APPROVAL", "employee-1", "employee-1")).toBe(false);
    expect(shouldShowCampaignApproval("PENDING_APPROVAL", "employee-1", "employee-2")).toBe(true);
  });

  it("offers send for DRAFT and APPROVED campaigns, but not while approval is pending", () => {
    expect(canSendCampaign("DRAFT")).toBe(true);
    expect(canSendCampaign("APPROVED")).toBe(true);
    expect(canSendCampaign("PENDING_APPROVAL")).toBe(false);
    expect(canSendCampaign("SENT")).toBe(false);
  });
});
describe("campaign notice linkage", () => { it("shows the frozen published version for a consent request", () => { expect(campaignNoticeLinkText("CONSENT_REQUEST", "version-1")).toBe("Published notice version: version-1"); expect(campaignNoticeLinkText("MARKETING", "version-1")).toBeNull(); }); });

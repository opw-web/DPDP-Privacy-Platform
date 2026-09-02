import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { employeeLogin, employeeLogout } from "../../lib/auth";
import {
  canApproveCampaign,
  canSendCampaign,
  campaignNoticeLinkText,
  deliveredToNobody,
  MessagingCampaignDetailPage,
  recipientReasonText,
  shouldShowCampaignApproval,
  summarizeRecipientStatuses,
  type CampaignRecipient,
} from "./MessagingCampaignDetailPage";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

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

// D7: the render refusal (FAILED, with `failureReason` naming the missing
// Rule 7(1) element) and every suppression (`suppressReason`) must reach
// the operator -- these were previously computed nowhere and shown nowhere.
describe("D7 -- recipient status summary", () => {
  const recipient = (over: Partial<CampaignRecipient>): CampaignRecipient => ({
    id: "r1",
    dataPrincipalId: "p1",
    channel: "EMAIL",
    address: "a@example.org",
    status: "PENDING",
    suppressReason: null,
    failureReason: null,
    sentAt: null,
    ...over,
  });

  it("counts every terminal DeliveryStatus separately, not just delivered vs. not", () => {
    const counts = summarizeRecipientStatuses([
      recipient({ status: "DELIVERED" }),
      recipient({ status: "DELIVERED" }),
      recipient({ status: "FAILED" }),
      recipient({ status: "SUPPRESSED" }),
      recipient({ status: "PENDING" }),
    ]);
    expect(counts).toEqual({ delivered: 2, failed: 1, suppressed: 1, pending: 1, total: 5 });
  });

  it("flags a campaign that reached SENT but delivered to nobody", () => {
    const allFailed = summarizeRecipientStatuses([
      recipient({ status: "FAILED" }),
      recipient({ status: "SUPPRESSED" }),
    ]);
    expect(deliveredToNobody("SENT", allFailed)).toBe(true);

    const someDelivered = summarizeRecipientStatuses([
      recipient({ status: "DELIVERED" }),
      recipient({ status: "FAILED" }),
    ]);
    expect(deliveredToNobody("SENT", someDelivered)).toBe(false);

    // Still sending (recipients remain PENDING) -- not yet a verdict either way.
    expect(deliveredToNobody("SENDING", allFailed)).toBe(false);

    // No recipients at all (e.g. never sent) is not "delivered to nobody".
    expect(deliveredToNobody("SENT", summarizeRecipientStatuses([]))).toBe(false);
  });

  it("surfaces the renderer's failureReason for a FAILED recipient, naming the missing element", () => {
    expect(
      recipientReasonText(
        recipient({ status: "FAILED", failureReason: "Missing required Rule 7(1) element: nature of personal data affected" }),
      ),
    ).toBe("Missing required Rule 7(1) element: nature of personal data affected");
  });

  it("surfaces the suppression code for a SUPPRESSED recipient (the BR-13 evidence answer)", () => {
    expect(recipientReasonText(recipient({ status: "SUPPRESSED", suppressReason: "CHILD_MARKETING_PROHIBITED" }))).toBe(
      "CHILD_MARKETING_PROHIBITED",
    );
  });

  it("shows no reason for a delivered or still-pending recipient", () => {
    expect(recipientReasonText(recipient({ status: "DELIVERED" }))).toBeNull();
    expect(recipientReasonText(recipient({ status: "PENDING" }))).toBeNull();
  });
});

// Integration: the actual page, wired to a mocked GET .../recipients, must
// put the failure/suppression text and the delivered-to-nobody banner in
// front of the operator -- not just compute them.
describe("D7 -- MessagingCampaignDetailPage recipient surface", () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }

  function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/app/messaging/campaigns/c1"]}>
          <Routes>
            <Route path="/app/messaging/campaigns/:campaignId" element={<MessagingCampaignDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  afterEach(async () => {
    cleanup();
    try {
      await employeeLogout();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("shows the 114-recipients-missing-Rule-7(1) scenario: SENT campaign, zero delivered, every reason visible", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/employee/login")) {
        return Promise.resolve(jsonResponse({ accessToken: "employee-jwt", employee: { id: "e1", email: "dpo@example.org", fullName: "DPO" } }));
      }
      if (url.endsWith("/auth/employee/me")) {
        return Promise.resolve(jsonResponse({ id: "e1", email: "dpo@example.org", fullName: "DPO", organizationId: "org1", status: "ACTIVE", role: { id: "r1", code: "DPO", name: "DPO" }, permissions: ["CAN_SEND_MESSAGES", "CAN_SEND_BREACH_NOTICES"] }));
      }
      if (url.endsWith("/auth/employee/logout")) return Promise.resolve(jsonResponse({}));
      if (url.endsWith("/campaigns/c1")) {
        return Promise.resolve(jsonResponse({
          id: "c1", name: "Breach notice -- BR-000001", category: "BREACH_NOTICE", status: "SENT",
          recipientCount: 2, purposeId: null, noticeVersionId: null,
          createdByEmployeeId: "e2", approvedByEmployeeId: "e1",
        }));
      }
      if (url.endsWith("/campaigns/c1/recipients")) {
        return Promise.resolve(jsonResponse([
          {
            id: "rec-1", dataPrincipalId: "dp-1", channel: "EMAIL", address: "asha@example.org",
            status: "FAILED", suppressReason: null,
            failureReason: "Missing required Rule 7(1) element: nature of personal data affected",
            sentAt: "2026-09-01T10:00:00.000Z",
          },
          {
            id: "rec-2", dataPrincipalId: "dp-2", channel: "EMAIL", address: null,
            status: "SUPPRESSED", suppressReason: "CHILD_MARKETING_PROHIBITED",
            failureReason: null, sentAt: null,
          },
        ] satisfies CampaignRecipient[]));
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    await employeeLogin("dpo@example.org", "password");
    renderPage();

    expect(await screen.findByText("Breach notice -- BR-000001")).toBeInTheDocument();

    // The delivered-to-nobody banner -- the operator must not read this as a completed send.
    expect(await screen.findByRole("alert")).toHaveTextContent(/delivered to nobody/i);

    // Status breakdown: not "SENT" with no further detail.
    expect(screen.getByText("Delivered 0")).toBeInTheDocument();
    expect(screen.getByText("Failed 1")).toBeInTheDocument();
    expect(screen.getByText("Suppressed 1")).toBeInTheDocument();

    // The renderer's own message, naming the missing element, verbatim.
    expect(
      screen.getByText("Missing required Rule 7(1) element: nature of personal data affected"),
    ).toBeInTheDocument();

    // The suppression code -- the BR-13 evidence answer to "who, and why".
    expect(screen.getByText("CHILD_MARKETING_PROHIBITED")).toBeInTheDocument();
  });

  it("does not show the delivered-to-nobody banner when delivery actually succeeded", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/employee/login")) {
        return Promise.resolve(jsonResponse({ accessToken: "employee-jwt", employee: { id: "e1", email: "dpo@example.org", fullName: "DPO" } }));
      }
      if (url.endsWith("/auth/employee/me")) {
        return Promise.resolve(jsonResponse({ id: "e1", email: "dpo@example.org", fullName: "DPO", organizationId: "org1", status: "ACTIVE", role: { id: "r1", code: "DPO", name: "DPO" }, permissions: ["CAN_SEND_MESSAGES"] }));
      }
      if (url.endsWith("/auth/employee/logout")) return Promise.resolve(jsonResponse({}));
      if (url.endsWith("/campaigns/c2")) {
        return Promise.resolve(jsonResponse({
          id: "c2", name: "Marketing update", category: "MARKETING", status: "SENT",
          recipientCount: 1, purposeId: "purpose-1", noticeVersionId: null,
          createdByEmployeeId: "e2", approvedByEmployeeId: "e1",
        }));
      }
      if (url.endsWith("/campaigns/c2/recipients")) {
        return Promise.resolve(jsonResponse([
          { id: "rec-3", dataPrincipalId: "dp-3", channel: "EMAIL", address: "b@example.org", status: "DELIVERED", suppressReason: null, failureReason: null, sentAt: "2026-09-01T10:00:00.000Z" },
        ] satisfies CampaignRecipient[]));
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    await employeeLogin("dpo@example.org", "password");
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/app/messaging/campaigns/c2"]}>
          <Routes>
            <Route path="/app/messaging/campaigns/:campaignId" element={<MessagingCampaignDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Delivered 1")).toBeInTheDocument();
    expect(screen.queryByText(/delivered to nobody/i)).not.toBeInTheDocument();
  });
});

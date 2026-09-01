import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { employeeLogin, employeeLogout } from "../../lib/auth";
import { AppShell } from "../../components/shared/AppShell";
import { PrincipalEvidencePage, type PrincipalEvidenceFile } from "./PrincipalEvidencePage";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const evidence: PrincipalEvidenceFile = {
  principal: { id: "p1", reference: "DP-000001", displayName: "Asha", ageStatus: "ADULT" },
  organizationName: "Acme Retail",
  generatedAt: "2026-08-31T10:00:00.000Z",
  consentEvents: [
    {
      purposeId: "purpose-1",
      purposeCode: "ORDERS",
      purposeName: "Order fulfilment",
      fromStatus: null,
      toStatus: "GRANTED",
      channel: "PORTAL",
      noticeVersionId: "notice-version-1",
      noticeContentHash: "hash",
      actorType: "PRINCIPAL",
      actorLabel: "Asha",
      createdAt: "2026-08-31T09:00:00.000Z",
    },
  ],
  noticeVersionsShown: [
    {
      noticeVersionId: "notice-version-1",
      noticeCode: "PRIVACY",
      noticeName: "Privacy notice",
      version: 2,
      contentHash: "hash",
      publishedAt: "2026-08-01T00:00:00.000Z",
    },
  ],
  requests: [
    {
      id: "request-1",
      reference: "REQ-000001",
      type: "ACCESS",
      status: "COMPLETED",
      submittedAt: "2026-08-10T00:00:00.000Z",
      dueAt: "2026-09-10T00:00:00.000Z",
      completedAt: "2026-08-11T00:00:00.000Z",
      outcomeCode: "FULFILLED",
      outcome: "Report provided",
      rejectionReason: null,
      events: [],
    },
  ],
  messagesReceived: [],
  breachInclusions: [],
  governmentRequests: [],
  suppressedRequestCount: 0,
};

afterEach(async () => {
  cleanup();
  await employeeLogout();
  vi.restoreAllMocks();
});

describe("PrincipalEvidencePage", () => {
  it("loads all EV-03 sections through one batched evidence request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/employee/login")) {
        return Promise.resolve(jsonResponse({ accessToken: "employee-jwt", employee: { id: "e1", email: "dpo@example.org", fullName: "DPO" } }));
      }
      if (url.endsWith("/auth/employee/me")) {
        return Promise.resolve(jsonResponse({ id: "e1", email: "dpo@example.org", fullName: "DPO", organizationId: "org1", status: "ACTIVE", role: { id: "r1", code: "DPO", name: "DPO" }, permissions: ["CAN_VIEW_ALL_PERSONAL_DATA", "CAN_EXPORT_EVIDENCE"] }));
      }
      if (url.endsWith("/auth/employee/logout")) return Promise.resolve(jsonResponse({}));
      if (url.endsWith("/organization")) return Promise.resolve(jsonResponse({ id: "org1", name: "Acme Retail", timezone: "UTC" }));
      if (url.endsWith("/notifications")) return Promise.resolve(jsonResponse({ items: [], unreadCount: 0 }));
      if (url.endsWith("/principals/p1/evidence")) return Promise.resolve(jsonResponse(evidence));
      throw new Error(`Unexpected fetch to ${url}`);
    });

    await employeeLogin("dpo@example.org", "password");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/app/principals/p1/evidence"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/app/principals/:id/evidence" element={<PrincipalEvidencePage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Consent events" })).toBeInTheDocument();
    expect(screen.getByText(/order fulfilment/i)).toBeInTheDocument();
    expect(screen.getByText(/privacy notice/i)).toBeInTheDocument();
    expect(screen.getByText(/REQ-000001/i)).toBeInTheDocument();
    await waitFor(() => {
      const evidenceCalls = fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/principals/p1/evidence"));
      expect(evidenceCalls).toHaveLength(1);
    });
  });
});

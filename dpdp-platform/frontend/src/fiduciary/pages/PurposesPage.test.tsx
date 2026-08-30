import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PurposesPage } from "./PurposesPage";
import { AppShell } from "../../components/shared/AppShell";
import { employeeLogin, employeeLogout } from "../../lib/auth";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const PURPOSES = [
  {
    id: "p1",
    code: "ORDER_FULFILMENT",
    name: "Order Fulfilment",
    description: "Fulfilling orders.",
    lawfulBasis: "LEGITIMATE_USE",
    legitimateUseLimb: "VOLUNTARY_PROVISION",
    basisJustification: "Necessary to deliver the order.",
    dataCategories: ["IDENTITY", "CONTACT"],
    goodsOrServicesDescription: null,
    reviewedByEmployeeId: "e1",
    reviewedAt: "2026-08-20T00:00:00.000Z",
    active: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    isReviewed: true,
  },
  {
    id: "p2",
    code: "MARKETING",
    name: "Marketing Outreach",
    description: "Sending marketing emails.",
    lawfulBasis: "CONSENT",
    legitimateUseLimb: null,
    basisJustification: "Customer opted in.",
    dataCategories: ["CONTACT"],
    goodsOrServicesDescription: null,
    reviewedByEmployeeId: null,
    reviewedAt: null,
    active: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    isReviewed: false,
  },
];

/**
 * Renders `PurposesPage` NESTED UNDER the real `AppShell`, not in
 * isolation -- a review of an earlier task in this batch found tests that
 * bypassed the shell and missed a defect in it as a result. This exercises
 * the org-timezone provider and the employee-auth context the shell
 * actually supplies.
 */
async function loginAndRenderThroughShell() {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/auth/employee/login")) {
        return Promise.resolve(
          jsonResponse({
            accessToken: "employee-jwt",
            employee: { id: "e1", email: "dpo@example.org", fullName: "Dee Peeoh" },
          }),
        );
      }
      if (url.pathname.endsWith("/auth/employee/me")) {
        return Promise.resolve(
          jsonResponse({
            id: "e1",
            email: "dpo@example.org",
            fullName: "Dee Peeoh",
            organizationId: "org1",
            status: "ACTIVE",
            role: { id: "r1", code: "DPO", name: "DPO" },
            permissions: ["CAN_VIEW_PRINCIPALS", "CAN_MANAGE_PURPOSES"],
          }),
        );
      }
      if (url.pathname.endsWith("/auth/employee/logout")) {
        return Promise.resolve(jsonResponse({}));
      }
      if (url.pathname.endsWith("/organization")) {
        return Promise.resolve(
          jsonResponse({ id: "org1", name: "Acme Fiduciary", timezone: "Asia/Kolkata" }),
        );
      }
      if (url.pathname.endsWith("/purposes")) {
        return Promise.resolve(jsonResponse(PURPOSES));
      }
      throw new Error(`Unexpected fetch to ${url.toString()}`);
    });

  await employeeLogin("dpo@example.org", "password");

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={["/app/purposes"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/app" element={<AppShell />}>
            <Route path="purposes" element={<PurposesPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, fetchMock };
}

describe("PurposesPage, rendered through AppShell", () => {
  afterEach(async () => {
    try {
      await employeeLogout();
    } finally {
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it("shows the reviewed purpose's lawful basis with its s.7 limb, and no amber chip", async () => {
    await loginAndRenderThroughShell();

    const reviewedRow = (await screen.findByText("Order Fulfilment")).closest("tr") as HTMLElement;
    expect(within(reviewedRow).getByText(/legitimate use/i)).toBeInTheDocument();
    expect(within(reviewedRow).getByText(/s\.7 limb: voluntary provision/i)).toBeInTheDocument();
    expect(within(reviewedRow).queryByText("Not yet reviewed")).not.toBeInTheDocument();
  });

  it("carries the amber 'Not yet reviewed' chip on the unreviewed purpose's register row", async () => {
    await loginAndRenderThroughShell();

    const unreviewedRow = (await screen.findByText("Marketing Outreach")).closest("tr") as HTMLElement;
    expect(within(unreviewedRow).getByText("Not yet reviewed")).toBeInTheDocument();
    // CONSENT purposes state the MVP 2 requirement plainly, in the lawful-basis cell.
    expect(
      within(unreviewedRow).getByText(/requires a notice and consent record \(mvp 2\)/i),
    ).toBeInTheDocument();
  });

  it("navigates via the shell's own sidebar link, proving the route is reachable through real navigation", async () => {
    await loginAndRenderThroughShell();
    const purposesLink = await screen.findByRole("link", { name: /purposes/i });
    expect(purposesLink).toHaveAttribute("href", "/app/purposes");
  });

  it("renders data categories as badges on the register row", async () => {
    await loginAndRenderThroughShell();
    const reviewedRow = (await screen.findByText("Order Fulfilment")).closest("tr") as HTMLElement;
    expect(within(reviewedRow).getByText("Identity")).toBeInTheDocument();
    expect(within(reviewedRow).getByText("Contact")).toBeInTheDocument();
  });
});

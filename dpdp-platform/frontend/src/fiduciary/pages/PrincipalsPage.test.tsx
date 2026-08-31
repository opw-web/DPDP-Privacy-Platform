import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrincipalsPage } from "./PrincipalsPage";
import { employeeLogin, employeeLogout } from "../../lib/auth";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const LIST_RESPONSE = {
  items: [
    {
      id: "p1",
      reference: "DP-000001",
      ageStatus: "ADULT",
      createdAt: "2026-08-01T00:00:00.000Z",
      displayName: "Aman Gupta",
      sources: [{ id: "src-mkt", name: "Marketing" }],
    },
    {
      id: "p2",
      reference: "DP-000002",
      ageStatus: "CHILD",
      createdAt: "2026-08-02T00:00:00.000Z",
      displayName: null,
      sources: [],
    },
  ],
  page: 1,
  pageSize: 25,
};

interface Routes {
  onList?: (url: URL) => Response;
}

async function loginAndRender(routes: Routes = {}) {
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
            permissions: ["CAN_VIEW_PRINCIPALS"],
          }),
        );
      }
      if (url.pathname.endsWith("/auth/employee/logout")) {
        return Promise.resolve(jsonResponse({}));
      }
      if (url.pathname.endsWith("/principals")) {
        return Promise.resolve(routes.onList ? routes.onList(url) : jsonResponse(LIST_RESPONSE));
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
        initialEntries={["/app/principals"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/app/principals" element={<PrincipalsPage />} />
          <Route path="/app/principals/:id" element={<div>Principal detail shell</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, fetchMock };
}

describe("PrincipalsPage", () => {
  afterEach(async () => {
    // Unmount FIRST: `employeeLogout()` updates the shared auth store,
    // which `PermissionGate` (via `useSyncExternalStore`) would otherwise
    // re-render from outside any `act()` scope.
    cleanup();
    try {
      await employeeLogout();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("shows a skeleton loader while the search resolves, never a bare spinner", async () => {
    await loginAndRender();
    expect(screen.getByTestId("data-table-skeleton")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId("data-table-skeleton")).not.toBeInTheDocument();
    });
  });

  it("renders each row with its source badges and an age-status chip", async () => {
    await loginAndRender();

    const amanLink = await screen.findByRole("link", { name: "Aman Gupta" });
    expect(amanLink).toHaveAttribute("href", "/app/principals/p1");
    const amanRow = amanLink.closest("tr");
    expect(amanRow).not.toBeNull();
    expect(within(amanRow as HTMLElement).getByText("Marketing")).toBeInTheDocument();
    expect(within(amanRow as HTMLElement).getByText("Adult")).toBeInTheDocument();

    // A principal with no attributable name shows a reference fallback, not a blank cell, and no source chip.
    const fallbackLink = screen.getByRole("link", { name: "Principal DP-000002" });
    const fallbackRow = fallbackLink.closest("tr") as HTMLElement;
    expect(within(fallbackRow).getByText("Child")).toBeInTheDocument();
  });

  it("searches by the free-text query across name, email, phone and customer ID server-side", async () => {
    let capturedQuery: string | null = null;
    await loginAndRender({
      onList: (url) => {
        capturedQuery = url.searchParams.get("q");
        return jsonResponse(LIST_RESPONSE);
      },
    });
    const user = userEvent.setup();

    await screen.findByRole("link", { name: "Aman Gupta" });
    await user.type(screen.getByLabelText(/search principals/i), "aman");

    await waitFor(() => {
      expect(capturedQuery).toBe("aman");
    });
  });

  it("shows an explained empty state with a next action when nothing matches", async () => {
    await loginAndRender({ onList: () => jsonResponse({ items: [], page: 1, pageSize: 25 }) });

    expect(await screen.findByText(/no data principal has been assembled yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to data sources/i })).toHaveAttribute(
      "href",
      "/app/data-sources",
    );
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { InformationRequestsPage } from "./InformationRequestsPage";
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

/** The unfiltered/default page 1 -- a small stand-in for the live demo's
 * ~323 principals. Aman IS on this default page so existing behaviour
 * (select him with no search at all) keeps working. */
const DEFAULT_PRINCIPALS = {
  items: [
    { id: "p-aman", displayName: "Aman Kumar", reference: "REF-AMAN-001" },
    { id: "p-other", displayName: "Other Principal", reference: "REF-OTHER-002" },
  ],
  page: 1,
  pageSize: 25,
};

/** A principal who is NEVER on page 1 -- only reachable through
 * `GET /principals?q=...`. This is the fix-round-1 regression case: a
 * picker that only ever fetched page 1 could never find her. */
const FARAWAY_PRINCIPAL = { id: "p-faraway", displayName: "Priya Faraway", reference: "REF-FARAWAY-311" };

const CREATED_REQUEST = {
  id: "ir-1",
  reference: "IR-000001",
  requestingBody: "CENTRAL_GOVERNMENT",
  authorisedPersonRef: "Authorised Officer Rao",
  purposeCited: "Seventh Schedule para 3",
  receivedAt: "2026-09-01T00:00:00.000Z",
  responseDueAt: "2026-09-15T00:00:00.000Z",
  nonDisclosureDirected: true,
  nonDisclosurePermissionRef: "GOI/AUTH/2026/07",
  affectedPrincipalIds: ["p-aman"],
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <InformationRequestsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

interface MockRoutes {
  permissions?: string[];
  /** Sequential bodies returned for successive `GET /information-requests` calls; the last entry repeats. */
  listResponses?: unknown[][];
  createStatus?: number;
  createBody?: unknown;
  /** Extra `q=` search terms this test expects the principal picker to be searched with, and what each returns. */
  principalSearches?: Record<string, { items: typeof DEFAULT_PRINCIPALS.items; page: number; pageSize: number }>;
}

/** Same single-fetch-spy login convention as `DataSourceNewPage.test.tsx`. */
async function loginAndRender(routes: MockRoutes) {
  let listCall = 0;
  const responses = routes.listResponses ?? [[], [CREATED_REQUEST]];
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/auth/employee/login")) {
        return Promise.resolve(
          jsonResponse({
            accessToken: "employee-jwt",
            employee: { id: "e1", email: "dpo@example.org", fullName: "Dee Peeoh" },
          }),
        );
      }
      if (url.endsWith("/auth/employee/me")) {
        return Promise.resolve(
          jsonResponse({
            id: "e1",
            email: "dpo@example.org",
            fullName: "Dee Peeoh",
            organizationId: "org1",
            status: "ACTIVE",
            role: { id: "r1", code: "DPO", name: "DPO" },
            permissions: routes.permissions ?? ["CAN_CHANGE_COMPLIANCE_CONFIG"],
          }),
        );
      }
      if (url.endsWith("/auth/employee/logout")) {
        return Promise.resolve(jsonResponse({}));
      }
      if (url.includes("/principals?") && method === "GET") {
        const parsed = new URL(url, "http://localhost");
        const q = parsed.searchParams.get("q");
        if (q && routes.principalSearches?.[q]) {
          return Promise.resolve(jsonResponse(routes.principalSearches[q]));
        }
        if (q) {
          // A search term with no configured fixture matches nothing -- the
          // picker must show "no matches", never fall back to page 1.
          return Promise.resolve(jsonResponse({ items: [], page: 1, pageSize: 25 }));
        }
        return Promise.resolve(jsonResponse(DEFAULT_PRINCIPALS));
      }
      if (url.endsWith("/information-requests") && method === "GET") {
        const body = responses[Math.min(listCall, responses.length - 1)];
        listCall += 1;
        return Promise.resolve(jsonResponse(body));
      }
      if (url.endsWith("/information-requests") && method === "POST") {
        if (routes.createStatus && routes.createStatus >= 400) {
          return Promise.resolve(
            jsonResponse(routes.createBody ?? { message: "Rejected" }, routes.createStatus),
          );
        }
        return Promise.resolve(jsonResponse(routes.createBody ?? CREATED_REQUEST, 201));
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    },
  );

  await employeeLogin("dpo@example.org", "password");
  const result = renderPage();
  return { ...result, fetchMock };
}

/** Fills every field the DTO requires, leaving the non-disclosure toggle off unless the caller flips it. */
async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText(/requesting body/i), "CENTRAL_GOVERNMENT");
  await user.type(screen.getByLabelText(/authorised person reference/i), "Authorised Officer Rao");
  await user.type(screen.getByLabelText(/purpose \/ citation/i), "Seventh Schedule para 3");
  fireEvent.change(screen.getByLabelText(/^received$/i), { target: { value: "2026-09-01" } });
  fireEvent.change(screen.getByLabelText(/response due/i), { target: { value: "2026-09-15" } });
}

function postBody(calls: readonly [string | URL | Request, RequestInit?][]) {
  const postCall = calls.find(([input, init]) => {
    return String(input).endsWith("/information-requests") && init?.method === "POST";
  });
  return postCall ? JSON.parse(String(postCall[1]?.body)) : undefined;
}

describe("InformationRequestsPage create flow (Step 32)", () => {
  afterEach(async () => {
    // Unmount first: employeeLogout() updates the shared auth store, which
    // PermissionGate (via useSyncExternalStore) would otherwise re-render
    // from outside any act() scope (same discipline as DataSourceNewPage.test.tsx).
    cleanup();
    try {
      await employeeLogout();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("hides the create control for an employee without CAN_CHANGE_COMPLIANCE_CONFIG", async () => {
    await loginAndRender({ permissions: ["CAN_VIEW_AUDIT_LOG"] });
    await waitFor(() => expect(screen.queryByText(/board and government requests/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /record request/i })).not.toBeInTheDocument();
  });

  it("submits a POST /information-requests payload in the exact DTO shape and shows the new record", async () => {
    const user = userEvent.setup();
    const { fetchMock } = await loginAndRender({});

    await user.click(await screen.findByRole("button", { name: /record request/i }));
    await fillRequiredFields(user);

    // Turn on the non-disclosure direction and name Aman as the affected principal.
    await user.click(screen.getByRole("checkbox", { name: /non-disclosure direction/i }));
    await user.type(screen.getByLabelText(/authorisation reference/i), "GOI/AUTH/2026/07");
    await user.click(await screen.findByRole("checkbox", { name: /aman kumar/i }));

    await user.click(screen.getByRole("button", { name: /save request/i }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());

    const body = postBody(fetchMock.mock.calls);
    expect(body).toEqual({
      requestingBody: "CENTRAL_GOVERNMENT",
      authorisedPersonRef: "Authorised Officer Rao",
      purposeCited: "Seventh Schedule para 3",
      receivedAt: new Date("2026-09-01").toISOString(),
      responseDueAt: new Date("2026-09-15").toISOString(),
      nonDisclosureDirected: true,
      nonDisclosurePermissionRef: "GOI/AUTH/2026/07",
      affectedPrincipalIds: ["p-aman"],
    });

    // The list refetch after invalidation shows the newly created record.
    expect(await screen.findByText("IR-000001")).toBeInTheDocument();
  });

  it("still POSTs when the non-disclosure permission reference is left blank, and shows the server's cited Rule 23(2) rejection verbatim (fix round 2, Critical)", async () => {
    const user = userEvent.setup();
    // The exact text `InformationRequestsService.assertDirectionHasAuthorisation`
    // throws (RULE_23_NON_DISCLOSURE_CITATION included) -- the operator must
    // see this, not a generic client-composed sentence. A client-side gate
    // on this field would swallow it; the form must never do that.
    const citedMessage =
      "A non-disclosure direction requires nonDisclosurePermissionRef (its authorisation reference). " +
      "DPDP Rules, 2025 -- Rule 23(2): where the Central Government directs that information or a " +
      "class of information shall not be disclosed by a Data Fiduciary to a Data Principal, the " +
      "direction and its authorisation must be recorded.";
    const { fetchMock } = await loginAndRender({
      createStatus: 400,
      createBody: { message: citedMessage },
    });

    await user.click(await screen.findByRole("button", { name: /record request/i }));
    await fillRequiredFields(user);
    await user.click(screen.getByRole("checkbox", { name: /non-disclosure direction/i }));
    // Deliberately leave the authorisation reference blank -- this must
    // still reach the server, not be blocked client-side.

    await user.click(screen.getByRole("button", { name: /save request/i }));

    // The POST IS sent -- this is the assertion fix round 1 had backwards.
    await waitFor(() => expect(postBody(fetchMock.mock.calls)).toBeDefined());
    const body = postBody(fetchMock.mock.calls);
    expect(body.nonDisclosureDirected).toBe(true);
    expect(body.nonDisclosurePermissionRef).toBe("");

    // The server's cited rejection reaches the operator verbatim -- never
    // replaced by a generic client-composed sentence.
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(citedMessage));
    expect((toast.error as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toContain("Rule 23(2)");
  });

  it("surfaces a clear error toast when the API rejects the request", async () => {
    const user = userEvent.setup();
    await loginAndRender({
      createStatus: 400,
      createBody: {
        message:
          "A non-disclosure direction requires nonDisclosurePermissionRef (its authorisation reference).",
      },
    });

    await user.click(await screen.findByRole("button", { name: /record request/i }));
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /save request/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "A non-disclosure direction requires nonDisclosurePermissionRef (its authorisation reference).",
      ),
    );
  });

  it("keeps an already-selected principal selected when the search term changes and she drops out of the new result set", async () => {
    const user = userEvent.setup();
    const { fetchMock } = await loginAndRender({
      principalSearches: {
        faraway: { items: [FARAWAY_PRINCIPAL], page: 1, pageSize: 25 },
      },
    });

    await user.click(await screen.findByRole("button", { name: /record request/i }));
    await fillRequiredFields(user);

    // Select Aman from the default (unsearched) page.
    await user.click(await screen.findByRole("checkbox", { name: /aman kumar/i }));

    // Now search for someone else entirely -- Aman is not in this result set.
    await user.type(screen.getByLabelText(/affected data principals/i), "faraway");
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /priya faraway/i })).toBeInTheDocument());

    // Aman must still show as selected (in the persistent "Selected" list),
    // even though the current search result set no longer contains him.
    expect(screen.getByRole("checkbox", { name: /aman kumar/i })).toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: /priya faraway/i }));
    await user.click(screen.getByRole("button", { name: /save request/i }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const body = postBody(fetchMock.mock.calls);
    // Both survive: the one selected before the search, and the one found by it.
    expect(body.affectedPrincipalIds).toEqual(expect.arrayContaining(["p-aman", "p-faraway"]));
    expect(body.affectedPrincipalIds).toHaveLength(2);
  });

  it("finds and submits a principal who was never on page 1, by searching for her", async () => {
    const user = userEvent.setup();
    const { fetchMock } = await loginAndRender({
      principalSearches: {
        faraway: { items: [FARAWAY_PRINCIPAL], page: 1, pageSize: 25 },
      },
    });

    await user.click(await screen.findByRole("button", { name: /record request/i }));
    await fillRequiredFields(user);

    // Priya Faraway is not in DEFAULT_PRINCIPALS (the page-1 fixture) at all --
    // she can only be reached through the search box.
    expect(screen.queryByRole("checkbox", { name: /priya faraway/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/affected data principals/i), "faraway");
    await user.click(await screen.findByRole("checkbox", { name: /priya faraway/i }));

    await user.click(screen.getByRole("button", { name: /save request/i }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const body = postBody(fetchMock.mock.calls);
    // This is the assertion the original page-1-only picker could never satisfy.
    expect(body.affectedPrincipalIds).toEqual(["p-faraway"]);
  });
});

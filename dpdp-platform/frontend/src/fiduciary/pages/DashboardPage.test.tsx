import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardPage, type InventoryGap, type InventorySummary } from "./DashboardPage";
import { employeeLogin, employeeLogout } from "../../lib/auth";
import { AppShell } from "../../components/shared/AppShell";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const BASE_SUMMARY: InventorySummary = {
  sourceCount: 4,
  rawRecordCount: 12500,
  uniquePrincipalCount: 3000,
  matchedPrincipalCount: 2800,
  pendingReviewCount: 15,
  conflictCount: 6,
  unknownAgeStatusCount: 42,
  purposesWithoutReviewedLawfulBasisCount: 3,
  processorsWithoutContractCount: 2,
  recentAuditEvents: [
    {
      id: "ae1",
      action: "PERSONAL_DATA_VIEWED",
      actorType: "EMPLOYEE",
      actorLabel: "Dee Peeoh",
      resourceType: "DataPrincipal",
      resourceId: "p1",
      subjectPrincipalId: "p1",
      createdAt: "2026-08-29T10:00:00.000Z",
    },
  ],
};

const POPULATED_GAPS: InventoryGap[] = [
  {
    code: "CH-01",
    label: "Unknown age status",
    count: 42,
    explanation:
      "42 data principal(s) have an unknown age status. Without a declared or DOB-derived age " +
      "status, s.9 obligations toward children cannot be evidenced as tracked for these principals.",
  },
  {
    code: "LB-02",
    label: "Purposes without a reviewed lawful basis",
    count: 3,
    explanation:
      "3 processing purpose(s) have never had their lawful basis reviewed by an employee. Until " +
      "a purpose is marked reviewed, its s.4/s.7 lawful-basis record is not evidenced as checked.",
  },
  {
    code: "GO-02",
    label: "Processors without a contract",
    count: 2,
    explanation:
      "2 data processor(s) have no contract on file. s.8(2) permits engaging a processor only " +
      "under a valid contract; this platform supports recording that contract, and these " +
      "recipients do not yet have one recorded.",
  },
  {
    code: "GO-03",
    label: "Principals with a field conflict",
    count: 6,
    explanation:
      "6 data principal(s) have a field flagged with a source conflict (two sources disagree on " +
      "the same value). Accuracy and consistency of personal data cannot be evidenced for these " +
      "principals until the conflict is resolved.",
  },
];

const ZERO_GAPS: InventoryGap[] = POPULATED_GAPS.map((gap) => ({
  ...gap,
  count: 0,
  explanation: gap.explanation.replace(/^\d+/, "0"),
}));

/**
 * The forbidden-claim net (global constraint #8: "supports"/"evidences"/
 * "tracks" only). Every pattern here is a way a screen could assert the
 * organization "is compliant" rather than merely reporting a count -- the
 * test below scans the WHOLE rendered page against all of them, not one
 * hand-picked string.
 */
const FORBIDDEN_CLAIM_PATTERNS: RegExp[] = [
  /\bcompliant\b/i,
  /\bnon-compliant\b/i,
  /in compliance/i,
  /guarantees?\s+compliance/i,
  /ensures?\s+compliance/i,
  /proves?\s+compliance/i,
  /certified\s+compliant/i,
  /100%\s*compliant/i,
  /fully\s+compliant/i,
  /meets\s+all\s+(legal|statutory)\s+requirements/i,
  /satisfies\s+all\s+requirements/i,
  /all\s+clear/i,
  /great\s+job/i,
  /good\s+to\s+go/i,
  /you('|no| a)?re\s+compliant/i,
];

function assertNoComplianceClaim(container: HTMLElement) {
  const text = container.textContent ?? "";
  for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
    expect(text).not.toMatch(pattern);
  }
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

interface MockRoutes {
  summary?: InventorySummary;
  gaps?: InventoryGap[];
  permissions?: string[];
  orgTimezone?: string;
  onRopaCsv?: () => Response;
  onAccessLogCsv?: () => Response;
}

/** Mocks `fetch` for the given routes and logs the employee session in, without rendering anything -- for tests that need their own render tree (e.g. through `AppShell`). */
async function mockRoutesAndLogin(routes: MockRoutes) {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
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
          permissions: routes.permissions ?? ["CAN_VIEW_PRINCIPALS", "CAN_EXPORT_EVIDENCE"],
        }),
      );
    }
    if (url.endsWith("/auth/employee/logout")) {
      return Promise.resolve(jsonResponse({}));
    }
    if (url.endsWith("/organization")) {
      return Promise.resolve(
        jsonResponse({ id: "org1", name: "Acme Retail", timezone: routes.orgTimezone ?? "UTC" }),
      );
    }
    if (url.endsWith("/inventory/summary")) {
      return Promise.resolve(jsonResponse(routes.summary ?? BASE_SUMMARY));
    }
    if (url.endsWith("/inventory/gaps")) {
      return Promise.resolve(jsonResponse(routes.gaps ?? POPULATED_GAPS));
    }
    if (url.endsWith("/inventory/ropa.csv")) {
      return Promise.resolve(
        routes.onRopaCsv
          ? routes.onRopaCsv()
          : new Response("Purpose Code,Purpose Name\r\n", {
              status: 200,
              headers: { "Content-Type": "text/csv; charset=utf-8" },
            }),
      );
    }
    if (url.endsWith("/audit-events/access-log.csv")) {
      return Promise.resolve(
        routes.onAccessLogCsv
          ? routes.onAccessLogCsv()
          : new Response("Event ID,Sequence\r\n", {
              status: 200,
              headers: { "Content-Type": "text/csv; charset=utf-8" },
            }),
      );
    }
    throw new Error(`Unexpected fetch to ${url}`);
  });

  await employeeLogin("dpo@example.org", "password");
  return fetchMock;
}

async function loginAndRender(routes: MockRoutes) {
  const fetchMock = await mockRoutesAndLogin(routes);
  const result = renderDashboard();
  return { ...result, fetchMock };
}

describe("DashboardPage", () => {
  beforeEach(() => {
    // jsdom has no real object-URL implementation; the export flow calls
    // these, so stub them rather than letting them throw.
    URL.createObjectURL = vi.fn(() => "blob:mock-url");
    URL.revokeObjectURL = vi.fn();
    // jsdom does not implement navigation for a `blob:` href and logs a
    // "Not implemented" error the moment the export flow's synthetic
    // `anchor.click()` fires -- a real browser treats `download` as "save
    // this, don't navigate" but jsdom's `click()` doesn't know that.
    // Stubbing `click()` keeps the save-flow's own logic under test
    // (`saveBlob` still runs, the anchor still gets its `href`/`download`
    // set) without jsdom trying to act on a navigation it can't perform.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(async () => {
    // Unmount BEFORE logging out: `employeeLogout()` updates the shared
    // `employeeAuthStore`, and this file (unlike its siblings) sometimes
    // mounts `AppShell`, whose `useEmployeeAuth`-backed `<PermissionGate>`
    // would still be a subscribed listener at that moment if cleanup ran
    // second -- React would then warn about an update outside `act` for
    // an unmount-adjacent state change no assertion here cares about.
    try {
      cleanup();
      await employeeLogout();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("renders all nine spec-line-849 metrics from a mocked summary", async () => {
    await loginAndRender({ summary: BASE_SUMMARY, gaps: POPULATED_GAPS });

    await waitFor(() => {
      expect(screen.getByText("4")).toBeInTheDocument(); // source count
    });
    expect(screen.getByText("12,500")).toBeInTheDocument(); // raw records
    expect(screen.getByText("3,000")).toBeInTheDocument(); // unique principals
    expect(screen.getByText("2,800")).toBeInTheDocument(); // matched
    expect(screen.getByText("15")).toBeInTheDocument(); // pending review

    expect(screen.getByText(/connected sources/i)).toBeInTheDocument();
    expect(screen.getByText(/raw records/i)).toBeInTheDocument();
    expect(screen.getByText(/unique principals/i)).toBeInTheDocument();
    expect(screen.getByText(/matched principals/i)).toBeInTheDocument();
    expect(screen.getByText(/pending review/i)).toBeInTheDocument();
    expect(screen.getByText(/conflicts \(go-03\)/i)).toBeInTheDocument();
    expect(screen.getByText(/unknown age status \(ch-01\)/i)).toBeInTheDocument();
    expect(screen.getByText(/purposes without reviewed basis \(lb-02\)/i)).toBeInTheDocument();
    expect(screen.getByText(/processors without a contract \(go-02\)/i)).toBeInTheDocument();
  });

  it("links every stat to the screen that resolves it", async () => {
    await loginAndRender({ summary: BASE_SUMMARY, gaps: POPULATED_GAPS });

    await waitFor(() => {
      expect(screen.getByText(/unique principals/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/connected sources/i).closest("a")).toHaveAttribute(
      "href",
      "/app/data-sources",
    );
    expect(screen.getByText(/unique principals/i).closest("a")).toHaveAttribute(
      "href",
      "/app/principals",
    );
    expect(screen.getByText(/pending review/i).closest("a")).toHaveAttribute("href", "/app/review");
    expect(screen.getByText(/unknown age status \(ch-01\)/i).closest("a")).toHaveAttribute(
      "href",
      "/app/principals?ageStatus=UNKNOWN",
    );
    expect(
      screen.getByText(/purposes without reviewed basis \(lb-02\)/i).closest("a"),
    ).toHaveAttribute("href", "/app/purposes");
    expect(
      screen.getByText(/processors without a contract \(go-02\)/i).closest("a"),
    ).toHaveAttribute("href", "/app/registers");
  });

  it("renders the zero-gap state without claiming compliance", async () => {
    const { container } = await loginAndRender({
      summary: { ...BASE_SUMMARY, conflictCount: 0, unknownAgeStatusCount: 0, purposesWithoutReviewedLawfulBasisCount: 0, processorsWithoutContractCount: 0 },
      gaps: ZERO_GAPS,
    });

    expect(
      await screen.findByText(
        /0 data principal\(s\) have an unknown age status/i,
      ),
    ).toBeInTheDocument();
    // The unknown-age-status gap must name the s.9 obligation it bears on -- at zero count too.
    expect(
      screen.getByText(/s\.9 obligations toward children cannot be evidenced as tracked/i),
    ).toBeInTheDocument();
    assertNoComplianceClaim(container);
  });

  it("renders the populated-gap state, each card naming the obligation it bears on", async () => {
    const { container } = await loginAndRender({ summary: BASE_SUMMARY, gaps: POPULATED_GAPS });

    expect(
      await screen.findByText(/42 data principal\(s\) have an unknown age status/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/s\.9 obligations toward children cannot be evidenced as tracked/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/s\.8\(2\) permits engaging a processor/i)).toBeInTheDocument();
    expect(screen.getByText(/s\.4\/s\.7 lawful-basis record/i)).toBeInTheDocument();
    assertNoComplianceClaim(container);
  });

  it("a copy assertion: no rendered string on the page claims the company is compliant", async () => {
    const { container } = await loginAndRender({ summary: BASE_SUMMARY, gaps: POPULATED_GAPS });

    await waitFor(() => {
      expect(screen.getByText(/inventory dashboard/i)).toBeInTheDocument();
    });
    assertNoComplianceClaim(container);
  });

  it("the RoPA export button issues an authenticated request through employeeApiClient, not a bare anchor", async () => {
    const { fetchMock } = await loginAndRender({ summary: BASE_SUMMARY, gaps: POPULATED_GAPS });
    const user = userEvent.setup();

    const button = await screen.findByRole("button", { name: /export ropa/i });
    await user.click(button);

    await waitFor(() => {
      const ropaCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/inventory/ropa.csv"));
      expect(ropaCall).toBeDefined();
      const [, init] = ropaCall as [string, RequestInit];
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer employee-jwt");
      expect(init.method).toBe("GET");
    });
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("the access-log export button issues an authenticated request", async () => {
    const { fetchMock } = await loginAndRender({ summary: BASE_SUMMARY, gaps: POPULATED_GAPS });
    const user = userEvent.setup();

    const button = await screen.findByRole("button", { name: /export access log/i });
    await user.click(button);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) =>
        String(input).endsWith("/audit-events/access-log.csv"),
      );
      expect(call).toBeDefined();
      const [, init] = call as [string, RequestInit];
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer employee-jwt");
    });
  });

  it("shows a permission error, not a crash, when the server 403s an export despite the gate", async () => {
    await loginAndRender({
      summary: BASE_SUMMARY,
      gaps: POPULATED_GAPS,
      onRopaCsv: () => jsonResponse({ message: "Forbidden" }, 403),
    });
    const user = userEvent.setup();

    const button = await screen.findByRole("button", { name: /export ropa/i });
    await user.click(button);

    expect(await screen.findByRole("button", { name: /export ropa/i })).toBeInTheDocument();
    // Button returns to its normal label rather than getting stuck "Exporting...".
    expect(screen.queryByText(/exporting/i)).not.toBeInTheDocument();
  });

  it("hides the export buttons entirely when the actor lacks CAN_EXPORT_EVIDENCE (cosmetic gate)", async () => {
    await loginAndRender({
      summary: BASE_SUMMARY,
      gaps: POPULATED_GAPS,
      permissions: ["CAN_VIEW_PRINCIPALS"],
    });

    await waitFor(() => {
      expect(screen.getByText(/inventory dashboard/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /export ropa/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /export access log/i })).not.toBeInTheDocument();
  });

  it("renders the recent audit strip from the summary payload", async () => {
    await loginAndRender({ summary: BASE_SUMMARY, gaps: POPULATED_GAPS });

    expect(await screen.findByText(/dee peeoh/i)).toBeInTheDocument();
    expect(screen.getByText("PERSONAL_DATA_VIEWED")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view full audit log/i })).toHaveAttribute(
      "href",
      "/app/audit",
    );
  });

  it("shows an explained empty state, not a blank strip, when there is no audit activity yet", async () => {
    await loginAndRender({
      summary: { ...BASE_SUMMARY, recentAuditEvents: [] },
      gaps: POPULATED_GAPS,
    });

    expect(await screen.findByText(/no audit activity yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open audit log/i })).toBeInTheDocument();
  });

  /**
   * The rest of this file renders `<DashboardPage>` directly under a bare
   * `MemoryRouter`, bypassing `AppShell` entirely. That is deliberate for
   * most cases (it isolates the page from the shell's own query), but it
   * means none of the tests above ever exercise the two pieces of context
   * only `AppShell` actually supplies: `OrgTimezoneProvider` (so every
   * `<DateTime>` above has silently been falling back to its own "UTC"
   * default, never proving the org's real timezone reaches the render
   * boundary) and the live `useEmployeeAuth`-backed `<PermissionGate>`
   * wired through the shell's own tree. This test renders through the
   * real `AppShell` so a defect in that wiring cannot hide behind an
   * isolated render, per the batch's test-shape requirement.
   */
  it("renders through the real AppShell, converting the recent-audit timestamp in the org's own timezone and honouring the shell's permission gate", async () => {
    await mockRoutesAndLogin({
      summary: BASE_SUMMARY,
      gaps: POPULATED_GAPS,
      permissions: ["CAN_VIEW_PRINCIPALS"], // no CAN_EXPORT_EVIDENCE
      orgTimezone: "Asia/Kolkata",
    });

    // This test's purpose is verifying that AppShell's own context
    // (org timezone, the real PermissionGate) reaches DashboardPage --
    // not re-proving the fetch mechanics already covered above. So the
    // three queries this tree mounts (organization, inventory summary,
    // inventory gaps) are pre-seeded and frozen (`refetchOnMount: false,
    // staleTime: Infinity`): the tree renders already-settled data on
    // its very first paint, with no asynchronous state transition after
    // mount for this test to race against.
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, refetchOnMount: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(["organization"], {
      id: "org1",
      name: "Acme Retail",
      timezone: "Asia/Kolkata",
    });
    queryClient.setQueryData(["inventory", "summary"], BASE_SUMMARY);
    queryClient.setQueryData(["inventory", "gaps"], POPULATED_GAPS);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={["/app"]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/app" element={<DashboardPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // recentAuditEvents[0].createdAt is 2026-08-29T10:00:00.000Z. In UTC
    // (DateTime's own fallback) that renders "10:00"; only the org's real
    // timezone (Asia/Kolkata, UTC+5:30), fetched by AppShell and passed
    // down through OrgTimezoneProvider, renders "15:30". Finding this
    // proves the timezone actually came from the shell, not the fallback.
    expect(screen.getByText(/15:30/)).toBeInTheDocument();
    expect(screen.queryByText(/10:00/)).not.toBeInTheDocument();

    // The shell's own useEmployeeAuth-backed session lacks
    // CAN_EXPORT_EVIDENCE here, so the real <PermissionGate> in the tree
    // hides both export buttons -- not a page-local mock of the gate.
    expect(screen.queryByRole("button", { name: /export ropa/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /export access log/i })).not.toBeInTheDocument();

    // The shell's own nav renders too, confirming this really is a full
    // AppShell mount and not a stub standing in for it.
    expect(screen.getByRole("link", { name: /data sources/i })).toBeInTheDocument();
  });
});

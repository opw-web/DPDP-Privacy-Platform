import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuditPage } from "./AuditPage";
import { AppShell } from "../../components/shared/AppShell";
import { employeeLogin, employeeLogout } from "../../lib/auth";
import type { AuditEventListItem } from "../components/AuditEventRow";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// A non-UTC organization timezone, deliberately, so a passing assertion
// actually proves the org-timezone conversion happened rather than the
// display just coincidentally matching the raw UTC string.
const ORGANIZATION = { id: "org1", name: "Acme Retail", timezone: "Asia/Kolkata" };

const AUDIT_EVENT: AuditEventListItem = {
  id: "evt1",
  sequence: "42",
  actorType: "EMPLOYEE",
  actorId: "emp1",
  actorLabel: "Acme DPO",
  action: "EMPLOYEE_ROLE_CHANGED",
  resourceType: "Employee",
  resourceId: "emp2",
  subjectPrincipalId: null,
  metadata: { fromRoleId: "role-a", toRoleId: "role-b" },
  ipAddress: "203.0.113.7",
  userAgent: "Mozilla/5.0 (test agent)",
  createdAt: "2026-08-20T04:30:00.000Z",
};

interface MockRoutes {
  events?: AuditEventListItem[];
  permissions?: string[];
}

async function loginAndRenderThroughShell(routes: MockRoutes = {}) {
  const events = routes.events ?? [AUDIT_EVENT];
  const permissions = routes.permissions ?? ["CAN_VIEW_AUDIT_LOG", "CAN_EXPORT_EVIDENCE"];

  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/employee/login")) {
      return Promise.resolve(
        jsonResponse({
          accessToken: "employee-jwt",
          employee: { id: "actor1", email: "actor@example.org", fullName: "Actor" },
        }),
      );
    }
    if (url.endsWith("/auth/employee/me")) {
      return Promise.resolve(
        jsonResponse({
          id: "actor1",
          email: "actor@example.org",
          fullName: "Actor",
          organizationId: "org1",
          status: "ACTIVE",
          role: { id: "role1", code: "DPO", name: "DPO" },
          permissions,
        }),
      );
    }
    if (url.endsWith("/auth/employee/logout")) {
      return Promise.resolve(jsonResponse({}));
    }
    if (url.endsWith("/organization")) {
      return Promise.resolve(jsonResponse(ORGANIZATION));
    }
    if (url.includes("/audit-events?")) {
      return Promise.resolve(
        jsonResponse({ items: events, page: 1, pageSize: 25, totalCount: events.length }),
      );
    }
    if (url.includes("/audit-events/access-log.csv")) {
      return Promise.resolve(
        new Response("Event ID,Sequence\r\n", {
          status: 200,
          headers: { "Content-Type": "text/csv; charset=utf-8" },
        }),
      );
    }
    throw new Error(`Unexpected fetch to ${url}`);
  });

  await employeeLogin("actor@example.org", "password");

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Seeds the shell's own `["organization"]` query so its sidebar renders
  // synchronously on first paint, rather than racing this page's own
  // `["audit-events", ...]` query to settle a tick apart -- the source of
  // a harmless but noisy `act()` warning when two independent components'
  // queries resolve in different microtask turns.
  queryClient.setQueryData(["organization"], ORGANIZATION);
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/app/audit"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/app/audit" element={<AuditPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, fetchMock };
}

describe("AuditPage", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:mock-url");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(async () => {
    // Unmount FIRST: `employeeLogout()` updates the shared auth store,
    // which `PermissionGate`/`AppShell` (still mounted through the real
    // shell) would otherwise re-render from outside any `act()` scope.
    cleanup();
    try {
      await employeeLogout();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("renders the event timestamp converted to the organization's timezone, with the UTC instant in the tooltip", async () => {
    await loginAndRenderThroughShell();

    // 2026-08-20T04:30:00.000Z in Asia/Kolkata (+05:30) is 10:00 the same
    // day -- proves the shell's OrgTimezoneProvider actually reached this
    // page's <DateTime>, not just that some date string rendered.
    const timeElement = await screen.findByText(/20 aug 2026, 10:00/i);
    expect(timeElement.tagName.toLowerCase()).toBe("time");
    expect(timeElement).toHaveAttribute("dateTime", AUDIT_EVENT.createdAt);
  });

  it("expands a row's metadata on click, and collapses it again", async () => {
    await loginAndRenderThroughShell();
    const user = userEvent.setup();

    expect(screen.queryByText(/"fromRoleId"/)).not.toBeInTheDocument();

    const toggle = await screen.findByRole("button", { name: /show details/i });
    await user.click(toggle);

    expect(await screen.findByText(/"fromRoleId"/)).toBeInTheDocument();
    expect(screen.getByText(/"toRoleId"/)).toBeInTheDocument();
    // The opaque sequence string is displayed verbatim, never coerced through Number().
    expect(screen.getByText(AUDIT_EVENT.sequence)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /hide details/i }));
    expect(screen.queryByText(/"fromRoleId"/)).not.toBeInTheDocument();
  });

  it("passes subjectPrincipalId through to the access-log export request when filled in", async () => {
    const { fetchMock } = await loginAndRenderThroughShell();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/subject principal id \(optional\)/i), "principal-42");
    await user.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) =>
        String(input).includes("/audit-events/access-log.csv"),
      );
      expect(call).toBeDefined();
      expect(String(call?.[0])).toContain("subjectPrincipalId=principal-42");
    });
  });

  it("omits subjectPrincipalId from the export request when left blank", async () => {
    const { fetchMock } = await loginAndRenderThroughShell();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) =>
        String(input).includes("/audit-events/access-log.csv"),
      );
      expect(call).toBeDefined();
      expect(String(call?.[0])).not.toContain("subjectPrincipalId");
    });
  });

  it("renders no edit or delete affordance anywhere on the page -- the log is read-only", async () => {
    await loginAndRenderThroughShell();
    await screen.findByText(/20 aug 2026, 10:00/i);

    expect(screen.queryByRole("button", { name: /^edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^remove/i })).not.toBeInTheDocument();
  });

  it("hides the access-log export card from an actor without CAN_EXPORT_EVIDENCE", async () => {
    await loginAndRenderThroughShell({ permissions: ["CAN_VIEW_AUDIT_LOG"] });
    await screen.findByText(/20 aug 2026, 10:00/i);

    expect(screen.queryByRole("heading", { name: /access log export/i })).not.toBeInTheDocument();
  });

  it("shows an explained empty state with a next action when there are no events", async () => {
    await loginAndRenderThroughShell({ events: [] });

    expect(
      await screen.findByText(/no audit events have been recorded for this organization yet/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to dashboard/i })).toHaveAttribute("href", "/app");
  });
});

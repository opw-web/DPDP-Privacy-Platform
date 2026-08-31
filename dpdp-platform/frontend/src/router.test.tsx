import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouter } from "./router";
import { employeeLogin, employeeLogout, principalLogin, principalLogout } from "./lib/auth";

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

// Each test gets a fresh module graph (`vi.resetModules` + dynamic import)
// so the auth singletons in `lib/auth.ts` / `lib/api-client.ts` start at
// "idle" every time -- these guard tests must not depend on run order.
async function loadRouter() {
  const routerModule = await import("./router");
  const apiClientModule = await import("./lib/api-client");
  return {
    AppRouter: routerModule.AppRouter,
    employeeTokenStore: apiClientModule.employeeTokenStore,
    principalTokenStore: apiClientModule.principalTokenStore,
  };
}

function renderApp(AppRouter: ComponentType, initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]} future={FUTURE}>
      <AppRouter />
    </MemoryRouter>,
  );
}

function unauthenticatedRefresh() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));
}

/**
 * Integration-gate verification (dispatch Job 5): the six page tasks
 * (24-29) were each verified in isolation, rendering their own page
 * directly against a mocked API. Nobody had rendered `AppRouter` itself
 * and walked every one of the sixteen wired routes end to end. These two
 * describe blocks do exactly that, against a fully mocked API (no live
 * backend needed), and assert each route resolves to its OWN page
 * content -- not a blank body, not a redirect back to /login, and not an
 * uncaught render error.
 *
 * Placed BEFORE "AppRouter route guards" below deliberately: that block
 * calls `vi.resetModules()` in its own `beforeEach` and re-imports
 * `./router` / `./lib/api-client` dynamically to get fresh auth-store
 * singletons per test. Running after these two blocks is safe either
 * way (a reset starts a clean slate), but running BEFORE it keeps these
 * tests on the ordinary, once-per-file static import of `AppRouter` /
 * `lib/auth`'s singleton stores -- the exact same module graph
 * `AppShell`/`PortalShell` themselves run against -- with no dependency
 * on resetModules semantics at all.
 *
 * Every response below is either a realistic single entity (organization,
 * employee session, employee/role rows) or a deliberately EMPTY
 * collection -- this codebase's own repeated rule that "empty is legal,
 * never a guessed row" (spec, throughout) means an empty list is a fully
 * valid, intentionally-tested state for every list page here, not a
 * shortcut. The two `:id` detail routes are exercised against an id the
 * mock 404s, which exercises each detail page's own real "not found"
 * state (still a resolved page, not a blank one) rather than requiring a
 * second, separately-mocked full detail fixture only to prove the route
 * wires up.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ORGANIZATION = {
  id: "org1",
  name: "Acme Retail",
  legalName: "Acme Retail Private Limited",
  entityRole: "DATA_FIDUCIARY",
  country: "IN",
  timezone: "Asia/Kolkata",
  offersGoodsServicesInIndia: true,
  dpoName: "Acme DPO",
  dpoEmail: "dpo@acmeretail.demo",
  dpoPhone: "+91-9800000000",
  dpoIsIndiaBased: true,
  responsiblePersonName: null,
  responsiblePersonEmail: null,
  grievanceContactEmail: "grievance@acmeretail.demo",
  publicPrivacyPageUrl: "https://acmeretail.demo/privacy",
  isSignificantDataFiduciary: false,
  sdfNotifiedAt: null,
  sdfNotificationRef: null,
  thirdScheduleClass: "NONE",
  registeredUserCount: null,
  classDeclaredByEmployeeId: null,
  classDeclaredAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const ROLES = [{ id: "role-admin", code: "ADMIN", name: "Admin", isSystem: true }];
const EMPLOYEES = [
  {
    id: "emp1",
    email: "dpo@acmeretail.demo",
    fullName: "Acme DPO",
    roleId: "role-admin",
    status: "ACTIVE",
    lastLoginAt: "2026-08-20T10:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

/**
 * ONE mock covering every `/api/*` route any of the sixteen wired pages
 * (or `AppShell`/`PortalShell`) can reach on first render. Matched by
 * URL suffix/substring, most specific first (`/data-sources/ds-unknown`
 * before the bare list routes it could otherwise shadow).
 */
function installFetchMock() {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);

    // -- auth --
    if (url.endsWith("/auth/employee/login")) {
      return Promise.resolve(
        jsonResponse({
          accessToken: "employee-jwt",
          employee: { id: "emp1", email: "dpo@acmeretail.demo", fullName: "Acme DPO" },
        }),
      );
    }
    if (url.endsWith("/auth/employee/me")) {
      return Promise.resolve(
        jsonResponse({
          id: "emp1",
          email: "dpo@acmeretail.demo",
          fullName: "Acme DPO",
          organizationId: "org1",
          status: "ACTIVE",
          role: { id: "role-admin", code: "ADMIN", name: "Admin" },
          permissions: [
            "CAN_VIEW_PRINCIPALS",
            "CAN_MANAGE_DATA_SOURCES",
            "CAN_MANAGE_PURPOSES",
            "CAN_MANAGE_EMPLOYEES",
            "CAN_VIEW_AUDIT_LOG",
            "CAN_CHANGE_ORG_SETTINGS",
          ],
        }),
      );
    }
    if (url.endsWith("/auth/employee/logout")) {
      return Promise.resolve(jsonResponse({}));
    }
    if (url.endsWith("/auth/principal/login")) {
      return Promise.resolve(
        jsonResponse({
          accessToken: "principal-jwt",
          account: {
            id: "acct1",
            organizationId: "org1",
            dataPrincipalId: "p1",
            email: "principal@example.org",
            status: "ACTIVE",
            lastLoginAt: null,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        }),
      );
    }
    if (url.endsWith("/auth/principal/logout")) {
      return Promise.resolve(jsonResponse({}));
    }

    // -- org / employee console --
    if (url.endsWith("/organization")) {
      return Promise.resolve(jsonResponse(ORGANIZATION));
    }
    if (url.includes("/inventory/summary")) {
      return Promise.resolve(
        jsonResponse({
          sourceCount: 0,
          rawRecordCount: 0,
          uniquePrincipalCount: 0,
          matchedPrincipalCount: 0,
          pendingReviewCount: 0,
          conflictCount: 0,
          unknownAgeStatusCount: 0,
          purposesWithoutReviewedLawfulBasisCount: 0,
          processorsWithoutContractCount: 0,
          recentAuditEvents: [],
        }),
      );
    }
    if (url.includes("/inventory/gaps")) {
      return Promise.resolve(jsonResponse([]));
    }
    if (url.includes("/data-sources/ds-unknown")) {
      // Exercises the detail page's real "not found" state.
      return Promise.resolve(jsonResponse({ message: "Data source not found." }, 404));
    }
    if (url.endsWith("/data-sources")) {
      return Promise.resolve(jsonResponse([]));
    }
    if (url.includes("/purposes")) {
      return Promise.resolve(jsonResponse([]));
    }
    if (url.includes("/registers/")) {
      return Promise.resolve(jsonResponse([]));
    }
    if (url.includes("/principals/pr-unknown")) {
      // Exercises the detail page's real "not found" state.
      return Promise.resolve(jsonResponse({ message: "Principal not found." }, 404));
    }
    if (url.includes("/principals?")) {
      return Promise.resolve(jsonResponse({ items: [], page: 1, pageSize: 20 }));
    }
    if (url.includes("/match-candidates")) {
      return Promise.resolve(jsonResponse([]));
    }
    if (url.endsWith("/employees")) {
      return Promise.resolve(jsonResponse(EMPLOYEES));
    }
    if (url.endsWith("/roles")) {
      return Promise.resolve(jsonResponse(ROLES));
    }
    if (url.includes("/audit-events")) {
      return Promise.resolve(jsonResponse({ items: [], page: 1, pageSize: 20, totalCount: 0 }));
    }

    // -- principal portal --
    if (url.endsWith("/me/profile")) {
      return Promise.resolve(jsonResponse({ displayName: "Aman Gupta" }));
    }
    if (url.endsWith("/me/data")) {
      return Promise.resolve(jsonResponse([]));
    }
    if (url.endsWith("/me/sources")) {
      return Promise.resolve(jsonResponse([]));
    }
    if (url.endsWith("/me/recipients")) {
      return Promise.resolve(jsonResponse([]));
    }

    throw new Error(`Unexpected fetch to ${url}`);
  });
}

function renderAppAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]} future={FUTURE}>
        <AppRouter />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppRouter -- employee console routes resolve", () => {
  afterEach(async () => {
    // Unmount FIRST: `employeeLogout()` updates the shared auth store,
    // which `PermissionGate`/`AppShell` (mounted through the real shell
    // for every route below) would otherwise re-render from outside any
    // `act()` scope.
    cleanup();
    try {
      await employeeLogout();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("/app resolves to the dashboard", async () => {
    installFetchMock();
    await employeeLogin("dpo@acmeretail.demo", "password");
    renderAppAt("/app");
    expect(await screen.findByRole("heading", { name: "Inventory dashboard" })).toBeInTheDocument();
  });

  it("/app/data-sources resolves to the data sources list", async () => {
    installFetchMock();
    await employeeLogin("dpo@acmeretail.demo", "password");
    renderAppAt("/app/data-sources");
    expect(await screen.findByRole("heading", { name: "Data Sources" })).toBeInTheDocument();
  });

  it("/app/data-sources/new resolves to the connection wizard", async () => {
    installFetchMock();
    await employeeLogin("dpo@acmeretail.demo", "password");
    renderAppAt("/app/data-sources/new");
    expect(
      await screen.findByRole("heading", { name: "Connect a data source" }),
    ).toBeInTheDocument();
  });

  it("/app/data-sources/:id resolves to the detail page (its own real 'not found' state for an unknown id)", async () => {
    installFetchMock();
    await employeeLogin("dpo@acmeretail.demo", "password");
    renderAppAt("/app/data-sources/ds-unknown");
    expect(await screen.findByText("Data source not found")).toBeInTheDocument();
  });

  it("/app/purposes resolves to the purpose register", async () => {
    installFetchMock();
    await employeeLogin("dpo@acmeretail.demo", "password");
    renderAppAt("/app/purposes");
    expect(await screen.findByRole("heading", { name: "Purposes" })).toBeInTheDocument();
  });

  it("/app/registers resolves to the registers tab shell", async () => {
    installFetchMock();
    await employeeLogin("dpo@acmeretail.demo", "password");
    renderAppAt("/app/registers");
    expect(await screen.findByRole("heading", { name: "Registers" })).toBeInTheDocument();
  });

  it("/app/principals resolves to the principal search page", async () => {
    installFetchMock();
    await employeeLogin("dpo@acmeretail.demo", "password");
    renderAppAt("/app/principals");
    expect(await screen.findByRole("heading", { name: "Principals" })).toBeInTheDocument();
  });

  it("/app/principals/:id resolves to the detail page (its own real 'not found' state for an unknown id)", async () => {
    installFetchMock();
    await employeeLogin("dpo@acmeretail.demo", "password");
    renderAppAt("/app/principals/pr-unknown");
    expect(await screen.findByText("Principal not found")).toBeInTheDocument();
  });

  it("/app/review resolves to the review queue", async () => {
    installFetchMock();
    await employeeLogin("dpo@acmeretail.demo", "password");
    renderAppAt("/app/review");
    expect(await screen.findByRole("heading", { name: "Review queue" })).toBeInTheDocument();
  });

  it("/app/employees resolves to the employees list", async () => {
    installFetchMock();
    await employeeLogin("dpo@acmeretail.demo", "password");
    renderAppAt("/app/employees");
    expect(await screen.findByRole("heading", { name: "Employees" })).toBeInTheDocument();
  });

  it("/app/audit resolves to the audit log", async () => {
    installFetchMock();
    await employeeLogin("dpo@acmeretail.demo", "password");
    renderAppAt("/app/audit");
    expect(await screen.findByRole("heading", { name: /audit log/i })).toBeInTheDocument();
  });

  it("/app/settings resolves to organization settings", async () => {
    installFetchMock();
    await employeeLogin("dpo@acmeretail.demo", "password");
    renderAppAt("/app/settings");
    expect(
      await screen.findByRole("heading", { name: "Organization settings" }),
    ).toBeInTheDocument();
  });
});

describe("AppRouter -- principal portal routes resolve", () => {
  afterEach(async () => {
    cleanup();
    try {
      await principalLogout();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("/me resolves to the portal home", async () => {
    installFetchMock();
    await principalLogin("principal@example.org", "password");
    renderAppAt("/me");
    expect(await screen.findByRole("heading", { name: "Hello, Aman Gupta" })).toBeInTheDocument();
  });

  it("/me/data resolves to 'Your data'", async () => {
    installFetchMock();
    await principalLogin("principal@example.org", "password");
    renderAppAt("/me/data");
    expect(await screen.findByRole("heading", { name: "Your data" })).toBeInTheDocument();
  });

  it("/me/sources resolves to 'Where it came from'", async () => {
    installFetchMock();
    await principalLogin("principal@example.org", "password");
    renderAppAt("/me/sources");
    expect(await screen.findByRole("heading", { name: "Where it came from" })).toBeInTheDocument();
  });

  it("/me/recipients resolves to 'Who it's shared with'", async () => {
    installFetchMock();
    await principalLogin("principal@example.org", "password");
    renderAppAt("/me/recipients");
    expect(
      await screen.findByRole("heading", { name: "Who it's shared with" }),
    ).toBeInTheDocument();
  });
});

describe("AppRouter route guards", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects an unauthenticated visitor from /app to the employee login", async () => {
    unauthenticatedRefresh();
    const { AppRouter } = await loadRouter();
    renderApp(AppRouter, "/app");

    expect(await screen.findByRole("heading", { name: "DPDP Platform" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("redirects an unauthenticated visitor from /me to the principal login", async () => {
    unauthenticatedRefresh();
    const { AppRouter } = await loadRouter();
    renderApp(AppRouter, "/me");

    expect(await screen.findByText("Your Privacy Portal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("a principal session does not grant access to /app -- the employee guard never consults it", async () => {
    const fetchMock = unauthenticatedRefresh();
    const { AppRouter, principalTokenStore } = await loadRouter();

    // Simulate an already-signed-in principal in the SAME browser tab,
    // then visit /app while the employee refresh cookie is absent.
    principalTokenStore.set("principal-secret-token");
    renderApp(AppRouter, "/app");

    expect(await screen.findByRole("heading", { name: "DPDP Platform" })).toBeInTheDocument();
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain("/auth/principal");
      expect(String(call[0])).not.toContain("/api/me/");
    }
  });

  it("sends a mistyped /me/... sub-path to the principal login, not the employee /login, and never touches the employee realm", async () => {
    const fetchMock = unauthenticatedRefresh();
    const { AppRouter, employeeTokenStore } = await loadRouter();

    renderApp(AppRouter, "/me/this-page-does-not-exist");

    expect(await screen.findByText("Your Privacy Portal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();

    // The /me/* catch-all sits outside both auth boundaries and redirects
    // to /me/login, which IS inside PrincipalAuthBoundary -- so that
    // boundary legitimately bootstraps a principal session once the
    // redirect lands. A bare "no fetch at all" assertion would be too
    // strong (and was wrong: it fails against this correct behavior). The
    // property actually worth protecting is narrower: this path must
    // never bootstrap the EMPLOYEE realm or touch its token store --
    // that's the realm-leak this route exists to prevent.
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain("/auth/employee");
    }
    expect(employeeTokenStore.get()).toBeNull();
  });

  it("still runs the principal auth boundary for the real /me/login path (the catch-all doesn't shadow it)", async () => {
    const fetchMock = unauthenticatedRefresh();
    const { AppRouter } = await loadRouter();

    renderApp(AppRouter, "/me/login");

    expect(await screen.findByText("Your Privacy Portal")).toBeInTheDocument();
    // /me/login matches the REAL route (inside PrincipalAuthBoundary,
    // which always bootstraps on mount), not the plain, unguarded
    // catch-all -- so exactly one bootstrap call happens, to the
    // principal refresh endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/auth/principal/refresh");
  });
});

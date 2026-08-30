import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

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

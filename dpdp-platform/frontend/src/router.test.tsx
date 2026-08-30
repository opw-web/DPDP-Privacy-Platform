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
});

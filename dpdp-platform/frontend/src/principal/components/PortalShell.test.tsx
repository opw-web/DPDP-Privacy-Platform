import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PortalShell } from "./PortalShell";
import { DateTime } from "../../components/shared/DateTime";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Renders a page THROUGH `PortalShell`, the way a real user reaches it
 * (`/me/data` nested under the shell's `<Outlet>`) -- not the page in
 * isolation. `MeDataPage.test.tsx` et al. render their page directly and
 * so could never have caught a missing `OrgTimezoneProvider`: every
 * `<DateTime>` they render just silently fell back to the context's own
 * built-in "UTC" default, which reads as correct in a UTC-only test even
 * when the real cause -- no provider mounted at all -- is a bug.
 */
function renderThroughPortalShell(timestamp: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={["/me/data"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/me" element={<PortalShell />}>
            <Route path="data" element={<DateTime value={timestamp} />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const KNOWN_UTC_INSTANT = "2026-01-01T00:00:00.000Z";

describe("PortalShell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("converts a known UTC instant into the organization's timezone for every <DateTime> under it", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/me/profile")) {
        return Promise.resolve(
          jsonResponse({ displayName: "Aman Sharma", organizationTimezone: "Asia/Kolkata" }),
        );
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    renderThroughPortalShell(KNOWN_UTC_INSTANT);

    // Asia/Kolkata is UTC+5:30 -- midnight UTC on 1 Jan 2026 is 05:30 local.
    expect(await screen.findByText("01 Jan 2026, 05:30")).toBeInTheDocument();
    expect(screen.queryByText("01 Jan 2026, 00:00")).not.toBeInTheDocument();
  });

  it("falls back to UTC explicitly -- not a fabricated zone -- when the profile carries none yet", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/me/profile")) {
        return Promise.resolve(jsonResponse({ displayName: "Aman Sharma" }));
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    renderThroughPortalShell(KNOWN_UTC_INSTANT);

    expect(await screen.findByText("01 Jan 2026, 00:00")).toBeInTheDocument();
  });
});

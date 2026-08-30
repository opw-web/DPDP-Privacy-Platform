import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MeSourcesPage } from "./MeSourcesPage";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderMeSourcesPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <MeSourcesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("MeSourcesPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a plain-language list of the systems holding her data", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/me/sources")) {
        return Promise.resolve(
          jsonResponse([
            { id: "s1", name: "Marketing Database" },
            { id: "s2", name: "Sales CRM" },
          ]),
        );
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    renderMeSourcesPage();

    expect(await screen.findByText("Marketing Database")).toBeInTheDocument();
    expect(screen.getByText("Sales CRM")).toBeInTheDocument();
  });

  it("shows an explained empty state, not a blank page, when nothing is linked yet", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/me/sources")) {
        return Promise.resolve(jsonResponse([]));
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    renderMeSourcesPage();

    expect(await screen.findByText(/no systems linked yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to your portal/i })).toHaveAttribute(
      "href",
      "/me",
    );
  });
});

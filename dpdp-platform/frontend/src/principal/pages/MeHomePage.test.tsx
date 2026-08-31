import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MeHomePage } from "./MeHomePage";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderMeHomePage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <MeHomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Plainer-language check (spec requirement 1): no compliance vocabulary
 * leaks into a portal read by members of the public.
 */
const JARGON_PATTERNS: RegExp[] = [
  /data fiduciary/i,
  /lawful basis/i,
  /\bs\.\s?7\b/i,
  /\bprocessor\b/i,
];

function assertNoJargon(container: HTMLElement) {
  const text = container.textContent ?? "";
  for (const pattern of JARGON_PATTERNS) {
    expect(text).not.toMatch(pattern);
  }
}

describe("MeHomePage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("greets the signed-in principal by her resolved display name", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/me/profile")) {
        return Promise.resolve(jsonResponse({ displayName: "Aman Sharma" }));
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    renderMeHomePage();

    expect(await screen.findByText("Hello, Aman Sharma")).toBeInTheDocument();
  });

  it("greets plainly, with no fabricated name, when none has resolved yet", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/me/profile")) {
        return Promise.resolve(jsonResponse({ displayName: null }));
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    renderMeHomePage();

    expect(await screen.findByText("Hello")).toBeInTheDocument();
  });

  it("shows the Consents, Requests and Messages slots as visible 'Coming soon' -- never hidden", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/me/profile")) {
        return Promise.resolve(jsonResponse({ displayName: "Aman Sharma" }));
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    renderMeHomePage();
    await screen.findByText("Hello, Aman Sharma");

    expect(screen.getByText("Consents")).toBeInTheDocument();
    expect(screen.getByText("Requests")).toBeInTheDocument();
    expect(screen.getByText("Messages")).toBeInTheDocument();
    expect(screen.getAllByText("Coming soon")).toHaveLength(3);
  });

  it("links the three data-backed cards to their pages, and never hard-codes a per-tenant privacy contact", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/me/profile")) {
        return Promise.resolve(jsonResponse({ displayName: "Aman Sharma" }));
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    const { container } = renderMeHomePage();
    await screen.findByText("Hello, Aman Sharma");

    expect(screen.getByText("Your data").closest("a")).toHaveAttribute("href", "/me/data");
    expect(screen.getByText("Where it came from").closest("a")).toHaveAttribute(
      "href",
      "/me/sources",
    );
    expect(screen.getByText("Who it's shared with").closest("a")).toHaveAttribute(
      "href",
      "/me/recipients",
    );
    expect(screen.getByText("Privacy contacts")).toBeInTheDocument();
    // No email address or organization name is invented for this card.
    expect(container.textContent).not.toMatch(/@[\w-]+\.[\w-]+/);
    assertNoJargon(container);
  });
});

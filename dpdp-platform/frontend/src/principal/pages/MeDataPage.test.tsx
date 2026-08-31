import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MeDataPage } from "./MeDataPage";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderMeDataPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <MeDataPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const MOCK_PAYLOAD = [
  {
    dataCategory: "CONTACT",
    values: [
      {
        id: "f1",
        canonicalField: "EMAIL",
        value: "aman.sharma@gmail.com",
        isPrimary: true,
        conflict: false,
        updatedAt: "2026-08-01T00:00:00.000Z",
        sources: [
          { id: "s1", name: "Marketing Database" },
          { id: "s2", name: "Sales CRM" },
        ],
        purposes: ["Customer Support", "Order Fulfilment"],
      },
      {
        id: "f2",
        canonicalField: "PHONE",
        value: "98765 43210",
        isPrimary: true,
        conflict: false,
        updatedAt: "2026-08-01T00:00:00.000Z",
        sources: [{ id: "s3", name: "Support Desk" }],
        purposes: ["Purpose not configured"],
      },
    ],
  },
];

describe("MeDataPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders 'Held in' and 'Used for' lines from a mocked /me/data payload", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/me/data")) {
        return Promise.resolve(jsonResponse(MOCK_PAYLOAD));
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    renderMeDataPage();

    expect(await screen.findByText("aman.sharma@gmail.com")).toBeInTheDocument();
    expect(screen.getAllByText(/held in:/i)).toHaveLength(2);
    expect(screen.getByText("Marketing Database")).toBeInTheDocument();
    expect(screen.getByText("Sales CRM")).toBeInTheDocument();
    expect(screen.getByText(/used for: customer support, order fulfilment/i)).toBeInTheDocument();
  });

  it('shows "Purpose not configured" -- never a guessed purpose -- where none is attached', async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/me/data")) {
        return Promise.resolve(jsonResponse(MOCK_PAYLOAD));
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    renderMeDataPage();

    expect(await screen.findByText("98765 43210")).toBeInTheDocument();
    expect(screen.getByText(/used for: purpose not configured/i)).toBeInTheDocument();
  });

  it("groups values under plain-language category headings, not the raw enum spelling", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/me/data")) {
        return Promise.resolve(jsonResponse(MOCK_PAYLOAD));
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    renderMeDataPage();

    expect(await screen.findByText("Contact details")).toBeInTheDocument();
    expect(screen.queryByText("CONTACT")).not.toBeInTheDocument();
  });

  it("shows an explained empty state, not a blank page, when nothing is on file", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/me/data")) {
        return Promise.resolve(jsonResponse([]));
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    renderMeDataPage();

    expect(await screen.findByText(/nothing on file yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to your portal/i })).toHaveAttribute(
      "href",
      "/me",
    );
  });
});

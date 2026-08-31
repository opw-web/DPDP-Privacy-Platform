import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MeRecipientsPage } from "./MeRecipientsPage";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderMeRecipientsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <MeRecipientsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const MOCK_RECIPIENTS = [
  {
    id: "sa1",
    description: "Order and shipping details for delivery",
    dataCategories: ["CONTACT", "TRANSACTIONAL"],
    startedAt: "2026-01-15T00:00:00.000Z",
    endedAt: null,
    recipient: { id: "r1", name: "Speedy Logistics Pvt Ltd", type: "DATA_PROCESSOR", country: "IN" },
  },
];

describe("MeRecipientsPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders who her data has been shared with and a description of what", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/me/recipients")) {
        return Promise.resolve(jsonResponse(MOCK_RECIPIENTS));
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    renderMeRecipientsPage();

    expect(await screen.findByText("Speedy Logistics Pvt Ltd")).toBeInTheDocument();
    expect(screen.getByText("Order and shipping details for delivery")).toBeInTheDocument();
    expect(screen.getByText("Contact details")).toBeInTheDocument();
    expect(screen.getByText("Purchases and orders")).toBeInTheDocument();
  });

  it("never shows the raw recipient-type jargon (\"data processor\" / \"data fiduciary\")", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/me/recipients")) {
        return Promise.resolve(jsonResponse(MOCK_RECIPIENTS));
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    const { container } = renderMeRecipientsPage();
    await screen.findByText("Speedy Logistics Pvt Ltd");

    expect(container.textContent).not.toMatch(/data processor/i);
    expect(container.textContent).not.toMatch(/data fiduciary/i);
    expect(screen.getByText("A service this organization uses")).toBeInTheDocument();
  });

  it("shows an explained empty state, not a blank page, when nothing has been shared", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/me/recipients")) {
        return Promise.resolve(jsonResponse([]));
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    renderMeRecipientsPage();

    expect(await screen.findByText(/nothing shared yet/i)).toBeInTheDocument();
  });
});

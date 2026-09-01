import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { MeMessagesPage } from "./MeMessagesPage";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MeMessagesPage /></MemoryRouter></QueryClientProvider>);
}

describe("MeMessagesPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("pins a breach notice with a red badge and a pre-erasure notice with an amber badge and all three ways to stop it", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith("/notifications")) return Promise.resolve(new Response(JSON.stringify({ items: [
        { id: "ordinary", audience: "PRINCIPAL", title: "Welcome", body: "Hello", severity: "INFO", linkPath: null, campaignId: "campaign-1", readAt: null, createdAt: "2026-08-01T00:00:00.000Z" },
        { id: "breach", audience: "PRINCIPAL", title: "Security breach incident", body: "We are investigating.", severity: "CRITICAL", linkPath: "/me/messages?type=BREACH_NOTICE", campaignId: "campaign-2", readAt: null, createdAt: "2026-08-02T00:00:00.000Z" },
        { id: "erase", audience: "PRINCIPAL", title: "Your data is scheduled for erasure", body: "Your data will be erased.", severity: "WARNING", linkPath: "/me/messages?type=PRE_ERASURE_NOTICE", campaignId: null, readAt: null, createdAt: "2026-08-03T00:00:00.000Z" },
      ], unreadCount: 3 }), { headers: { "Content-Type": "application/json" } }));
      throw new Error(`Unexpected fetch to ${String(input)}`);
    });
    renderPage();
    const breachBadge = await screen.findByText("Breach alert");
    expect(breachBadge).toHaveClass("bg-red-600");
    const erasureBadge = screen.getByText("Erasure notice");
    expect(erasureBadge).toHaveClass("bg-amber-500");
    expect(screen.getByText("Log in to your account.")).toBeInTheDocument();
    expect(screen.getByText("Contact us about the purpose your data was collected for.")).toBeInTheDocument();
    expect(screen.getByText(/Exercise your rights, such as making a request/i)).toBeInTheDocument();
    expect(screen.getAllByText("Pinned important notice")).toHaveLength(2);
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});

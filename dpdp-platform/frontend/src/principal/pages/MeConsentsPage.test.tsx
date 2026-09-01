import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { MeConsentsPage } from "./MeConsentsPage";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MeConsentsPage /></MemoryRouter></QueryClientProvider>);
}

const PAYLOAD = {
  consents: [{
    id: "consent-1", purposeId: "purpose-1", status: "GRANTED", grantedAt: "2026-08-01T00:00:00.000Z", noticeId: "notice-1", noticeVersionId: "version-1",
    purpose: { id: "purpose-1", name: "Product updates", description: "Send you product updates." },
    history: [{ id: "event-1", toStatus: "GRANTED", createdAt: "2026-08-01T00:00:00.000Z" }],
  }],
  legitimateUses: [{ id: "use-1", name: "Prevent fraud", description: "Keep accounts safe.", legitimateUse: "We use this to prevent fraud." }],
};

describe("MeConsentsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("Check 9: Allow and Withdraw are reached in the same number of clicks from the consents screen linked from /me", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith("/me/consents")) return Promise.resolve(jsonResponse(PAYLOAD));
      throw new Error(`Unexpected fetch to ${String(input)}`);
    });
    renderPage();
    const purpose = await screen.findByText("Product updates");
    const card = purpose.closest("div.rounded-lg") ?? purpose.closest("div")!;
    if (!(card instanceof HTMLElement)) throw new Error("Consent card was not rendered");
    // Both direct controls are on the same card: after one navigation from /me,
    // each is reachable with zero further clicks. The withdrawal confirmation is
    // deliberately after, not before, reaching that equally prominent control.
    expect(within(card).getByRole("button", { name: "Allow" })).toBeVisible();
    expect(within(card).getByRole("button", { name: "Withdraw" })).toBeVisible();
  });

  it("Check 11: puts legitimate uses in a separate information section with no choice control", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith("/me/consents")) return Promise.resolve(jsonResponse(PAYLOAD));
      throw new Error(`Unexpected fetch to ${String(input)}`);
    });
    renderPage();
    const heading = await screen.findByRole("heading", { name: "Uses allowed by law" });
    const section = heading.closest("section")!;
    expect(within(section).getByText("Prevent fraud")).toBeInTheDocument();
    expect(within(section).queryByRole("button")).not.toBeInTheDocument();
    expect(within(section).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("opens the exact notice version and shows full consent history", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/me/consents")) return Promise.resolve(jsonResponse(PAYLOAD));
      if (url.endsWith("/me/notices/version-1")) return Promise.resolve(jsonResponse({ version: 4, bodyMarkdown: "The exact words shown to you." }));
      throw new Error(`Unexpected fetch to ${url}`);
    });
    renderPage();
    expect(await screen.findByText("Full history")).toBeInTheDocument();
    await userEvent.setup().click(await screen.findByRole("button", { name: "What you were shown" }));
    expect(await screen.findByText("The exact words shown to you.")).toBeInTheDocument();
    expect(screen.getByText(/version 4/i)).toBeInTheDocument();
  });

  it("uses the exact notice frozen by the delivered consent request when an UNKNOWN record has no notice", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const deliveredPayload = {
      consents: [{
        id: "consent-unknown",
        purposeId: "purpose-1",
        status: "UNKNOWN",
        noticeId: null,
        noticeVersionId: null,
        presentedNoticeId: "notice-shown",
        presentedNoticeVersionId: "version-shown",
        presentedCampaignId: "campaign-delivered",
        purpose: { id: "purpose-1", name: "Product updates" },
        events: [],
      }],
    };
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/me/consents") && init?.method !== "POST") return Promise.resolve(jsonResponse(deliveredPayload));
      if (url.endsWith("/me/notices/version-shown")) return Promise.resolve(jsonResponse({ version: 3, bodyMarkdown: "Frozen campaign notice." }));
      if (url.endsWith("/me/consents/purpose-1") && init?.method === "POST") {
        requests.push({ url, body: JSON.parse(String(init.body)) });
        return Promise.resolve(jsonResponse({ status: "GRANTED" }));
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });
    renderPage();

    await userEvent.setup().click(await screen.findByRole("button", { name: "What you were shown" }));
    expect(await screen.findByText("Frozen campaign notice.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Close" }));

    await userEvent.setup().click(screen.getByRole("button", { name: "Allow" }));
    expect(requests).toEqual([{
      url: expect.stringContaining("/me/consents/purpose-1"),
      body: {
        status: "GRANTED",
        noticeId: "notice-shown",
        evidence: { campaignId: "campaign-delivered" },
      },
    }]);
  });
});

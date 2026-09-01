import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { MeNominationPage } from "./MeNominationPage";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MeNominationPage /></MemoryRouter></QueryClientProvider>);
}

describe("MeNominationPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("says nomination is manual and saves it with the required PUT endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/me/nomination") && (!init?.method || init.method === "GET")) return Promise.resolve(new Response("null", { headers: { "Content-Type": "application/json" } }));
      if (url.endsWith("/me/nomination") && init?.method === "PUT") return Promise.resolve(new Response(JSON.stringify({ nomineeName: "Riya", relationship: "Sister", scope: "ALL_RIGHTS", activationCondition: "BOTH" }), { headers: { "Content-Type": "application/json" } }));
      throw new Error(`Unexpected request: ${url} ${init?.method ?? "GET"}`);
    });
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText(/manual employee workflow/i)).toBeInTheDocument();
    await user.type(await screen.findByLabelText("Full name"), "Riya");
    await user.type(screen.getByLabelText("Relationship to you"), "Sister");
    await user.click(screen.getByRole("button", { name: "Save nomination" }));
    expect(await screen.findByText("Your nomination has been saved.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/me\/nomination$/), expect.objectContaining({ method: "PUT" }));
  });
});

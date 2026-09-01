import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { principalApiClient } from "../../lib/api-client";
import { MeRequestsPage } from "./MeRequestsPage";

const request = {
  reference: "REQ-000042",
  type: "CORRECTION",
  status: "SUBMITTED",
  subject: "Correct my phone number",
  body: "Please correct the phone number on file.",
  submittedAt: "2026-08-01T00:00:00.000Z",
  dueAt: "2026-08-31T00:00:00.000Z",
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><MeRequestsPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("MeRequestsPage cross-portal polling", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it("picks up the request reference submitted from the portal within 20 seconds without refresh", async () => {
    let reads = 0;
    const get = vi.spyOn(principalApiClient, "get").mockImplementation((path) => {
      expect(path).toBe("/me/requests");
      reads += 1;
      return Promise.resolve((reads === 1 ? [] : [request]) as never);
    });

    renderPage();
    expect(await screen.findByText("No requests yet")).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });

    expect(get).toHaveBeenCalledTimes(2);
    const requestLink = screen.getByRole("link", { name: /REQ-000042/ });
    expect(requestLink).toHaveTextContent("Correct my data");
  });

  it("submits correction values in a non-empty body and preserves requested changes", async () => {
    const get = vi.spyOn(principalApiClient, "get").mockResolvedValue([] as never);
    const post = vi.spyOn(principalApiClient, "post").mockResolvedValue(request as never);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderPage();
    await screen.findByText("No requests yet");
    await user.click(screen.getByRole("radio", { name: /Correct my data/i }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(screen.getByLabelText("Field"), "Phone number");
    await user.type(screen.getByLabelText("Current value"), "+91 90000 11111");
    await user.type(screen.getByLabelText("Correct value"), "+91 90000 22222");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByText("Your request was sent")).toBeInTheDocument();
    expect(get).toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith("/me/requests", expect.objectContaining({
      type: "CORRECTION",
      body: 'Please correct the Phone number value from "+91 90000 11111" to "+91 90000 22222".',
      requestedChanges: {
        "Phone number": { from: "+91 90000 11111", to: "+91 90000 22222" },
      },
    }));
    const payload = post.mock.calls[0]?.[1] as { body: string };
    expect(payload.body.trim()).not.toBe("");
  });
});

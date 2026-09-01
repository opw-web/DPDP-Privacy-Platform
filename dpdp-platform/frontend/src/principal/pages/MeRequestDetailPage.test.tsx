import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { principalApiClient } from "../../lib/api-client";
import { MeRequestDetailPage } from "./MeRequestDetailPage";

const initial = {
  reference: "REQ-000042",
  type: "CORRECTION",
  status: "SUBMITTED",
  subject: "Correct my phone number",
  body: "Please correct the phone number on file.",
  submittedAt: "2026-08-01T00:00:00.000Z",
  dueAt: "2026-08-31T00:00:00.000Z",
  events: [{ id: "submitted", createdAt: "2026-08-01T00:00:00.000Z", toStatus: "SUBMITTED", visibleToPrincipal: true }],
};

const updated = {
  ...initial,
  status: "IN_PROGRESS",
  timeline: [
    { id: "submitted", createdAt: "2026-08-01T00:00:00.000Z", toStatus: "SUBMITTED", visibleToPrincipal: true },
    { id: "internal", createdAt: "2026-08-02T00:00:00.000Z", note: "Internal case note — do not disclose", visibleToPrincipal: false },
    { id: "visible", createdAt: "2026-08-02T00:00:00.000Z", note: "Your request is now being reviewed.", visibleToPrincipal: true },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/me/requests/REQ-000042"]}>
        <Routes><Route path="/me/requests/:ref" element={<MeRequestDetailPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("MeRequestDetailPage cross-portal polling", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it("updates the principal timeline within 20 seconds and filters internal notes", async () => {
    let reads = 0;
    const get = vi.spyOn(principalApiClient, "get").mockImplementation((path) => {
      expect(path).toBe("/me/requests/REQ-000042");
      reads += 1;
      return Promise.resolve((reads === 1 ? initial : updated) as never);
    });

    renderPage();
    expect(await screen.findByText("Status changed to SUBMITTED")).toBeInTheDocument();
    expect(screen.queryByText("Internal case note — do not disclose")).not.toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });

    expect(get).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Your request is now being reviewed.")).toBeInTheDocument();
    expect(screen.getByText("IN PROGRESS")).toBeInTheDocument();
    expect(screen.queryByText("Internal case note — do not disclose")).not.toBeInTheDocument();
  });
});

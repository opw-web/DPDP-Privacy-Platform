import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { employeeApiClient } from "../../lib/api-client";
import { RequestsPage } from "./RequestsPage";

const submittedRequest = {
  id: "request-42",
  reference: "REQ-000042",
  dataPrincipalId: "principal-1",
  type: "CORRECTION",
  status: "SUBMITTED",
  subject: "Correct my phone number",
  body: "Please correct the phone number on file.",
  requestedChanges: {},
  assignedEmployeeId: null,
  escalatedAt: null,
  ruleCodeSnapshot: "REQUEST_CORRECTION",
  ruleVersionSnapshot: 1,
  ruleBasisSnapshot: "ORG_POLICY",
  legalSourceSnapshot: "Organisation rule",
  submittedAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  dueAt: "2026-08-31T00:00:00.000Z",
  warningAt: "2026-08-24T00:00:00.000Z",
  completedAt: null,
  isOverdue: false,
  outcomeCode: null,
  outcome: null,
  rejectionReason: null,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><RequestsPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RequestsPage cross-portal polling", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it("shows a newly submitted principal request within the 20-second polling window without remounting", async () => {
    let reads = 0;
    const get = vi.spyOn(employeeApiClient, "get").mockImplementation((path) => {
      expect(path).toBe("/requests");
      reads += 1;
      return Promise.resolve((reads === 1 ? [] : [submittedRequest]) as never);
    });

    renderPage();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(screen.getByText("No rights requests")).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });

    expect(get).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("REQ-000042")).toBeInTheDocument();
    expect(screen.getByText("Correct my phone number")).toBeInTheDocument();
  });
});

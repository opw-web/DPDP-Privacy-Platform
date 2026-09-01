import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { RetentionPage } from "./RetentionPage";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("RetentionPage", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("prominently renders the deferred-by-floor release date and Rule 8(3) citation", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/retention/tasks")) return Promise.resolve(jsonResponse([{
        id: "task-1", dataPrincipalId: "p1", retentionPolicyId: null, trigger: "CONSENT_WITHDRAWN", state: "DEFERRED_RETENTION_FLOOR", evaluatedAt: "2026-08-01T00:00:00Z", preErasureNoticeDueAt: null, preErasureNoticeSentAt: null, erasureDueAt: "2027-08-01T00:00:00Z", retentionFloorUntil: "2027-08-01T00:00:00Z", legalHoldId: null, systemChecklist: [{ dataSourceId: "source-1", done: false, byEmployeeId: null, at: null }], processorChecklist: [], completedAt: null, completedByEmployeeId: null, cancelledReason: null, ruleCodeSnapshot: "RETENTION:LOG_FLOOR", ruleVersionSnapshot: 1,
      }]));
      if (path.endsWith("/retention/legal-holds")) return Promise.resolve(jsonResponse([]));
      throw new Error(`Unexpected fetch to ${String(input)}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MemoryRouter><RetentionPage /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText("DEFERRED_RETENTION_FLOOR")).toBeInTheDocument();
    expect(screen.getAllByText("Release date:").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rule 8\(3\)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/31 jul 2027|01 aug 2027/i).length).toBeGreaterThan(0);
  });
});

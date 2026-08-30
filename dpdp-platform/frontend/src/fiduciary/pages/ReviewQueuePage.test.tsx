import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { ReviewQueuePage } from "./ReviewQueuePage";
import { signalBadgeVariant, type MatchCandidateListItem } from "../components/CandidateComparison";
import { employeeLogin, employeeLogout } from "../../lib/auth";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CANDIDATE: MatchCandidateListItem = {
  id: "cand1",
  status: "PENDING",
  confidence: "HIGH",
  score: 0.92,
  createdAt: "2026-08-20T00:00:00.000Z",
  record: {
    normalizedRecordId: "nr1",
    sourceRecordId: "sr1",
    dataSourceId: "src1",
    fullName: "Aman Gupta",
    emailNormalized: "aman@gmail.com",
    phoneNormalized: "+919876543210",
    customerId: "CUST-1",
    postalCode: "400001",
    dateOfBirth: "1990-01-01",
  },
  principal: { dataPrincipalId: "p1", reference: "DP-000001", displayName: "Aman Gupta" },
  signals: [
    { canonicalField: "FULL_NAME", recordValue: "Aman Gupta", principalValue: "Aman Gupta", agreement: "AGREE" },
    {
      canonicalField: "EMAIL",
      recordValue: "aman@gmail.com",
      principalValue: "aman@gmail.com",
      agreement: "AGREE",
    },
    {
      canonicalField: "PHONE",
      recordValue: "+919876543210",
      principalValue: "+919876500000",
      agreement: "CONFLICT",
    },
    { canonicalField: "CUSTOMER_ID", recordValue: null, principalValue: null, agreement: "INSUFFICIENT_DATA" },
  ],
};

interface MockRoutes {
  candidates?: MatchCandidateListItem[];
  onConfirm?: () => Response;
  onReject?: () => Response;
}

async function loginAndRender(routes: MockRoutes = {}) {
  let currentCandidates = routes.candidates ?? [CANDIDATE];
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/employee/login")) {
      return Promise.resolve(
        jsonResponse({
          accessToken: "employee-jwt",
          employee: { id: "e1", email: "dpo@example.org", fullName: "Dee Peeoh" },
        }),
      );
    }
    if (url.endsWith("/auth/employee/me")) {
      return Promise.resolve(
        jsonResponse({
          id: "e1",
          email: "dpo@example.org",
          fullName: "Dee Peeoh",
          organizationId: "org1",
          status: "ACTIVE",
          role: { id: "r1", code: "DPO", name: "DPO" },
          permissions: ["CAN_RESOLVE_IDENTITIES"],
        }),
      );
    }
    if (url.endsWith("/auth/employee/logout")) {
      return Promise.resolve(jsonResponse({}));
    }
    if (url.includes("/match-candidates?status=PENDING")) {
      return Promise.resolve(jsonResponse(currentCandidates));
    }
    if (url.endsWith("/match-candidates/cand1/confirm")) {
      currentCandidates = [];
      return Promise.resolve(routes.onConfirm ? routes.onConfirm() : jsonResponse({ status: "CONFIRMED" }));
    }
    if (url.endsWith("/match-candidates/cand1/reject")) {
      currentCandidates = [];
      return Promise.resolve(routes.onReject ? routes.onReject() : jsonResponse({ status: "REJECTED" }));
    }
    throw new Error(`Unexpected fetch to ${url}`);
  });

  await employeeLogin("dpo@example.org", "password");

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ReviewQueuePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, fetchMock };
}

describe("signalBadgeVariant (the one place agreement becomes a colour)", () => {
  it("maps AGREE to the success variant, CONFLICT to destructive, and anything else to secondary", () => {
    expect(signalBadgeVariant("AGREE")).toBe("success");
    expect(signalBadgeVariant("CONFLICT")).toBe("destructive");
    expect(signalBadgeVariant("INSUFFICIENT_DATA")).toBe("secondary");
  });
});

describe("ReviewQueuePage", () => {
  afterEach(async () => {
    try {
      await employeeLogout();
    } finally {
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it("renders agreeing signals green and conflicting signals red", async () => {
    await loginAndRender();

    const agreeBadge = await screen.findAllByText("Agrees");
    expect(agreeBadge.length).toBeGreaterThan(0);
    expect(agreeBadge[0]).toHaveClass("bg-emerald-100");

    const conflictBadge = screen.getByText("Conflicts");
    expect(conflictBadge).toHaveClass("bg-destructive/15");
  });

  it("confirms a candidate: links the record and removes it from the queue on success", async () => {
    const { fetchMock } = await loginAndRender();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/confirm"))).toBe(true);
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/reversed with unmerge/i));
    });
    expect(await screen.findByText(/no match candidate is currently waiting for review/i)).toBeInTheDocument();
  });

  it("rejects a candidate without creating any link", async () => {
    await loginAndRender();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /reject/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/no link was created/i));
    });
  });

  it("shows an explained empty state with a next action when the queue is empty", async () => {
    await loginAndRender({ candidates: [] });
    expect(await screen.findByText(/no match candidate is currently waiting for review/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to dashboard/i })).toHaveAttribute("href", "/app");
  });
});

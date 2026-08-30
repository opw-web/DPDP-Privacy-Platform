import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { LinkedRecordsPanel } from "./LinkedRecordsPanel";
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

const SOURCE_RECORDS_RESPONSE = {
  principal: { id: "p1", reference: "DP-000001" },
  records: [
    {
      id: "lr1",
      dataSourceId: "src-support",
      sourceRecordKey: "sup-1",
      firstSeenAt: "2026-07-01T00:00:00.000Z",
      lastSeenAt: "2026-08-01T00:00:00.000Z",
      source: { id: "src-support", name: "Support" },
      normalizedRecordId: "nr-support",
      link: { confidence: "HIGH", createdAt: "2026-07-01T00:00:00.000Z" },
    },
  ],
};

interface MockRoutes {
  onUnmerge?: (body: unknown) => Response;
}

async function loginAndRender(routes: MockRoutes = {}) {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
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
            permissions: ["CAN_VIEW_ALL_PERSONAL_DATA", "CAN_RESOLVE_IDENTITIES"],
          }),
        );
      }
      if (url.endsWith("/auth/employee/logout")) {
        return Promise.resolve(jsonResponse({}));
      }
      if (url.endsWith("/principals/p1/source-records")) {
        return Promise.resolve(jsonResponse(SOURCE_RECORDS_RESPONSE));
      }
      if (url.endsWith("/principals/p1/unmerge")) {
        const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
        return Promise.resolve(
          routes.onUnmerge
            ? routes.onUnmerge(body)
            : jsonResponse({
                detachedLinkId: "lr1",
                previousDataPrincipalId: "p1",
                newDataPrincipalId: "p2",
                newDataPrincipalReference: "DP-000002",
              }),
        );
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

  await employeeLogin("dpo@example.org", "password");

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onUnmerged = vi.fn();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LinkedRecordsPanel principalId="p1" onUnmerged={onUnmerged} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, fetchMock, onUnmerged };
}

describe("LinkedRecordsPanel unmerge dialog", () => {
  afterEach(async () => {
    try {
      await employeeLogout();
    } finally {
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it("cannot be submitted without a typed reason", async () => {
    await loginAndRender();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /unmerge/i }));
    const submit = await screen.findByRole("button", { name: "Unmerge" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/reason \(required\)/i), "   ");
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/reason \(required\)/i), "Wrong person, different email");
    expect(submit).toBeEnabled();
  });

  it("submits the normalized record id and the typed reason, then calls onUnmerged and shows a non-destructive toast", async () => {
    const { fetchMock, onUnmerged } = await loginAndRender();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /unmerge/i }));
    await user.type(await screen.findByLabelText(/reason \(required\)/i), "test");
    await user.click(screen.getByRole("button", { name: "Unmerge" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) =>
        String(input).endsWith("/principals/p1/unmerge"),
      );
      expect(call).toBeDefined();
      const [, init] = call as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({
        normalizedRecordId: "nr-support",
        reason: "test",
      });
    });
    await waitFor(() => expect(onUnmerged).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/nothing was deleted/i));
  });

  it("never describes unmerge as deleting, replacing or overwriting a source record", async () => {
    await loginAndRender();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /unmerge/i }));

    const dialogText = screen.getByText(/detaches/i).textContent ?? "";
    // "never changed or deleted" is the correct, reassuring negation --
    // what's forbidden is describing the ACTION itself as a deletion,
    // replacement or overwrite (e.g. "this deletes...", "will replace...").
    expect(dialogText).toMatch(/never changed or deleted/i);
    expect(dialogText).not.toMatch(/\b(will|is going to|permanently) delet/i);
    expect(dialogText).not.toMatch(/\breplac(e|es|ed|ing)\b/i);
    expect(dialogText).not.toMatch(/\boverwrit(e|es|ing|ten)\b/i);
  });

  it("shows an error toast, not a crash, when the server rejects the unmerge", async () => {
    await loginAndRender({
      onUnmerge: () => jsonResponse({ message: "Only one linked record remains." }, 400),
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /unmerge/i }));
    await user.type(await screen.findByLabelText(/reason \(required\)/i), "test");
    await user.click(screen.getByRole("button", { name: "Unmerge" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Only one linked record remains.");
    });
  });
});

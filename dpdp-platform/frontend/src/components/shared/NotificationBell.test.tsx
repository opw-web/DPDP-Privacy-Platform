import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient } from "../../lib/api-client";
import type { NotificationListResponse } from "../../lib/mvp2-api";
import { NotificationBell } from "./NotificationBell";

function makeFakeApiClient(get: () => Promise<NotificationListResponse>): ApiClient {
  return {
    get: get as ApiClient["get"],
    post: vi.fn().mockResolvedValue(undefined),
    patch: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getBlob: vi.fn(),
  } as unknown as ApiClient;
}

function renderBell(apiClient: ApiClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <NotificationBell apiClient={apiClient} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const EMPTY: NotificationListResponse = { items: [], unreadCount: 0 };

describe("NotificationBell", () => {
  beforeEach(() => {
    // `shouldAdvanceTime` lets real setTimeout-based polling (Testing
    // Library's `waitFor`/`findBy*`) keep ticking against the fake clock
    // instead of deadlocking -- without it, `waitFor` schedules its own
    // poll via `setTimeout`, which is itself faked and never fires unless
    // manually advanced, so it hangs until the real (unfaked) test
    // timeout.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the unread count from GET /api/notifications", async () => {
    const getFn = vi.fn().mockResolvedValue({
      items: [
        {
          id: "n1",
          audience: "EMPLOYEE",
          title: "Request due soon",
          body: "REQ-042 is due in 2 days.",
          severity: "WARNING",
          linkPath: "/app/requests/REQ-042",
          campaignId: null,
          readAt: null,
          createdAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      unreadCount: 3,
    } satisfies NotificationListResponse);
    const apiClient = makeFakeApiClient(getFn);

    renderBell(apiClient);

    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
    });
    expect(getFn).toHaveBeenCalledTimes(1);
  });

  it("refetches on the 20s TanStack Query polling interval (spec line 901)", async () => {
    const getFn = vi.fn().mockResolvedValue(EMPTY);
    const apiClient = makeFakeApiClient(getFn);

    renderBell(apiClient);

    await waitFor(() => expect(getFn).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(getFn).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(getFn).toHaveBeenCalledTimes(3);
  });

  it("shows no unread badge and 'No notifications yet.' when the list is empty", async () => {
    const apiClient = makeFakeApiClient(vi.fn().mockResolvedValue(EMPTY));
    renderBell(apiClient);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByRole("button", { name: "Notifications" }).click();
    });
    expect(screen.getByText("No notifications yet.")).toBeInTheDocument();
  });
});

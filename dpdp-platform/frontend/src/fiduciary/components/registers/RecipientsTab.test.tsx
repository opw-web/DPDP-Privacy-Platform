import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecipientsTab } from "./RecipientsTab";
import { employeeLogin, employeeLogout } from "../../../lib/auth";

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const PROCESSOR_CONTRACT_MESSAGE =
  "A DATA_PROCESSOR recipient cannot be active without a valid contract on file (contractExists must be true) -- s.8(2).";

interface RouteHooks {
  onCreate?: () => Response;
}

async function loginAndRender(hooks: RouteHooks = {}) {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/auth/employee/login")) {
        return Promise.resolve(
          jsonResponse({
            accessToken: "employee-jwt",
            employee: { id: "e1", email: "dpo@example.org", fullName: "Dee Peeoh" },
          }),
        );
      }
      if (url.pathname.endsWith("/auth/employee/me")) {
        return Promise.resolve(
          jsonResponse({
            id: "e1",
            email: "dpo@example.org",
            fullName: "Dee Peeoh",
            organizationId: "org1",
            status: "ACTIVE",
            role: { id: "r1", code: "DPO", name: "DPO" },
            permissions: ["CAN_VIEW_PRINCIPALS", "CAN_MANAGE_REGISTERS"],
          }),
        );
      }
      if (url.pathname.endsWith("/auth/employee/logout")) {
        return Promise.resolve(jsonResponse({}));
      }
      if (url.pathname.endsWith("/registers/recipients") && (!init || init.method === undefined || init.method === "GET")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.pathname.endsWith("/registers/recipients") && init?.method === "POST") {
        return Promise.resolve(
          hooks.onCreate
            ? hooks.onCreate()
            : jsonResponse({ id: "r1", name: "Acme", type: "DATA_PROCESSOR", active: true }),
        );
      }
      throw new Error(`Unexpected fetch to ${url.toString()}`);
    });

  await employeeLogin("dpo@example.org", "password");

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RecipientsTab />
    </QueryClientProvider>,
  );
  return { ...result, fetchMock };
}

describe("RecipientsTab -- s.8(2) processor contract requirement", () => {
  afterEach(async () => {
    try {
      await employeeLogout();
    } finally {
      cleanup();
      vi.restoreAllMocks();
      toastError.mockClear();
      toastSuccess.mockClear();
    }
  });

  it("blocks activating a DATA_PROCESSOR without a contract, client-side, with the s.8(2) reason", async () => {
    const { fetchMock } = await loginAndRender();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /new recipient/i }));
    await user.type(screen.getByLabelText(/^name$/i), "Acme Cloud");
    await user.selectOptions(screen.getByLabelText(/^type$/i), "DATA_PROCESSOR");
    // "active" defaults to true, "contract on file" defaults to false --
    // this is already the blocked combination, no extra interaction needed.
    expect(screen.getByLabelText(/active \(currently engaged\)/i)).toBeChecked();
    expect(screen.getByLabelText(/a valid contract is on file/i)).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: /create recipient/i }));

    expect(await screen.findByText(PROCESSOR_CONTRACT_MESSAGE)).toBeInTheDocument();

    const postCalls = fetchMock.mock.calls.filter(([input, init]) => {
      const url = new URL(String(input));
      return url.pathname.endsWith("/registers/recipients") && (init as RequestInit | undefined)?.method === "POST";
    });
    expect(postCalls).toHaveLength(0);
  });

  it("allows submitting a DATA_PROCESSOR with a contract on file", async () => {
    await loginAndRender();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /new recipient/i }));
    await user.type(screen.getByLabelText(/^name$/i), "Acme Cloud");
    await user.selectOptions(screen.getByLabelText(/^type$/i), "DATA_PROCESSOR");
    await user.click(screen.getByLabelText(/a valid contract is on file/i));

    await user.click(screen.getByRole("button", { name: /create recipient/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it("surfaces the server's 400 verbatim if the s.8(2) rule is ever reached despite the client-side block", async () => {
    await loginAndRender({
      onCreate: () =>
        jsonResponse({ message: PROCESSOR_CONTRACT_MESSAGE, statusCode: 400 }, 400),
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /new recipient/i }));
    await user.type(screen.getByLabelText(/^name$/i), "Acme Cloud");
    await user.selectOptions(screen.getByLabelText(/^type$/i), "OTHER_DATA_FIDUCIARY");
    // Not a processor, so the client-side guard does not fire -- the request reaches the
    // (mocked) server, which is made to return the same 400 the real backend would.
    await user.click(screen.getByRole("button", { name: /create recipient/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(PROCESSOR_CONTRACT_MESSAGE));
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { EmployeesPage, shouldShowDemoCredentials } from "./EmployeesPage";
import { AppShell } from "../../components/shared/AppShell";
import { employeeApiClient } from "../../lib/api-client";
import { employeeLogin, employeeLogout } from "../../lib/auth";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ORGANIZATION = { id: "org1", name: "Acme Retail", timezone: "Asia/Kolkata" };

const ROLES = [
  { id: "role-admin", code: "ADMIN", name: "Admin", isSystem: true },
  { id: "role-auditor", code: "AUDITOR", name: "Auditor", isSystem: true },
];

const EMPLOYEES = [
  {
    id: "emp1",
    email: "dpo@acmeretail.demo",
    fullName: "Acme DPO",
    roleId: "role-admin",
    status: "ACTIVE",
    lastLoginAt: "2026-08-20T10:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

interface LoginOptions {
  permissions: string[];
  /** Status the mocked `POST /employees` (create) returns. Defaults to a real 403, matching the server's actual `@RequirePermission("CAN_MANAGE_EMPLOYEES")` behaviour for an actor who lacks it. */
  createEmployeeStatus?: number;
}

/** Mutated mid-test to change how a subsequent `PATCH /employees/:id` responds, without discarding the rest of the route table by replacing the whole mock implementation. */
interface PatchEmployeeStatusBox {
  value: number;
}

async function loginAndRenderThroughShell({ permissions, createEmployeeStatus = 403 }: LoginOptions) {
  const patchEmployeeStatus: PatchEmployeeStatusBox = { value: 200 };

  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/auth/employee/login")) {
      return Promise.resolve(
        jsonResponse({
          accessToken: "employee-jwt",
          employee: { id: "actor1", email: "actor@example.org", fullName: "Auditor Actor" },
        }),
      );
    }
    if (url.endsWith("/auth/employee/me")) {
      return Promise.resolve(
        jsonResponse({
          id: "actor1",
          email: "actor@example.org",
          fullName: "Auditor Actor",
          organizationId: "org1",
          status: "ACTIVE",
          role: { id: "role-auditor", code: "AUDITOR", name: "Auditor" },
          permissions,
        }),
      );
    }
    if (url.endsWith("/auth/employee/logout")) {
      return Promise.resolve(jsonResponse({}));
    }
    if (url.endsWith("/organization") && init?.method !== "PATCH") {
      return Promise.resolve(jsonResponse(ORGANIZATION));
    }
    if (url.endsWith("/roles")) {
      return Promise.resolve(jsonResponse(ROLES));
    }
    if (url.endsWith("/employees") && (!init || init.method === undefined || init.method === "GET")) {
      return Promise.resolve(jsonResponse(EMPLOYEES));
    }
    if (url.endsWith("/employees") && init?.method === "POST") {
      // The real `EmployeesController.create` is `@RequirePermission("CAN_MANAGE_EMPLOYEES")`
      // -- an actor without it gets exactly this 403, whether or not the UI happens to
      // have hidden the button that would normally trigger the call.
      return Promise.resolve(
        jsonResponse({ message: "Missing required permission: CAN_MANAGE_EMPLOYEES" }, createEmployeeStatus),
      );
    }
    if (/\/employees\/[^/]+$/.test(url) && init?.method === "PATCH") {
      if (patchEmployeeStatus.value !== 200) {
        return Promise.resolve(jsonResponse({ message: "Forbidden" }, patchEmployeeStatus.value));
      }
      const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      return Promise.resolve(jsonResponse({ ...EMPLOYEES[0], ...body }));
    }
    throw new Error(`Unexpected fetch to ${url}`);
  });

  await employeeLogin("actor@example.org", "password");

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Seeds the shell's own `["organization"]` query so its sidebar renders
  // synchronously on first paint, rather than racing this page's own
  // queries to settle a tick apart -- the source of a harmless but noisy
  // `act()` warning when two independent components' queries resolve in
  // different microtask turns.
  queryClient.setQueryData(["organization"], ORGANIZATION);
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={["/app/employees"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/app/employees" element={<EmployeesPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, fetchMock, patchEmployeeStatus };
}

describe("EmployeesPage", () => {
  afterEach(async () => {
    // Unmount FIRST: `employeeLogout()` updates the shared auth store,
    // which `PermissionGate`/`AppShell` (still mounted through the real
    // shell) would otherwise re-render from outside any `act()` scope.
    cleanup();
    try {
      await employeeLogout();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("hides every write affordance from an auditor, rendered through the real AppShell", async () => {
    await loginAndRenderThroughShell({ permissions: ["CAN_VIEW_AUDIT_LOG"] });

    // The page itself is reachable and shows the list -- it's specifically
    // the write affordances that must be absent, not the whole page.
    expect(await screen.findByText("Acme DPO")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: /add employee/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reset password/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /disable/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enable/i })).not.toBeInTheDocument();
    // The role cell must fall back to plain text, never an editable <select>.
    expect(screen.queryByRole("combobox", { name: /role for/i })).not.toBeInTheDocument();
    expect(screen.getByText("No access")).toBeInTheDocument();

    // Proves this is rendered through the real shell, not the page in isolation:
    // the sidebar (AppShell's own markup) is present and shows the org name it
    // fetched from `GET /api/organization`.
    expect(screen.getByText("Acme Retail")).toBeInTheDocument();
  });

  it("still gets a 403 from the server if the hidden create-employee action is forged directly against the API client", async () => {
    await loginAndRenderThroughShell({ permissions: ["CAN_VIEW_AUDIT_LOG"] });
    await screen.findByText("Acme DPO");

    // No button for this exists in the DOM (asserted above) -- this call
    // simulates a forged request bypassing the hidden UI entirely, exactly
    // as the task brief requires: the server, not `<PermissionGate>`, is
    // what actually stops it.
    await expect(
      employeeApiClient.post("/employees", {
        email: "forged@acmeretail.demo",
        fullName: "Forged Employee",
        roleId: "role-admin",
        password: "Password123!",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("shows the write affordances for an actor who holds CAN_MANAGE_EMPLOYEES (positive control)", async () => {
    await loginAndRenderThroughShell({ permissions: ["CAN_MANAGE_EMPLOYEES"] });
    await screen.findByText("Acme DPO");

    expect(screen.getByRole("button", { name: /add employee/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reset password/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disable/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /role for acme dpo/i })).toBeInTheDocument();
  });

  it("surfaces a 403 from a forged role-change as a friendly error toast, never a silent success", async () => {
    const { patchEmployeeStatus } = await loginAndRenderThroughShell({ permissions: ["CAN_MANAGE_EMPLOYEES"] });
    await screen.findByText("Acme DPO");

    // A revoked permission or a stale client both land here: the very next
    // `PATCH /employees/:id` this actor makes now gets a real 403.
    patchEmployeeStatus.value = 403;

    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole("combobox", { name: /role for acme dpo/i }), "role-auditor");

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/do not have permission/i));
    });
  });
});

// A separate `describe` with no `afterEach` -- this is a pure-function
// assertion with no login/render, so it must not inherit the outer
// suite's `employeeLogout()` cleanup, which itself depends on a fetch
// mock only the other tests set up.
describe("shouldShowDemoCredentials", () => {
  it("shows the demo-credentials banner only outside a production build", () => {
    expect(shouldShowDemoCredentials(false)).toBe(true);
    expect(shouldShowDemoCredentials(true)).toBe(false);
  });
});

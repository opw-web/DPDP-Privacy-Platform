import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Fresh module graph per test so the `lib/auth.ts` singleton starts clean.
async function loginAs(permissions: string[]) {
  const { employeeLogin } = await import("../../lib/auth");
  vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/employee/login")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            accessToken: "t",
            employee: { id: "e1", email: "a@b.com", fullName: "A B" },
          }),
          { status: 200 },
        ),
      );
    }
    if (url.endsWith("/auth/employee/me")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "e1",
            email: "a@b.com",
            fullName: "A B",
            organizationId: "org1",
            status: "ACTIVE",
            role: { id: "r1", code: "AUDITOR", name: "Auditor" },
            permissions,
          }),
          { status: 200 },
        ),
      );
    }
    throw new Error(`Unexpected fetch to ${url}`);
  });
  await employeeLogin("a@b.com", "password");
}

describe("PermissionGate", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when the actor holds the required permission", async () => {
    await loginAs(["CAN_MANAGE_EMPLOYEES"]);
    const { PermissionGate: FreshGate } = await import("./PermissionGate");
    render(
      <FreshGate permission="CAN_MANAGE_EMPLOYEES">
        <button>Disable employee</button>
      </FreshGate>,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /disable employee/i })).toBeInTheDocument();
    });
  });

  it("hides children (renders nothing) when the actor lacks the permission -- even though this is cosmetic only, not enforcement", async () => {
    await loginAs(["CAN_VIEW_AUDIT_LOG"]);
    const { PermissionGate: FreshGate } = await import("./PermissionGate");
    render(
      <FreshGate permission="CAN_MANAGE_EMPLOYEES">
        <button>Disable employee</button>
      </FreshGate>,
    );
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /disable employee/i })).not.toBeInTheDocument();
    });
  });

  it("renders the provided fallback instead of nothing when given one", async () => {
    await loginAs([]);
    const { PermissionGate: FreshGate } = await import("./PermissionGate");
    render(
      <FreshGate permission="CAN_MANAGE_EMPLOYEES" fallback={<span>Read-only</span>}>
        <button>Disable employee</button>
      </FreshGate>,
    );
    await waitFor(() => {
      expect(screen.getByText("Read-only")).toBeInTheDocument();
    });
  });
});

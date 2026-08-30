import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_BASE,
  employeeApiClient,
  employeeTokenStore,
  principalApiClient,
  principalTokenStore,
} from "./api-client";
import { employeeLogin } from "./auth";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function authHeaderOf(call: unknown): string | null {
  const [, init] = call as [string, RequestInit | undefined];
  return new Headers(init?.headers).get("Authorization");
}

describe("token store isolation between the employee and principal API clients", () => {
  beforeEach(() => {
    employeeTokenStore.set(null);
    principalTokenStore.set(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    employeeTokenStore.set(null);
    principalTokenStore.set(null);
  });

  it("never attaches the employee token to a /api/me/* request made through the real principal client", async () => {
    employeeTokenStore.set("employee-secret-token");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));

    // The REAL principalApiClient (unmodified production code) makes the
    // call; only the network boundary (global fetch) is faked, per the
    // task's testing rule against hitting a live API.
    await principalApiClient.get("/me/profile");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/me/profile`, expect.anything());
    expect(authHeaderOf(fetchMock.mock.calls[0])).not.toBe("Bearer employee-secret-token");
    expect(authHeaderOf(fetchMock.mock.calls[0])).toBeNull();
  });

  it("symmetrically never attaches the principal token to an employee-tree request", async () => {
    principalTokenStore.set("principal-secret-token");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));

    await employeeApiClient.get("/organization");

    expect(authHeaderOf(fetchMock.mock.calls[0])).not.toBe("Bearer principal-secret-token");
    expect(authHeaderOf(fetchMock.mock.calls[0])).toBeNull();
  });

  it("does attach each client's own token when one is set", async () => {
    employeeTokenStore.set("employee-secret-token");
    principalTokenStore.set("principal-secret-token");

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));

    await employeeApiClient.get("/organization");
    await principalApiClient.get("/me/profile");

    expect(authHeaderOf(fetchMock.mock.calls[0])).toBe("Bearer employee-secret-token");
    expect(authHeaderOf(fetchMock.mock.calls[1])).toBe("Bearer principal-secret-token");
  });

  it("end-to-end: logging in as an employee (via the real auth.ts login flow) never leaves a token the principal client will send", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/auth/employee/login")) {
          return Promise.resolve(
            jsonResponse({
              accessToken: "real-employee-jwt",
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
              role: { id: "r1", code: "ADMIN", name: "Administrator" },
            }),
          );
        }
        if (url.endsWith("/me/recipients")) {
          return Promise.resolve(jsonResponse({ recipients: [] }));
        }
        throw new Error(`Unexpected fetch to ${url}`);
      });

    await employeeLogin("dpo@example.org", "correct horse battery staple");
    expect(employeeTokenStore.get()).toBe("real-employee-jwt");

    // Now hit a /api/me/* endpoint through the PRINCIPAL client -- the
    // employee token that login just minted must not ride along.
    await principalApiClient.get("/me/recipients");

    const meRecipientsCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).endsWith("/me/recipients"),
    );
    expect(meRecipientsCall).toBeDefined();
    expect(authHeaderOf(meRecipientsCall)).toBeNull();
    expect(authHeaderOf(meRecipientsCall)).not.toBe("Bearer real-employee-jwt");
  });
});

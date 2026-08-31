import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import { PrincipalLoginPage } from "./PrincipalLoginPage";
import { principalTokenStore } from "../../lib/api-client";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function renderPrincipalLoginPage() {
  return render(
    <MemoryRouter
      initialEntries={["/me/login"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/me/login" element={<PrincipalLoginPage />} />
        <Route path="/me" element={<div>Hello, Data Principal</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PrincipalLoginPage", () => {
  beforeEach(() => {
    principalTokenStore.set(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    principalTokenStore.set(null);
  });

  it("shows validation errors and never calls fetch when submitted empty", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    renderPrincipalLoginPage();

    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/enter your email/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your password/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a plain-language toast, not a crash, on invalid credentials", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Invalid credentials" }), { status: 401 }),
    );
    const user = userEvent.setup();
    renderPrincipalLoginPage();

    await user.type(screen.getByLabelText(/email/i), "priya@example.org");
    await user.type(screen.getByLabelText(/password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "That email or password isn't right. Please try again.",
      );
    });
    expect(principalTokenStore.get()).toBeNull();
  });

  it("logs in and reaches the portal home on valid credentials", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/principal/login")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              accessToken: "principal-jwt",
              account: {
                id: "p1",
                organizationId: "org1",
                dataPrincipalId: "dp1",
                email: "priya@example.org",
                status: "ACTIVE",
                lastLoginAt: null,
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            }),
            { status: 200 },
          ),
        );
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    const user = userEvent.setup();
    renderPrincipalLoginPage();

    await user.type(screen.getByLabelText(/email/i), "priya@example.org");
    await user.type(screen.getByLabelText(/password/i), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Hello, Data Principal")).toBeInTheDocument();
    expect(principalTokenStore.get()).toBe("principal-jwt");
  });
});

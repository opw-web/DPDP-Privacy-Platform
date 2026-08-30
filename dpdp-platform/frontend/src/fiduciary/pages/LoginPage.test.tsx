import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import { LoginPage } from "./LoginPage";
import { employeeTokenStore } from "../../lib/api-client";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function renderLoginPage() {
  return render(
    <MemoryRouter
      initialEntries={["/login"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app" element={<div>Fiduciary dashboard shell</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    employeeTokenStore.set(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    employeeTokenStore.set(null);
  });

  it("shows validation errors and never calls fetch when submitted empty", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a toast, not a crash, on invalid credentials", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Invalid credentials" }), { status: 401 }),
    );
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), "dpo@example.org");
    await user.type(screen.getByLabelText(/password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Incorrect email or password.");
    });
    expect(employeeTokenStore.get()).toBeNull();
    // Still on the login form -- no navigation happened.
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("logs in and reaches the fiduciary shell on valid credentials", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/employee/login")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              accessToken: "employee-jwt",
              employee: { id: "e1", email: "dpo@example.org", fullName: "Dee Peeoh" },
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
              email: "dpo@example.org",
              fullName: "Dee Peeoh",
              organizationId: "org1",
              status: "ACTIVE",
              role: { id: "r1", code: "ADMIN", name: "Administrator" },
            }),
            { status: 200 },
          ),
        );
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), "dpo@example.org");
    await user.type(screen.getByLabelText(/password/i), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Fiduciary dashboard shell")).toBeInTheDocument();
    expect(employeeTokenStore.get()).toBe("employee-jwt");
  });
});

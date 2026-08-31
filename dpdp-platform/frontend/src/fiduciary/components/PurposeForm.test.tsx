import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PurposeForm } from "./PurposeForm";
import { employeeTokenStore } from "../../lib/api-client";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onSuccess = vi.fn();
  const onCancel = vi.fn();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <PurposeForm onSuccess={onSuccess} onCancel={onCancel} />
    </QueryClientProvider>,
  );
  return { ...result, onSuccess, onCancel };
}

async function fillRequiredTextFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^code$/i), "ORDER_FULFILMENT");
  await user.type(screen.getByLabelText(/^name$/i), "Order Fulfilment");
  await user.type(screen.getByLabelText(/^description$/i), "Fulfilling customer orders.");
  await user.type(
    screen.getByLabelText(/justification/i),
    "Necessary to deliver goods the customer ordered.",
  );
}

describe("PurposeForm -- LB-01/LB-02 lawful basis requirement (spec lines 739-748)", () => {
  afterEach(() => {
    employeeTokenStore.set(null);
    vi.restoreAllMocks();
  });

  it("has no lawful basis pre-selected", () => {
    renderForm();
    const select = screen.getByLabelText(/lawful basis/i) as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  it("cannot be submitted without a lawful basis -- and never calls the API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    renderForm();

    await fillRequiredTextFields(user);
    await user.click(screen.getByRole("button", { name: /create purpose/i }));

    expect(
      await screen.findByText(/choose a lawful basis.*no default.*none is inferred/i),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("selecting LEGITIMATE_USE reveals the s.7 limb selector and requires it", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    renderForm();

    await fillRequiredTextFields(user);
    await user.selectOptions(screen.getByLabelText(/lawful basis/i), "LEGITIMATE_USE");

    const limbSelect = screen.getByLabelText(/section 7 limb/i) as HTMLSelectElement;
    expect(limbSelect.value).toBe("");

    await user.click(screen.getByRole("button", { name: /create purpose/i }));

    expect(await screen.findByText(/select which s\.7 limb applies/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("submits successfully once LEGITIMATE_USE and its limb are both chosen", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        id: "purpose1",
        code: "ORDER_FULFILMENT",
        lawfulBasis: "LEGITIMATE_USE",
        legitimateUseLimb: "VOLUNTARY_PROVISION",
        isReviewed: false,
      }),
    );
    employeeTokenStore.set("employee-jwt");
    const user = userEvent.setup();
    const { onSuccess } = renderForm();

    await fillRequiredTextFields(user);
    await user.selectOptions(screen.getByLabelText(/lawful basis/i), "LEGITIMATE_USE");
    await user.selectOptions(screen.getByLabelText(/section 7 limb/i), "VOLUNTARY_PROVISION");
    await user.click(screen.getByRole("button", { name: /create purpose/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const [, requestInit] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(requestInit.body as string);
    expect(body.lawfulBasis).toBe("LEGITIMATE_USE");
    expect(body.legitimateUseLimb).toBe("VOLUNTARY_PROVISION");
  });

  it("states plainly, for CONSENT, that a notice and consent record will be required in MVP 2 before the purpose may be relied on", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText(/lawful basis/i), "CONSENT");

    expect(
      screen.getByText(
        /a notice and consent record will be required in mvp 2 before this purpose may be relied on/i,
      ),
    ).toBeInTheDocument();
    // No s.7 limb selector for a CONSENT purpose.
    expect(screen.queryByLabelText(/section 7 limb/i)).not.toBeInTheDocument();
  });

  it("does not send legitimateUseLimb at all when the basis is CONSENT", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ id: "purpose2", code: "MARKETING", lawfulBasis: "CONSENT", isReviewed: false }),
    );
    employeeTokenStore.set("employee-jwt");
    const user = userEvent.setup();
    const { onSuccess } = renderForm();

    await fillRequiredTextFields(user);
    await user.selectOptions(screen.getByLabelText(/lawful basis/i), "CONSENT");
    await user.click(screen.getByRole("button", { name: /create purpose/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const [, requestInit] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(requestInit.body as string);
    expect(body.lawfulBasis).toBe("CONSENT");
    expect(body.legitimateUseLimb).toBeUndefined();
  });
});

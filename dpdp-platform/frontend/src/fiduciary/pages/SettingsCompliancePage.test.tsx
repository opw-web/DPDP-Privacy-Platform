import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { SettingsCompliancePage } from "./SettingsCompliancePage";
import { employeeLogin, employeeLogout } from "../../lib/auth";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const rule = { id: "r1", ruleCode: "GRIEVANCE_RESPONSE", version: 1, name: "Grievance response", legalSource: "DPDP Rules, 2025 — Rule 14(3): published period must not exceed ninety days", basis: "STATUTORY", appliesTo: "REQUEST:GRIEVANCE", deadlineValue: 90, deadlineUnit: "DAYS", warningLead: 14, publishedPeriodText: "90 days", enabled: true, notes: null, isReviewed: false, reviewedAt: null };
function response(body: unknown) { return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }); }
async function renderPage() {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/auth/employee/login")) return Promise.resolve(response({ accessToken: "token", employee: { id: "e1", email: "dpo@example.test", fullName: "DPO" } }));
    if (path.endsWith("/auth/employee/me")) return Promise.resolve(response({ id: "e1", email: "dpo@example.test", fullName: "DPO", organizationId: "o1", status: "ACTIVE", role: { id: "role1", code: "DPO", name: "DPO" }, permissions: ["CAN_CHANGE_COMPLIANCE_CONFIG", "CAN_VIEW_AUDIT_LOG"] }));
    if (path.endsWith("/auth/employee/logout")) return Promise.resolve(response({}));
    if (path.endsWith("/compliance-rules") && init?.method === "GET") return Promise.resolve(response([rule]));
    if (path.endsWith("/compliance-rules/r1") && init?.method === "PATCH") return Promise.resolve(response({ ...rule, version: 2 }));
    throw new Error(`Unexpected ${init?.method ?? "GET"} ${path}`);
  });
  await employeeLogin("dpo@example.test", "password");
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><SettingsCompliancePage /></MemoryRouter></QueryClientProvider>);
  return fetchMock;
}
describe("SettingsCompliancePage", () => {
  afterEach(async () => { cleanup(); try { await employeeLogout(); } finally { vi.restoreAllMocks(); } });
  it("honestly labels statutory rules and carries the amber unreviewed chip", async () => {
    await renderPage();
    expect(await screen.findByText("Statutory")).toBeInTheDocument();
    expect(screen.getByText("Not yet reviewed")).toBeInTheDocument();
    expect(screen.getByText(/Rule 14\(3\)/)).toBeInTheDocument();
  });
  it("blocks a 120-day grievance period in the UI with the Rule 14(3) citation", async () => {
    const fetchMock = await renderPage(); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /edit as new version/i }));
    const input = screen.getByLabelText("Deadline"); await user.clear(input); await user.type(input, "120");
    await user.click(screen.getByRole("button", { name: /save version/i }));
    expect(screen.getByText(/cannot exceed 90 days.*Rule 14\(3\)/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")).toBe(false);
  });
});

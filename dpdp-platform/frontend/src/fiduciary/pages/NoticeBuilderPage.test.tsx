import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { NoticeBuilderPage } from "./NoticeBuilderPage";
import { employeeLogin, employeeLogout } from "../../lib/auth";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
const notice = { id: "n1", code: "MARKETING_OPTIN", name: "Marketing notice", purposeIds: ["p1"], status: "DRAFT", currentVersionId: null, createdAt: "2026-01-01", versions: [{ id: "v1", noticeId: "n1", version: 1, itemisedDataFields: [], purposeStatements: [], withdrawalUrl: "", rightsUrl: "", boardComplaintUrl: "", bodyMarkdown: "Hello", contentHash: "", publishedAt: null, retiredAt: null, translations: [] }] };
describe("NoticeBuilderPage", () => {
  afterEach(async () => { cleanup(); try { await employeeLogout(); } finally { vi.restoreAllMocks(); toast.error.mockClear(); } });
  it("keeps publication blocked when the three Rule 3(c) links are missing", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/auth/employee/login")) return Promise.resolve(response({ accessToken: "token", employee: { id: "e1", email: "dpo@example.test", fullName: "DPO" } }));
      if (path.endsWith("/auth/employee/me")) return Promise.resolve(response({ id: "e1", email: "dpo@example.test", fullName: "DPO", organizationId: "o1", status: "ACTIVE", role: { id: "r1", code: "DPO", name: "DPO" }, permissions: ["CAN_MANAGE_NOTICES"] }));
      if (path.endsWith("/auth/employee/logout")) return Promise.resolve(response({}));
      if (path.endsWith("/purposes")) return Promise.resolve(response([{ id: "p1", name: "Marketing", description: "Offers", goodsOrServicesDescription: "Offers and services" }]));
      if (path.endsWith("/notices/n1") && init?.method === "GET") return Promise.resolve(response(notice));
      if (path.endsWith("/eligible-fields")) return Promise.resolve(response([]));
      if (path.endsWith("/publish")) return Promise.resolve(response({ message: "Cannot publish: missing required Rule 3(c) link(s): withdrawalUrl, rightsUrl, boardComplaintUrl." }, 400));
      throw new Error(`Unexpected ${init?.method} ${path}`);
    });
    await employeeLogin("dpo@example.test", "password");
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter initialEntries={["/app/notices/n1"]}><Routes><Route path="/app/notices/:noticeId" element={<NoticeBuilderPage />} /></Routes></MemoryRouter></QueryClientProvider>);
    const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: /publish version/i }));
    expect(await vi.waitFor(() => toast.error.mock.calls.length)).toBeGreaterThan(0);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("withdrawalUrl, rightsUrl, boardComplaintUrl"));
  });
});

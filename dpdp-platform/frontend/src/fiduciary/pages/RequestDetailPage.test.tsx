import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequestDetailPage } from "./RequestDetailPage";
import { employeeLogin, employeeLogout } from "../../lib/auth";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
function json(body: unknown) { return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }); }
function request(status: string, type = "CORRECTION") { return { id: "r1", reference: "REQ-000001", dataPrincipalId: "p1", type, status, subject: "Correct my phone", body: "My new number is 9999.", requestedChanges: { PHONE: { from: "1111", to: "9999" } }, assignedEmployeeId: null, escalatedAt: null, ruleCodeSnapshot: "REQUEST_CORRECTION", ruleVersionSnapshot: 1, ruleBasisSnapshot: "ORG_POLICY", legalSourceSnapshot: "Company service level — the Rules set no separate figure for correction", submittedAt: "2026-08-01T00:00:00.000Z", createdAt: "2026-08-01T00:00:00.000Z", dueAt: "2026-08-31T00:00:00.000Z", warningAt: "2026-08-24T00:00:00.000Z", completedAt: null, isOverdue: false, outcomeCode: null, outcome: null, rejectionReason: null }; }
async function renderDetail(status = "SUBMITTED", type = "CORRECTION", notePayloads: unknown[] = [], statusPayloads: unknown[] = []) {
  vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/auth/employee/login")) return Promise.resolve(json({ accessToken: "token", employee: { id: "e1", email: "employee@example.test", fullName: "Employee" } }));
    if (path.endsWith("/auth/employee/me")) return Promise.resolve(json({ id: "e1", email: "employee@example.test", fullName: "Employee", organizationId: "o1", status: "ACTIVE", role: { id: "role", code: "EMPLOYEE", name: "Employee" }, permissions: ["CAN_MANAGE_REQUESTS", "CAN_VIEW_PRINCIPALS", "CAN_RUN_SYNC", "CAN_VIEW_AUDIT_LOG"] }));
    if (path.endsWith("/auth/employee/logout")) return Promise.resolve(json({}));
    if (path.endsWith("/requests/REQ-000001/access-report.pdf") && init?.method === "GET") return Promise.resolve(new Response(new Blob(["access-report"], { type: "application/pdf" }), { headers: { "Content-Type": "application/pdf" } }));
    if (path.endsWith("/requests/REQ-000001") && init?.method === "GET") return Promise.resolve(json(request(status, type)));
    if (path.endsWith("/principals/p1") && init?.method === "GET") return Promise.resolve(json({ id: "p1", reference: "DP-1", displayName: "Aman", fields: [{ id: "f1", canonicalField: "PHONE", value: "1111", sources: [{ id: "s1", name: "CRM" }] }] }));
    if (path.endsWith("/requests/REQ-000001/erasure-completion-holders") && init?.method === "GET") return Promise.resolve(json({ systemChecklist: [{ dataSourceId: "s1" }, { dataSourceId: "s1" }], processorChecklist: [{ recipientId: "processor-1" }, { recipientId: "processor-1" }] }));
    if (path.endsWith("/compliance-rules") && init?.method === "GET") return Promise.resolve(json([{ ruleCode: "REQUEST_CORRECTION", version: 1, isReviewed: false }]));
    if (path.endsWith("/requests/REQ-000001/note") && init?.method === "POST") {
      notePayloads.push(JSON.parse(String(init.body)));
      return Promise.resolve(json(request(status, type)));
    }
    if (path.endsWith("/requests/REQ-000001/status") && init?.method === "POST") {
      statusPayloads.push(JSON.parse(String(init.body)));
      return Promise.resolve(json(request("COMPLETED", type)));
    }
    throw new Error(`Unexpected ${init?.method} ${path}`);
  });
  await employeeLogin("employee@example.test", "password");
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter initialEntries={["/app/requests/REQ-000001"]}><Routes><Route path="/app/requests/:ref" element={<RequestDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>);
}
describe("RequestDetailPage", () => {
  afterEach(async () => { cleanup(); try { await employeeLogout(); } finally { vi.restoreAllMocks(); } });
  it("offers only legal next transitions", async () => {
    await renderDetail();
    const move = await screen.findByLabelText("Move to");
    expect(move).toHaveTextContent("Verification Required");
    expect(move).toHaveTextContent("Open");
    expect(move).not.toHaveTextContent("Completed");
    expect(move).not.toHaveTextContent("Rejected");
  });
  it("blocks completion until an outcome code and outcome are entered", async () => {
    await renderDetail("IN_PROGRESS"); const user = userEvent.setup();
    const move = await screen.findByLabelText("Move to"); await user.selectOptions(move, "COMPLETED");
    expect(screen.getByRole("button", { name: /update status/i })).toBeDisabled();
    await user.type(screen.getByLabelText("Outcome code"), "FULFILLED"); await user.type(screen.getByLabelText("Outcome"), "Corrected in CRM");
    expect(screen.getByRole("button", { name: /update status/i })).toBeEnabled();
  });
  it("submits checked ERASURE holder evidence when completing the request", async () => {
    const statusPayloads: unknown[] = [];
    await renderDetail("IN_PROGRESS", "ERASURE", [], statusPayloads);
    const user = userEvent.setup();

    expect((await screen.findAllByLabelText("Source system: s1"))).toHaveLength(1);
    expect(screen.getAllByLabelText("Registered processor: processor-1")).toHaveLength(1);
    await user.click(screen.getByLabelText("Source system: s1"));
    await user.click(screen.getByLabelText("Registered processor: processor-1"));
    await user.selectOptions(screen.getByLabelText("Move to"), "COMPLETED");
    await user.type(screen.getByLabelText("Outcome code"), "ERASURE_CONFIRMED");
    await user.type(screen.getByLabelText("Outcome"), "All identified holders confirmed erasure.");
    await user.click(screen.getByRole("button", { name: /update status/i }));

    await waitFor(() => expect(statusPayloads).toContainEqual({
      status: "COMPLETED",
      outcomeCode: "ERASURE_CONFIRMED",
      outcome: "All identified holders confirmed erasure.",
      note: undefined,
      systemChecklist: [{ dataSourceId: "s1", done: true }],
      processorChecklist: [{ recipientId: "processor-1", confirmed: true }],
    }));
  });
  it.each(["ACCESS", "CORRECTION"])("does not send ERASURE evidence when completing a %s request", async (type) => {
    const statusPayloads: unknown[] = [];
    await renderDetail("IN_PROGRESS", type, [], statusPayloads);
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText("Move to"), "COMPLETED");
    await user.type(screen.getByLabelText("Outcome code"), "ACCESS_REPORT_SENT");
    await user.type(screen.getByLabelText("Outcome"), "Access report generated and delivered.");
    await user.click(screen.getByRole("button", { name: /update status/i }));

    await waitFor(() => expect(statusPayloads).toContainEqual({
      status: "COMPLETED",
      outcomeCode: "ACCESS_REPORT_SENT",
      outcome: "Access report generated and delivered.",
      note: undefined,
    }));
  });
  it("never offers a source-system write for correction and instead offers a sync", async () => {
    await renderDetail("IN_PROGRESS");
    expect(await screen.findByText(/update this in the source system, then mark complete/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run sync now: crm/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /write|edit source|update source/i })).not.toBeInTheDocument();
  });
  it("shows the snapshotted rule citation, basis, and amber review state", async () => {
    await renderDetail();
    expect(await screen.findByText(/Company service level/i)).toBeInTheDocument();
    expect(screen.getByText("Org Policy")).toBeInTheDocument();
    expect(screen.getByText("Not yet reviewed")).toBeInTheDocument();
  });
  it("generates and downloads the authenticated PDF for an ACCESS request", async () => {
    const createObjectUrl = vi.fn((_blob: Blob) => "blob:access-report");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await renderDetail("IN_PROGRESS", "ACCESS");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /generate and download access report \(pdf\)/i }));

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect((createObjectUrl.mock.calls[0]?.[0] as Blob).type).toBe("application/pdf");
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:access-report");
    expect(toast.success).toHaveBeenCalledWith("Access report generated and downloaded.");
    const reportCall = vi.mocked(globalThis.fetch).mock.calls.find(([input]) => String(input).endsWith("/requests/REQ-000001/access-report.pdf"));
    expect(reportCall?.[1]?.headers).toEqual(expect.any(Headers));
    expect((reportCall?.[1]?.headers as Headers).get("Authorization")).toBe("Bearer token");
  });
  it("does not offer the access report action for another request type", async () => {
    await renderDetail("IN_PROGRESS", "CORRECTION");
    await screen.findByText(/update this in the source system/i);
    expect(screen.queryByRole("button", { name: /access report/i })).not.toBeInTheDocument();
  });
  it("adds internal and principal-visible notes with explicit visibility payloads", async () => {
    const notePayloads: unknown[] = [];
    await renderDetail("IN_PROGRESS", "CORRECTION", notePayloads);
    const user = userEvent.setup();
    const note = await screen.findByLabelText("Request note");

    await user.type(note, "Internal case note");
    await user.click(screen.getByRole("button", { name: "Add internal note" }));
    expect(notePayloads).toContainEqual({ note: "Internal case note", visibleToPrincipal: false });
    expect(await screen.findByText("Internal note: Internal case note")).toBeInTheDocument();

    await user.type(note, "We are reviewing your correction.");
    await user.click(screen.getByLabelText("Visible to the Data Principal"));
    await user.click(screen.getByRole("button", { name: "Add visible note" }));
    expect(notePayloads).toContainEqual({ note: "We are reviewing your correction.", visibleToPrincipal: true });
    expect(await screen.findByText("Principal-visible note: We are reviewing your correction.")).toBeInTheDocument();
  });
});

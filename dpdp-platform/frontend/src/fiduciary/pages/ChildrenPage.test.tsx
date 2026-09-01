import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ChildrenPage } from "./ChildrenPage";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter><ChildrenPage /></MemoryRouter></QueryClientProvider>);
}

describe("ChildrenPage", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("renders the unknown age count prominently", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("unknown-count")) return Promise.resolve(jsonResponse({ unknownCount: 17 }));
      if (path.endsWith("/guardians")) return Promise.resolve(jsonResponse([]));
      if (path.endsWith("/child-exemptions")) return Promise.resolve(jsonResponse([]));
      if (path.endsWith("/principals")) return Promise.resolve(jsonResponse({ items: [] }));
      if (path.endsWith("/purposes")) return Promise.resolve(jsonResponse([]));
      if (path.endsWith("/notices")) return Promise.resolve(jsonResponse([]));
      throw new Error(`Unexpected fetch to ${String(input)}`);
    });
    renderPage();
    expect(await screen.findByText("17")).toBeInTheDocument();
    expect(screen.getByText(/cannot distinguish adults from children/i)).toBeInTheDocument();
  });

  it("does not allow an unverified guardian to be selected for child consent", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("unknown-count")) return Promise.resolve(jsonResponse({ unknownCount: 0 }));
      if (path.endsWith("/guardians")) return Promise.resolve(jsonResponse([
        { id: "g-none", dataPrincipalId: "p1", kind: "PARENT_OF_CHILD", guardianName: "Unverified Parent", guardianEmail: null, guardianPhone: null, verification: "NONE", verificationReference: null, verifiedByEmployeeId: null, verifiedAt: null, appointingAuthority: null, appointmentReference: null, active: true, createdAt: "2026-08-01T00:00:00Z" },
        { id: "g-ok", dataPrincipalId: "p1", kind: "PARENT_OF_CHILD", guardianName: "Verified Parent", guardianEmail: null, guardianPhone: null, verification: "DIGITAL_LOCKER", verificationReference: "DL-1", verifiedByEmployeeId: "e1", verifiedAt: "2026-08-02T00:00:00Z", appointingAuthority: null, appointmentReference: null, active: true, createdAt: "2026-08-01T00:00:00Z" },
      ]));
      if (path.endsWith("/child-exemptions")) return Promise.resolve(jsonResponse([]));
      if (path.endsWith("/principals")) return Promise.resolve(jsonResponse({ items: [] }));
      if (path.endsWith("/purposes")) return Promise.resolve(jsonResponse([]));
      if (path.endsWith("/notices")) return Promise.resolve(jsonResponse([]));
      throw new Error(`Unexpected fetch to ${String(input)}`);
    });
    renderPage();
    const select = await screen.findByRole("combobox", { name: /guardian for child's consent/i });
    const unverified = within(select).getByRole("option", { name: /unverified parent/i });
    expect(unverified).toBeDisabled();
    expect(within(select).getByRole("option", { name: /^verified parent/i })).not.toBeDisabled();
  });

  it("does not pair a guardian from another child with DP-000293", async () => {
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("unknown-count")) return Promise.resolve(jsonResponse({ unknownCount: 0 }));
      if (path.endsWith("/guardians")) return Promise.resolve(jsonResponse([{ id: "g-priya", dataPrincipalId: "child-288", kind: "PARENT_OF_CHILD", guardianName: "Priya Sharma (demo guardian)", guardianEmail: "guardian@example.test", guardianPhone: null, verification: "EXISTING_RELIABLE_DETAILS", verificationReference: "KYC-CHILD-2026-001", verifiedByEmployeeId: "e1", verifiedAt: "2026-09-01T00:00:00Z", appointingAuthority: null, appointmentReference: null, active: true, createdAt: "2026-09-01T00:00:00Z" }]));
      if (path.endsWith("/child-exemptions")) return Promise.resolve(jsonResponse([]));
      if (path.endsWith("/principals")) return Promise.resolve(jsonResponse({ items: [{ id: "child-293", displayName: null, reference: "DP-000293", ageStatus: "CHILD" }] }));
      if (path.endsWith("/purposes")) return Promise.resolve(jsonResponse([{ id: "purpose-consent", name: "Personalised offers", code: "OFFERS", lawfulBasis: "CONSENT", description: "Offers" }]));
      if (path.endsWith("/notices")) return Promise.resolve(jsonResponse([]));
      if (path.includes("/consents/") && init?.method === "POST") { requests.push(path); return Promise.resolve(jsonResponse({ status: "GRANTED" }, 201)); }
      throw new Error(`Unexpected fetch to ${String(input)}`);
    });
    renderPage();
    const user = userEvent.setup();
    const childSelect = await screen.findByLabelText(/child or guardian-represented principal/i);
    await within(childSelect).findByRole("option", { name: /DP-000293/i });
    await user.selectOptions(childSelect, "child-293");
    await user.selectOptions(screen.getByLabelText(/consent purpose/i), "purpose-consent");
    const guardianSelect = await screen.findByRole("combobox", { name: /guardian for child's consent/i });
    expect(within(guardianSelect).getByRole("option", { name: /Priya Sharma/i })).toBeDisabled();
    expect(await screen.findByText(/No active verified guardian is linked to this child/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /record granted guardian consent/i })).toBeDisabled();
    expect(requests).toHaveLength(0);
  });

  it("records a granted child consent with the selected verified guardian and published notice", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("unknown-count")) return Promise.resolve(jsonResponse({ unknownCount: 0 }));
      if (path.endsWith("/guardians")) return Promise.resolve(jsonResponse([
        { id: "g-none", dataPrincipalId: "p-child", kind: "PARENT_OF_CHILD", guardianName: "Unverified Parent", guardianEmail: null, guardianPhone: null, verification: "NONE", verificationReference: null, verifiedByEmployeeId: null, verifiedAt: null, appointingAuthority: null, appointmentReference: null, active: true, createdAt: "2026-08-01T00:00:00Z" },
        { id: "g-ok", dataPrincipalId: "p-child", kind: "PARENT_OF_CHILD", guardianName: "Verified Parent", guardianEmail: null, guardianPhone: null, verification: "DIGITAL_LOCKER", verificationReference: "DL-1", verifiedByEmployeeId: "e1", verifiedAt: "2026-08-02T00:00:00Z", appointingAuthority: null, appointmentReference: null, active: true, createdAt: "2026-08-01T00:00:00Z" },
      ]));
      if (path.endsWith("/child-exemptions")) return Promise.resolve(jsonResponse([]));
      if (path.endsWith("/principals")) return Promise.resolve(jsonResponse({ items: [{ id: "p-child", displayName: "Child One", reference: "C-1", ageStatus: "CHILD" }] }));
      if (path.endsWith("/purposes")) return Promise.resolve(jsonResponse([{ id: "purpose-consent", name: "Personalised offers", code: "OFFERS", lawfulBasis: "CONSENT", description: "Offers" }, { id: "purpose-lu", name: "Support", code: "SUPPORT", lawfulBasis: "LEGITIMATE_USE", description: "Support" }]));
      if (path.endsWith("/notices") && !path.endsWith("/notices/n-published")) return Promise.resolve(jsonResponse([{ id: "n-published", code: "OFFERS_NOTICE", name: "Offers notice", purposeIds: ["purpose-consent"], status: "PUBLISHED", currentVersionId: "version-3", createdAt: "2026-08-01T00:00:00Z" }, { id: "n-draft", code: "DRAFT", name: "Draft notice", purposeIds: ["purpose-consent"], status: "DRAFT", currentVersionId: null, createdAt: "2026-08-01T00:00:00Z" }]));
      if (path.endsWith("/notices/n-published")) return Promise.resolve(jsonResponse({ id: "n-published", code: "OFFERS_NOTICE", name: "Offers notice", purposeIds: ["purpose-consent"], status: "PUBLISHED", currentVersionId: "version-3", createdAt: "2026-08-01T00:00:00Z", versions: [{ id: "version-3", noticeId: "n-published", version: 3, itemisedDataFields: [], purposeStatements: [], withdrawalUrl: "https://example.test/withdraw", rightsUrl: "https://example.test/rights", boardComplaintUrl: "https://example.test/board", bodyMarkdown: "Offers", contentHash: "hash", publishedAt: "2026-08-15T00:00:00Z", retiredAt: null, translations: [] }] }));
      if (path.includes("/consents/") && init?.method === "POST") {
        requests.push({ url: path, body: JSON.parse(String(init.body)) });
        return Promise.resolve(jsonResponse({ status: "GRANTED" }, 201));
      }
      throw new Error(`Unexpected fetch to ${String(input)}`);
    });
    renderPage();
    const user = userEvent.setup();
    const childSelect = await screen.findByLabelText(/child or guardian-represented principal/i);
    await within(childSelect).findByRole("option", { name: /child one/i });
    await user.selectOptions(childSelect, "p-child");
    await user.selectOptions(screen.getByLabelText(/consent purpose/i), "purpose-consent");
    const guardianSelect = screen.getByRole("combobox", { name: /guardian for child's consent/i });
    expect(within(guardianSelect).getByRole("option", { name: /unverified parent/i })).toBeDisabled();
    await user.selectOptions(guardianSelect, "g-ok");
    await user.selectOptions(screen.getByLabelText(/published notice\/version shown/i), "n-published");
    expect(await screen.findByText(/Frozen version 3/i)).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: /record granted guardian consent/i });
    expect(submit).toBeEnabled();
    await user.click(submit);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({ url: "/api/principals/p-child/consents/purpose-consent", body: { status: "GRANTED", channel: "IN_PERSON", noticeId: "n-published", givenByGuardianId: "g-ok" } });
  });
});

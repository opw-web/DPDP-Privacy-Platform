import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { NoticeBuilderPage, bodyForLanguage } from "./NoticeBuilderPage";
import { NoticeStandalonePreview } from "../components/notices/NoticePreview";
import type { NoticeVersion } from "../components/notices/types";
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

const publishedVersion: NoticeVersion = {
  id: "v1", noticeId: "n1", version: 1,
  itemisedDataFields: [{ sourceFieldMappingId: "m1", canonicalField: "EMAIL", dataCategory: "CONTACT", label: "Your email address" }],
  purposeStatements: [{ purposeId: "p1", purposeName: "Marketing", goodsOrServices: "Offers and services" }],
  withdrawalUrl: "https://example.test/withdraw", rightsUrl: "https://example.test/rights", boardComplaintUrl: "https://example.test/board",
  bodyMarkdown: "# Marketing notice\nEnglish body.", contentHash: "abc123",
  publishedAt: "2026-01-01T00:00:00.000Z", retiredAt: null,
  translations: [{ id: "t1", languageCode: "hi", bodyMarkdown: "## विपणन सूचना" }],
};

describe("bodyForLanguage", () => {
  it("returns the stored body for English", () => {
    expect(bodyForLanguage(publishedVersion, "en")).toEqual({ body: "# Marketing notice\nEnglish body.", isFallback: false });
  });
  it("returns the stored translation for a translated language", () => {
    expect(bodyForLanguage(publishedVersion, "hi")).toEqual({ body: "## विपणन सूचना", isFallback: false });
  });
  it("falls back to English and says so when no translation is stored", () => {
    expect(bodyForLanguage(publishedVersion, "ta")).toEqual({ body: "# Marketing notice\nEnglish body.", isFallback: true });
  });
});

describe("the published notice a Data Principal is shown", () => {
  afterEach(() => cleanup());
  it("renders the stored body rather than an empty composer state", () => {
    const { body } = bodyForLanguage(publishedVersion, "en");
    render(<NoticeStandalonePreview bodyMarkdown={body} itemisedDataFields={publishedVersion.itemisedDataFields} purposeStatements={publishedVersion.purposeStatements} withdrawalUrl={publishedVersion.withdrawalUrl} rightsUrl={publishedVersion.rightsUrl} boardComplaintUrl={publishedVersion.boardComplaintUrl} languageLabel="English" />);
    expect(screen.getByRole("heading", { name: /marketing notice/i })).toBeInTheDocument();
    expect(screen.getByText("Language: English")).toBeInTheDocument();
    expect(screen.getByText("Your email address")).toBeInTheDocument();
  });
  it("renders the Hindi translation when Hindi is selected", () => {
    const { body } = bodyForLanguage(publishedVersion, "hi");
    render(<NoticeStandalonePreview bodyMarkdown={body} itemisedDataFields={publishedVersion.itemisedDataFields} purposeStatements={publishedVersion.purposeStatements} withdrawalUrl={publishedVersion.withdrawalUrl} rightsUrl={publishedVersion.rightsUrl} boardComplaintUrl={publishedVersion.boardComplaintUrl} languageLabel="Hindi" />);
    expect(screen.getByRole("heading", { name: "विपणन सूचना" })).toBeInTheDocument();
    expect(screen.getByText("Language: Hindi")).toBeInTheDocument();
  });
});

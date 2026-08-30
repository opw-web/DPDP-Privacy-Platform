import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { SettingsPage } from "./SettingsPage";
import { AppShell } from "../../components/shared/AppShell";
import { employeeLogin, employeeLogout } from "../../lib/auth";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const BASE_ORGANIZATION = {
  id: "org1",
  name: "Acme Retail",
  legalName: "Acme Retail Private Limited",
  entityRole: "DATA_FIDUCIARY",
  country: "IN",
  timezone: "Asia/Kolkata",
  offersGoodsServicesInIndia: true,
  dpoName: "Acme DPO",
  dpoEmail: "dpo@acmeretail.demo",
  dpoPhone: "+91-9800000000",
  dpoIsIndiaBased: true,
  responsiblePersonName: null,
  responsiblePersonEmail: null,
  grievanceContactEmail: "grievance@acmeretail.demo",
  publicPrivacyPageUrl: "https://acmeretail.demo/privacy",
  isSignificantDataFiduciary: false,
  sdfNotifiedAt: null,
  sdfNotificationRef: null,
  thirdScheduleClass: "NONE",
  registeredUserCount: null,
  classDeclaredByEmployeeId: null,
  classDeclaredAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

interface MockRoutes {
  permissions?: string[];
  onPatch?: (body: unknown) => Response;
}

async function loginAndRenderThroughShell(routes: MockRoutes = {}) {
  const permissions = routes.permissions ?? ["CAN_VIEW_PRINCIPALS", "CAN_CHANGE_ORG_SETTINGS"];
  let organization = { ...BASE_ORGANIZATION };

  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/auth/employee/login")) {
      return Promise.resolve(
        jsonResponse({
          accessToken: "employee-jwt",
          employee: { id: "actor1", email: "actor@example.org", fullName: "Actor" },
        }),
      );
    }
    if (url.endsWith("/auth/employee/me")) {
      return Promise.resolve(
        jsonResponse({
          id: "actor1",
          email: "actor@example.org",
          fullName: "Actor",
          organizationId: "org1",
          status: "ACTIVE",
          role: { id: "role1", code: "DPO", name: "DPO" },
          permissions,
        }),
      );
    }
    if (url.endsWith("/auth/employee/logout")) {
      return Promise.resolve(jsonResponse({}));
    }
    if (url.endsWith("/organization") && (!init || init.method === undefined || init.method === "GET")) {
      return Promise.resolve(jsonResponse(organization));
    }
    if (url.endsWith("/organization") && init?.method === "PATCH") {
      const body: unknown = init.body ? JSON.parse(String(init.body)) : {};
      if (routes.onPatch) {
        return Promise.resolve(routes.onPatch(body));
      }
      organization = { ...organization, ...(body as Record<string, unknown>) };
      return Promise.resolve(jsonResponse(organization));
    }
    throw new Error(`Unexpected fetch to ${url}`);
  });

  await employeeLogin("actor@example.org", "password");

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Seeds the shared `["organization"]` query (both `AppShell` and this
  // page read the same key) so the shell's sidebar renders synchronously
  // on first paint instead of settling a tick apart from this page's own
  // render -- the source of a harmless but noisy `act()` warning.
  queryClient.setQueryData(["organization"], organization);
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={["/app/settings"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/app/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, fetchMock };
}

describe("SettingsPage", () => {
  afterEach(async () => {
    // Unmount FIRST: `employeeLogout()` updates the shared auth store,
    // which `PermissionGate`/`AppShell` (still mounted through the real
    // shell) would otherwise re-render from outside any `act()` scope.
    cleanup();
    try {
      await employeeLogout();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("shows the GO-10 'where it is published' field, pre-filled from the organization", async () => {
    await loginAndRenderThroughShell();

    const publishedField = await screen.findByLabelText(/published at \(privacy \/ notice page url\)/i);
    expect(publishedField).toHaveValue("https://acmeretail.demo/privacy");
  });

  it("saves the DPO contact section and sends publicPrivacyPageUrl through in the PATCH body", async () => {
    const { fetchMock } = await loginAndRenderThroughShell();
    const user = userEvent.setup();

    const publishedField = await screen.findByLabelText(/published at \(privacy \/ notice page url\)/i);
    await user.clear(publishedField);
    await user.type(publishedField, "https://acmeretail.demo/notice");

    await user.click(screen.getByRole("button", { name: /save contact details/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Contact details saved.");
    });

    const patchCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input).endsWith("/organization") && (init as RequestInit | undefined)?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    const [, init] = patchCall as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.publicPrivacyPageUrl).toBe("https://acmeretail.demo/notice");
  });

  it("never claims the organization 'is compliant' with anything, anywhere on the page", async () => {
    await loginAndRenderThroughShell();
    await screen.findByText("Significant Data Fiduciary & Third Schedule");

    expect(screen.queryByText(/is compliant/i)).not.toBeInTheDocument();
  });

  it("renders every section read-only, with no Save button, for an actor without CAN_CHANGE_ORG_SETTINGS", async () => {
    await loginAndRenderThroughShell({ permissions: ["CAN_VIEW_PRINCIPALS"] });

    expect(await screen.findByText("Acme Retail Private Limited")).toBeInTheDocument();
    expect(screen.getByText("https://acmeretail.demo/privacy")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save organization details/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save contact details/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save declaration/i })).not.toBeInTheDocument();
  });

  it("shows the SDF disclaimer as part of the full settings page", async () => {
    await loginAndRenderThroughShell();
    expect(
      await screen.findByText(/this is your organization's own determination, not ours/i),
    ).toBeInTheDocument();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataSourceNewPage } from "./DataSourceNewPage";
import { employeeLogin, employeeLogout } from "../../lib/auth";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CREATED_DATA_SOURCE = {
  id: "ds1",
  name: "Marketing DB",
  systemType: "Custom",
  baseUrl: "https://example.com/api/records",
  recordsPath: "data",
  externalIdField: "id",
  authType: "BEARER",
  credentialHint: null,
  supportsIncremental: false,
  incrementalParam: null,
  paginationStyle: "PAGE",
  pageSize: 100,
  syncFrequency: "MANUAL",
  status: "DRAFT",
  containsOnlyPubliclyAvailableData: false,
  publiclyAvailableJustification: null,
  hostingCountry: "IN",
  lastSyncAt: null,
  lastError: null,
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
};

const ATTACHED_PURPOSE = {
  id: "p1",
  code: "ORDER_FULFILMENT",
  name: "Order Fulfilment",
  description: "Fulfil orders placed on the storefront.",
  lawfulBasis: "CONSENT",
  legitimateUseLimb: null,
  basisJustification: "Opt-in at checkout.",
  dataCategories: ["CONTACT"],
  goodsOrServicesDescription: null,
  reviewedByEmployeeId: null,
  reviewedAt: null,
  active: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  isReviewed: false,
};

function DetailStub() {
  return <div>Detail page reached</div>;
}

function renderWizard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={["/app/data-sources/new"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/app/data-sources/new" element={<DataSourceNewPage />} />
          <Route path="/app/data-sources/:id" element={<DetailStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** One fetch mock covering login/session plus every wizard call, same single-spy convention as `DashboardPage.test.tsx`. */
async function loginAndRenderWizard() {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/auth/employee/login")) {
        return Promise.resolve(
          jsonResponse({
            accessToken: "employee-jwt",
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
            role: { id: "r1", code: "DPO", name: "DPO" },
            permissions: ["CAN_MANAGE_DATA_SOURCES", "CAN_MANAGE_PURPOSES"],
          }),
        );
      }
      if (url.endsWith("/data-sources") && method === "POST") {
        return Promise.resolve(jsonResponse(CREATED_DATA_SOURCE, 201));
      }
      if (url.endsWith("/data-sources/ds1/discover-schema") && method === "POST") {
        return Promise.resolve(
          jsonResponse([
            {
              id: "f1",
              fieldName: "email",
              sampleValue: "person@example.com",
              inferredType: "string",
            },
          ]),
        );
      }
      if (url.endsWith("/data-sources/ds1/mappings") && method === "PUT") {
        return Promise.resolve(
          jsonResponse({
            mappings: [
              {
                id: "m1",
                sourceField: "email",
                canonicalField: "EMAIL",
                dataCategory: "CONTACT",
                containsPersonalData: true,
                isVerifiedCustomerId: false,
              },
            ],
            warnings: [],
          }),
        );
      }
      if (url.endsWith("/purposes") && method === "GET") {
        return Promise.resolve(jsonResponse([ATTACHED_PURPOSE]));
      }
      if (url.endsWith("/data-sources/ds1/purposes") && method === "PUT") {
        return Promise.resolve(jsonResponse({ purposes: [ATTACHED_PURPOSE], warnings: [] }));
      }
      if (url.endsWith("/data-sources/ds1") && method === "PATCH") {
        return Promise.resolve(jsonResponse({ ...CREATED_DATA_SOURCE, hostingCountry: "IN" }));
      }
      if (url.endsWith("/auth/employee/logout")) {
        return Promise.resolve(jsonResponse({}));
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    },
  );

  await employeeLogin("dpo@example.org", "password");
  return renderWizard();
}

describe("DataSourceNewPage wizard", () => {
  afterEach(async () => {
    // Unmount FIRST: `employeeLogout()` updates the shared auth store,
    // which `PermissionGate` (via `useSyncExternalStore`) would otherwise
    // re-render from outside any `act()` scope.
    cleanup();
    try {
      await employeeLogout();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("walks all five steps against a mocked API and reaches the detail page", async () => {
    const user = userEvent.setup();
    await loginAndRenderWizard();

    // Step 1: connection details. recordsPath/externalIdField/authType/
    // syncFrequency already carry valid schema defaults for a new source.
    expect(await screen.findByText(/step 1: connection/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^name$/i), "Marketing DB");
    await user.type(screen.getByLabelText(/system type/i), "Custom");
    await user.type(screen.getByLabelText(/base url/i), "https://example.com/api/records");
    await user.click(screen.getByRole("button", { name: /create data source/i }));

    // Step 2: discover schema. Two "Discover schema" buttons render (the
    // toolbar action and the empty-state's own action) -- either one
    // triggers the same discovery call, so the first is fine.
    expect(await screen.findByText(/step 2: schema/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /discover schema/i })[0]!);

    // Step 3: map the discovered field.
    expect(await screen.findByText(/step 3: mapping/i)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/canonical field for email/i), "EMAIL");
    await user.selectOptions(screen.getByLabelText(/data category for email/i), "CONTACT");
    await user.click(screen.getByRole("button", { name: /save mappings/i }));

    // Step 4: attach a purpose.
    expect(await screen.findByText(/step 4: purposes/i)).toBeInTheDocument();
    expect(await screen.findByText(/order fulfilment/i)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /order fulfilment/i }));
    await user.click(screen.getByRole("button", { name: /save purposes/i }));

    // Step 5: declarations (hostingCountry defaults to "IN", already valid).
    expect(await screen.findByText(/step 5: declarations/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /finish/i }));

    expect(await screen.findByText(/detail page reached/i)).toBeInTheDocument();
  });
});

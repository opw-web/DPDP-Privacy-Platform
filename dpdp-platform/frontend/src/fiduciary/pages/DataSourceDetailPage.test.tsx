import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataSourceDetailPage } from "./DataSourceDetailPage";
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

const DATA_SOURCE = {
  id: "ds1",
  name: "Marketing DB",
  systemType: "Custom",
  baseUrl: "https://example.com/api/records",
  recordsPath: "data",
  externalIdField: "id",
  authType: "BEARER",
  credentialHint: "9wXy",
  supportsIncremental: false,
  incrementalParam: null,
  paginationStyle: "PAGE",
  pageSize: 100,
  syncFrequency: "MANUAL",
  status: "CONNECTED",
  containsOnlyPubliclyAvailableData: false,
  publiclyAvailableJustification: null,
  hostingCountry: "IN",
  lastSyncAt: null,
  lastError: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const WARNING_MESSAGE =
  'Field "fullName" (FULL_NAME) collects data category IDENTITY, which is not declared as ' +
  "necessary by any of this source's attached purposes (ORDER_FULFILMENT).";

const ORDER_FULFILMENT_PURPOSE = {
  id: "p1",
  code: "ORDER_FULFILMENT",
  name: "Order Fulfilment",
  description: "Fulfilling customer orders.",
  lawfulBasis: "CONSENT",
  legitimateUseLimb: null,
  basisJustification: "Consent captured at checkout.",
  dataCategories: ["CONTACT"],
  goodsOrServicesDescription: null,
  reviewedByEmployeeId: null,
  reviewedAt: null,
  active: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  isReviewed: false,
};

function renderDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={["/app/data-sources/ds1"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/app/data-sources/:id" element={<DataSourceDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function loginAndRenderDetailPage() {
  vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);

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
    if (url.endsWith("/auth/employee/logout")) {
      return Promise.resolve(jsonResponse({}));
    }
    if (url.endsWith("/data-sources/ds1")) {
      return Promise.resolve(jsonResponse(DATA_SOURCE));
    }
    if (url.endsWith("/data-sources/ds1/fields")) {
      return Promise.resolve(
        jsonResponse([
          { id: "f1", fieldName: "fullName", sampleValue: "Person Name", inferredType: "string" },
        ]),
      );
    }
    if (url.endsWith("/data-sources/ds1/purposes")) {
      // The real endpoint's shape (`DataSourcePurposesResponseDto`): an
      // ENVELOPE, `{ purposes: [...] }` -- not a bare array. This is the
      // exact wire shape a regression here would get wrong.
      return Promise.resolve(jsonResponse({ purposes: [ORDER_FULFILMENT_PURPOSE] }));
    }
    if (url.endsWith("/purposes")) {
      // The org-wide purpose register `Step4Purposes` itself reads to
      // build its checklist -- a genuinely bare array (`GET /purposes`
      // does not wrap in an envelope), separate from the data-source-
      // scoped envelope above.
      return Promise.resolve(jsonResponse([ORDER_FULFILMENT_PURPOSE]));
    }
    if (url.endsWith("/data-sources/ds1/mappings")) {
      return Promise.resolve(
        jsonResponse({
          mappings: [
            {
              id: "m1",
              sourceField: "fullName",
              canonicalField: "FULL_NAME",
              dataCategory: "IDENTITY",
              containsPersonalData: true,
              isVerifiedCustomerId: false,
            },
          ],
          warnings: [
            {
              type: "CATEGORY_OUTSIDE_PURPOSES",
              sourceField: "fullName",
              canonicalField: "FULL_NAME",
              dataCategory: "IDENTITY",
              attachedPurposes: [
                {
                  id: "p1",
                  code: "ORDER_FULFILMENT",
                  name: "Order Fulfilment",
                  dataCategories: ["CONTACT"],
                },
              ],
              message: WARNING_MESSAGE,
            },
          ],
        }),
      );
    }
    throw new Error(`Unexpected fetch to ${url}`);
  });

  await employeeLogin("dpo@example.org", "password");
  return renderDetailPage();
}

describe("DataSourceDetailPage -- Field Mapping tab", () => {
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

  it("renders the standing CN-02 warning from a plain GET, with no save action taken", async () => {
    const user = userEvent.setup();
    await loginAndRenderDetailPage();

    expect(await screen.findByText("Marketing DB")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /field mapping/i }));

    expect(await screen.findByRole("note")).toHaveTextContent(/not declared as necessary/i);
    // The warning came from the GET response alone -- "Save mappings" was never clicked.
    expect(screen.getByRole("button", { name: /save mappings/i })).toBeInTheDocument();
  });
});

describe("DataSourceDetailPage -- Purposes tab", () => {
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

  it("unwraps the { purposes: [...] } envelope from GET .../purposes, not a bare array", async () => {
    const user = userEvent.setup();
    await loginAndRenderDetailPage();

    expect(await screen.findByText("Marketing DB")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /purposes/i }));

    // If the page still treated the response as a bare array, `.map` over
    // the envelope object would either throw or silently show nothing --
    // either way the purpose name below would never render.
    expect(await screen.findByText("Order Fulfilment")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /order fulfilment/i })).toBeChecked();

    // isReviewed: false on the wire must render the amber chip directly,
    // never re-derived from reviewedByEmployeeId.
    expect(screen.getByText("Not yet reviewed")).toBeInTheDocument();
  });
});

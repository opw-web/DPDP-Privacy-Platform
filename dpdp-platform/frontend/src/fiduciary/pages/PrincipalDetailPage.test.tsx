import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AttributedValue, PrincipalDetailPage } from "./PrincipalDetailPage";
import { employeeLogin, employeeLogout } from "../../lib/auth";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const DETAIL_RESPONSE = {
  id: "p1",
  reference: "DP-000001",
  ageStatus: "ADULT",
  ageStatusSource: "DOB_DERIVED",
  ageStatusSetAt: "2026-08-20T00:00:00.000Z",
  lastPrincipalContactAt: "2026-08-25T00:00:00.000Z",
  lastPrincipalContactSource: "PORTAL_LOGIN",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  displayName: "Aman Gupta",
  displayNameSources: [{ id: "src-mkt", name: "Marketing" }],
  fields: [
    {
      id: "f1",
      canonicalField: "FULL_NAME",
      value: "Aman Gupta",
      dataCategory: "IDENTITY",
      sources: [{ id: "src-mkt", name: "Marketing" }],
      isPrimary: true,
      conflict: false,
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "f2",
      canonicalField: "PHONE",
      value: "+91 98****3210",
      dataCategory: "CONTACT",
      sources: [
        { id: "src-mkt", name: "Marketing" },
        { id: "src-support", name: "Support" },
      ],
      isPrimary: true,
      conflict: false,
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "f3",
      canonicalField: "EMAIL",
      value: "am**@gm***.com",
      dataCategory: "CONTACT",
      sources: [
        { id: "src-mkt", name: "Marketing" },
        { id: "src-sales", name: "Sales" },
      ],
      isPrimary: true,
      conflict: false,
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "f4",
      canonicalField: "CITY",
      value: "Mumbai",
      dataCategory: "DEMOGRAPHIC",
      sources: [{ id: "src-mkt", name: "Marketing" }],
      isPrimary: true,
      conflict: true,
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "f5",
      canonicalField: "CITY",
      value: "Pune",
      dataCategory: "DEMOGRAPHIC",
      sources: [{ id: "src-support", name: "Support" }],
      isPrimary: false,
      conflict: true,
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
  ],
};

const SOURCE_RECORDS_RESPONSE = {
  principal: { id: "p1", reference: "DP-000001" },
  records: [
    {
      id: "lr1",
      dataSourceId: "src-mkt",
      sourceRecordKey: "mkt-1",
      firstSeenAt: "2026-07-01T00:00:00.000Z",
      lastSeenAt: "2026-08-01T00:00:00.000Z",
      source: { id: "src-mkt", name: "Marketing" },
      normalizedRecordId: "nr1",
      link: { confidence: "EXACT", createdAt: "2026-07-01T00:00:00.000Z" },
    },
  ],
};

const RECIPIENTS_RESPONSE = [
  {
    id: "act1",
    recipientId: "rec1",
    description: "Monthly billing export",
    dataCategories: ["FINANCIAL"],
    startedAt: "2026-06-01T00:00:00.000Z",
    endedAt: null,
    recipient: {
      id: "rec1",
      name: "Acme Payments Ltd",
      type: "DATA_PROCESSOR",
      contactEmail: "dpo@acmepay.example",
      country: "IN",
    },
  },
];

interface MockRoutes {
  onDetail?: () => Response;
}

async function loginAndRender(routes: MockRoutes = {}) {
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
          permissions: ["CAN_VIEW_PRINCIPALS", "CAN_VIEW_ALL_PERSONAL_DATA", "CAN_RESOLVE_IDENTITIES"],
        }),
      );
    }
    if (url.endsWith("/auth/employee/logout")) {
      return Promise.resolve(jsonResponse({}));
    }
    if (url.endsWith("/principals/p1/source-records")) {
      return Promise.resolve(jsonResponse(SOURCE_RECORDS_RESPONSE));
    }
    if (url.endsWith("/principals/p1/recipients")) {
      return Promise.resolve(jsonResponse(RECIPIENTS_RESPONSE));
    }
    if (url.endsWith("/principals/p1")) {
      return Promise.resolve(routes.onDetail ? routes.onDetail() : jsonResponse(DETAIL_RESPONSE));
    }
    throw new Error(`Unexpected fetch to ${url}`);
  });

  await employeeLogin("dpo@example.org", "password");

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={["/app/principals/p1"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/app/principals/:id" element={<PrincipalDetailPage />} />
          <Route path="/app/principals" element={<div>Principals list shell</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AttributedValue (structural enforcement of Check 8)", () => {
  it("renders nothing when given no sources, even with a real value in hand", () => {
    const { container } = render(<AttributedValue label="Phone" value="123456" sources={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("attributed-value")).not.toBeInTheDocument();
  });

  it("renders the value and a chip per source when sources are present", () => {
    render(
      <AttributedValue
        label="Phone"
        value="+91 98****3210"
        sources={[
          { id: "a", name: "Marketing" },
          { id: "b", name: "Support" },
        ]}
      />,
    );
    const el = screen.getByTestId("attributed-value");
    expect(within(el).getByText("+91 98****3210")).toBeInTheDocument();
    expect(within(el).getByText("Marketing")).toBeInTheDocument();
    expect(within(el).getByText("Support")).toBeInTheDocument();
  });
});

describe("PrincipalDetailPage", () => {
  afterEach(async () => {
    try {
      await employeeLogout();
    } finally {
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it("names the phone value's lineage as Marketing and Support, and the email's as Marketing and Sales (Check 8)", async () => {
    await loginAndRender();

    const phoneValue = await screen.findByText("+91 98****3210");
    const phoneRow = phoneValue.closest("dd") as HTMLElement;
    expect(within(phoneRow).getByText("Marketing")).toBeInTheDocument();
    expect(within(phoneRow).getByText("Support")).toBeInTheDocument();

    const emailValue = screen.getByText("am**@gm***.com");
    const emailRow = emailValue.closest("dd") as HTMLElement;
    expect(within(emailRow).getByText("Marketing")).toBeInTheDocument();
    expect(within(emailRow).getByText("Sales")).toBeInTheDocument();
  });

  it("renders a masked value exactly as the server sent it, never altered", async () => {
    await loginAndRender();
    expect(await screen.findByText("am**@gm***.com")).toBeInTheDocument();
    expect(screen.queryByText(/aman@gmail\.com/i)).not.toBeInTheDocument();
  });

  it("renders a conflicting field in amber, with both values and both sets of sources (Check 10)", async () => {
    await loginAndRender();

    const badge = await screen.findByTestId("conflict-badge");
    expect(within(badge).getByText("Mumbai")).toBeInTheDocument();
    expect(within(badge).getByText("Pune")).toBeInTheDocument();
    expect(within(badge).getByText("Marketing")).toBeInTheDocument();
    expect(within(badge).getByText("Support")).toBeInTheDocument();
  });

  it("renders the RT-04 recipients this principal's data has been shared with", async () => {
    await loginAndRender();
    expect(await screen.findByText("Acme Payments Ltd")).toBeInTheDocument();
    expect(screen.getByText(/monthly billing export/i)).toBeInTheDocument();
  });

  it("never claims a purpose without attribution -- shows an honest gap, not a guess", async () => {
    await loginAndRender();
    expect(await screen.findByText(/purposes served/i)).toBeInTheDocument();
    expect(screen.getByText(/not available from this view/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open purposes register/i })).toHaveAttribute(
      "href",
      "/app/purposes",
    );
  });

  it("shows an explained not-found state rather than crashing on a missing principal", async () => {
    await loginAndRender({ onDetail: () => jsonResponse({ message: "Not found" }, 404) });
    expect(await screen.findByText(/principal not found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to principals/i })).toHaveAttribute(
      "href",
      "/app/principals",
    );
  });
});

import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Step3Mapping } from "./Step3Mapping";
import { employeeTokenStore } from "../../../lib/api-client";
import type { MappingWarning, PublicDataSourceField } from "../../lib/data-sources-api";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const FIELDS: PublicDataSourceField[] = [
  { id: "f1", fieldName: "email", sampleValue: "person@example.com", inferredType: "string" },
  { id: "f2", fieldName: "fullName", sampleValue: "Person Name", inferredType: "string" },
];

const CATEGORY_WARNING: MappingWarning = {
  type: "CATEGORY_OUTSIDE_PURPOSES",
  sourceField: "fullName",
  canonicalField: "FULL_NAME",
  dataCategory: "IDENTITY",
  attachedPurposes: [
    { id: "p1", code: "ORDER_FULFILMENT", name: "Order Fulfilment", dataCategories: ["CONTACT"] },
  ],
  message:
    'Field "fullName" (FULL_NAME) collects data category IDENTITY, which is not declared as ' +
    "necessary by any of this source's attached purposes (ORDER_FULFILMENT).",
};

function renderStep3(props: Partial<ComponentProps<typeof Step3Mapping>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Step3Mapping
        dataSourceId="ds1"
        fields={FIELDS}
        onSaved={() => undefined}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("Step3Mapping -- CN-02 data-minimisation warning rendering", () => {
  beforeEach(() => {
    employeeTokenStore.set("employee-jwt");
  });

  afterEach(() => {
    employeeTokenStore.set(null);
    vi.restoreAllMocks();
  });

  it("renders the warning inline in amber for the field it names, after a save returns one -- and not for the covered field (positive control)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        mappings: [
          {
            id: "m1",
            sourceField: "email",
            canonicalField: "EMAIL",
            dataCategory: "CONTACT",
            containsPersonalData: true,
            isVerifiedCustomerId: false,
            comparisonPolicy: "MULTI_VALUE",
          },
          {
            id: "m2",
            sourceField: "fullName",
            canonicalField: "FULL_NAME",
            dataCategory: "IDENTITY",
            containsPersonalData: true,
            isVerifiedCustomerId: false,
            comparisonPolicy: "NOT_COMPARABLE",
          },
        ],
        warnings: [CATEGORY_WARNING],
      }),
    );
    const user = userEvent.setup();
    renderStep3();

    await user.selectOptions(screen.getByLabelText(/canonical field for email/i), "EMAIL");
    await user.selectOptions(screen.getByLabelText(/data category for email/i), "CONTACT");
    await user.selectOptions(screen.getByLabelText(/comparison policy for email/i), "MULTI_VALUE");
    await user.selectOptions(screen.getByLabelText(/canonical field for fullname/i), "FULL_NAME");
    await user.selectOptions(screen.getByLabelText(/data category for fullname/i), "IDENTITY");
    await user.click(screen.getByRole("button", { name: /save mappings/i }));

    const warningNote = await screen.findByRole("note");
    expect(warningNote).toHaveTextContent(/not declared as necessary/i);
    // Exactly one warning rendered -- the covered "email" field gets none.
    expect(screen.getAllByRole("note")).toHaveLength(1);
  });

  it("submits the reviewed comparison policy and defaults an unreviewed mapping to not comparable", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ mappings: [], warnings: [] }),
    );
    const user = userEvent.setup();
    renderStep3();

    await user.selectOptions(screen.getByLabelText(/canonical field for email/i), "EMAIL");
    await user.selectOptions(screen.getByLabelText(/data category for email/i), "CONTACT");
    await user.selectOptions(screen.getByLabelText(/comparison policy for email/i), "MULTI_VALUE");
    await user.selectOptions(screen.getByLabelText(/canonical field for fullname/i), "FULL_NAME");
    await user.selectOptions(screen.getByLabelText(/data category for fullname/i), "IDENTITY");
    await user.click(screen.getByRole("button", { name: /save mappings/i }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body)) as {
      mappings: Array<{ sourceField: string; comparisonPolicy: string }>;
    };
    expect(body.mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceField: "email",
          comparisonPolicy: "MULTI_VALUE",
        }),
        expect.objectContaining({
          sourceField: "fullName",
          comparisonPolicy: "NOT_COMPARABLE",
        }),
      ]),
    );
  });

  it("renders a standing warning immediately on mount via initialWarnings -- CN-02 is a standing property, not only visible right after saving", () => {
    renderStep3({ initialWarnings: [CATEGORY_WARNING] });

    const warningNote = screen.getByRole("note");
    expect(warningNote).toHaveTextContent(/not declared as necessary/i);
  });

  it("renders no warning banners when there are none to show", () => {
    renderStep3();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Step1Connection } from "./Step1Connection";
import { employeeTokenStore } from "../../../lib/api-client";
import type { PublicDataSource } from "../../lib/data-sources-api";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const EXISTING_DATA_SOURCE: PublicDataSource = {
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderStep1(dataSource?: PublicDataSource) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Step1Connection dataSource={dataSource} onSaved={() => undefined} />
    </QueryClientProvider>,
  );
}

describe("Step1Connection -- credential handling on edit", () => {
  beforeEach(() => {
    employeeTokenStore.set("employee-jwt");
  });

  afterEach(() => {
    employeeTokenStore.set(null);
    vi.restoreAllMocks();
  });

  it("never pre-fills the credential input, and only shows credentialHint until 'Replace credentials' is checked", () => {
    renderStep1(EXISTING_DATA_SOURCE);

    // No credential input exists at all until the user opts in.
    expect(screen.queryByLabelText(/new credential/i)).not.toBeInTheDocument();
    expect(screen.getByText(/current credential ends in/i)).toHaveTextContent("9wXy");

    // Nothing on the page renders the literal stored hint as if it were an editable value.
    expect(screen.queryByDisplayValue("9wXy")).not.toBeInTheDocument();
  });

  it("reveals an EMPTY credential input when 'Replace credentials' is checked -- never pre-filled", async () => {
    const user = userEvent.setup();
    renderStep1(EXISTING_DATA_SOURCE);

    await user.click(screen.getByLabelText(/replace credentials/i));

    const credentialInput = screen.getByLabelText(/new credential/i) as HTMLInputElement;
    expect(credentialInput).toBeInTheDocument();
    expect(credentialInput.value).toBe("");
  });

  it("omits the credential key entirely from the PATCH body when not replacing -- never echoes the stored value", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ...EXISTING_DATA_SOURCE, name: "Marketing DB (renamed)" }),
    );
    const user = userEvent.setup();
    renderStep1(EXISTING_DATA_SOURCE);

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/data-sources/ds1"));
      expect(call).toBeDefined();
      const [, init] = call as [string, RequestInit];
      const body = JSON.parse(String(init.body));
      expect(Object.prototype.hasOwnProperty.call(body, "credential")).toBe(false);
      expect(JSON.stringify(body)).not.toContain(EXISTING_DATA_SOURCE.credentialHint);
    });
  });

  it("sends ONLY the newly-typed value when replacing -- the request body never echoes the old stored credential", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ...EXISTING_DATA_SOURCE }),
    );
    const user = userEvent.setup();
    renderStep1(EXISTING_DATA_SOURCE);

    await user.click(screen.getByLabelText(/replace credentials/i));
    await user.type(screen.getByLabelText(/new credential/i), "brand-new-secret-value");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/data-sources/ds1"));
      expect(call).toBeDefined();
      const [, init] = call as [string, RequestInit];
      const body = JSON.parse(String(init.body));
      expect(body.credential).toBe("brand-new-secret-value");
      // The captured request body itself never carries the old stored hint/value.
      expect(JSON.stringify(body)).not.toContain(EXISTING_DATA_SOURCE.credentialHint);
    });
  });
});

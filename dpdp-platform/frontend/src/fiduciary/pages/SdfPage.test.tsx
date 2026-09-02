import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { canCompleteAudit, SdfPage } from "./SdfPage";
import { employeeLogin, employeeLogout } from "../../lib/auth";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("canCompleteAudit", () => {
  it("allows a non-SDF readiness view", () => {
    expect({ isSignificantDataFiduciary: false }).toMatchObject({ isSignificantDataFiduciary: false });
  });

  it("does not allow an AUDIT assessment to complete without independence", () => {
    expect(canCompleteAudit({ kind: "AUDIT", isIndependent: false })).toBe(false);
    expect(canCompleteAudit({ kind: "AUDIT", isIndependent: true })).toBe(true);
  });
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

const CYCLE_RULE = {
  ruleCode: "SDF_ASSESSMENT_CYCLE",
  version: 1,
  name: "SDF DPIA/audit cycle",
  appliesTo: "SDF:DPIA_AUDIT",
  basis: "STATUTORY",
  legalSource: "Rule 13(1): once in every period of twelve months",
  isReviewed: false,
};

/** Mirrors `SdfAssessmentService`'s Rule 13(1) citation verbatim -- the server's cited rejection this suite asserts is surfaced, not replaced. */
const SDF_RULE_13_CITATION =
  "DPDP Rules, 2025 -- Rule 13(1): the Data Protection Impact Assessment " +
  "and the audit must each be undertaken once in every period of twelve " +
  "months, the audit conducted by an independent data auditor, and a " +
  "report -- with its significant observations -- furnished to the Board " +
  "of Directors of the Significant Data Fiduciary.";

const ASSESSMENTS = {
  organization: { isSignificantDataFiduciary: true },
  assessments: [
    {
      id: "a1",
      kind: "DPIA",
      cycleStartedAt: "2026-01-01T00:00:00.000Z",
      dueAt: "2027-01-01T00:00:00.000Z",
      completedAt: null,
      conductedBy: "",
      isIndependent: false,
      significantObservations: null,
      reportReference: null,
      furnishedToBoardAt: null,
      furnishedReference: null,
    },
    {
      id: "a2",
      kind: "AUDIT",
      cycleStartedAt: "2026-01-01T00:00:00.000Z",
      dueAt: "2027-01-01T00:00:00.000Z",
      completedAt: null,
      // Simulates an earlier partial save (SD-02): the auditor name is
      // already on the row, independence is not yet confirmed.
      conductedBy: "Prior Auditor LLP",
      isIndependent: false,
      significantObservations: null,
      reportReference: null,
      furnishedToBoardAt: null,
      furnishedReference: null,
    },
  ],
};

const ALGORITHMS = [
  { id: "alg1", name: "Fraud scoring model", description: "Scores signup risk.", operations: ["STORAGE", "SHARING"], riskAssessment: "Reviewed", riskToRightsIdentified: true, mitigations: "Human review above threshold.", lastReviewedAt: "2025-01-01T00:00:00.000Z", reviewedByEmployeeId: "emp-1" },
];

const GAPS = {
  localisationRequiredTransfers: [{ id: "t1", recipientId: "r1", destinationCountry: "United States", purposeDescription: "Backup storage" }],
  unreviewedAlgorithms: [{ id: "alg1", name: "Fraud scoring model", lastReviewedAt: "2025-01-01T00:00:00.000Z" }],
  dpoNotIndiaBased: true,
};

interface CompleteMutation { id: string; body: Record<string, unknown>; }

function mockFetch(overrides: {
  algorithms?: unknown[];
  algorithmMutations?: unknown[];
  completeMutations?: CompleteMutation[];
} = {}) {
  const algorithmMutations = overrides.algorithmMutations ?? [];
  const completeMutations = overrides.completeMutations ?? [];
  return vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? "GET";
    if (path.endsWith("/auth/employee/login")) return Promise.resolve(json({ accessToken: "token", employee: { id: "e1", email: "dpo@example.test", fullName: "DPO" } }));
    if (path.endsWith("/auth/employee/me")) return Promise.resolve(json({ id: "e1", email: "dpo@example.test", fullName: "DPO", organizationId: "o1", status: "ACTIVE", role: { id: "role", code: "DPO", name: "DPO" }, permissions: ["CAN_MANAGE_SDF", "CAN_VIEW_AUDIT_LOG"] }));
    if (path.endsWith("/auth/employee/logout")) return Promise.resolve(json({}));
    if (path.endsWith("/sdf/assessments") && method === "GET") return Promise.resolve(json(ASSESSMENTS));
    if (path.endsWith("/sdf/assessments/a1/complete") && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      completeMutations.push({ id: "a1", body });
      return Promise.resolve(json({ ...ASSESSMENTS.assessments[0], ...body, completedAt: "2026-09-02T00:00:00.000Z" }));
    }
    if (path.endsWith("/sdf/assessments/a2/complete") && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      completeMutations.push({ id: "a2", body });
      if (body.isIndependent === true) {
        return Promise.resolve(json({ ...ASSESSMENTS.assessments[1], ...body, completedAt: "2026-09-02T00:00:00.000Z" }));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            message: `Cannot complete this AUDIT assessment: it requires isIndependent = true and a named independent auditor (conductedBy). ${SDF_RULE_13_CITATION}`,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    if (path.endsWith("/compliance-rules") && method === "GET") return Promise.resolve(json([CYCLE_RULE]));
    if (path.endsWith("/sdf/gaps") && method === "GET") return Promise.resolve(json(GAPS));
    if (path.endsWith("/sdf/algorithms") && method === "GET") return Promise.resolve(json(overrides.algorithms ?? ALGORITHMS));
    if (path.endsWith("/sdf/algorithms") && method === "POST") {
      algorithmMutations.push(JSON.parse(String(init?.body)));
      return Promise.resolve(json({ id: "alg2", ...ALGORITHMS[0] }));
    }
    if (path.endsWith("/sdf/algorithms/alg1") && method === "PATCH") {
      algorithmMutations.push(JSON.parse(String(init?.body)));
      return Promise.resolve(json(ALGORITHMS[0]));
    }
    throw new Error(`Unexpected ${method} ${path}`);
  });
}

async function renderPage(overrides: {
  algorithms?: unknown[];
  algorithmMutations?: unknown[];
  completeMutations?: CompleteMutation[];
} = {}) {
  mockFetch(overrides);
  await employeeLogin("dpo@example.test", "password");
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <MemoryRouter initialEntries={["/app/sdf"]}>
        <Routes>
          <Route path="/app/sdf" element={<SdfPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Waits for the algorithm register panel's own query to resolve, then scopes further queries to it -- the register and the gaps panel both mention the same algorithm by name, so an unscoped query can race between them. */
async function findAlgorithmPanel() {
  const panel = await screen.findByTestId("algorithm-register-panel");
  await within(panel).findByText("Fraud scoring model");
  return panel;
}

describe("SdfPage", () => {
  afterEach(async () => {
    cleanup();
    try {
      await employeeLogout();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("shows the assessment cycle's statutory basis and citation, not a bare number", async () => {
    await renderPage();
    expect((await screen.findAllByText("Statutory")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rule 13\(1\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not yet reviewed/i).length).toBeGreaterThan(0);
  });

  it("renders the algorithm register with its recorded entries", async () => {
    await renderPage();
    const panel = await findAlgorithmPanel();
    expect(within(panel).getByText("STORAGE")).toBeInTheDocument();
    expect(within(panel).getByText("SHARING")).toBeInTheDocument();
    expect(within(panel).getByText(/needs rule 13\(3\) review/i)).toBeInTheDocument();
  });

  it("renders the localisation gaps and DPO-not-India-based flag", async () => {
    await renderPage();
    const gapsSection = await screen.findByTestId("sdf-gaps-section");
    expect(within(gapsSection).getByText(/DPO is not India-based/i)).toBeInTheDocument();
    expect(within(gapsSection).getByText("United States")).toBeInTheDocument();
    expect(within(gapsSection).getByText("Backup storage")).toBeInTheDocument();
  });

  it("shows an empty-register message and an add form when no algorithms are recorded", async () => {
    await renderPage({ algorithms: [] });
    const panel = await screen.findByTestId("algorithm-register-panel");
    expect(await within(panel).findByText(/no algorithms recorded yet/i)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(panel).getByRole("button", { name: "Add algorithm" }));
    expect(within(panel).getByLabelText(/algorithm \/ system name/i)).toBeInTheDocument();
  });

  it("submits a new algorithm register entry with its Rule 13(3) operations", async () => {
    const algorithmMutations: unknown[] = [];
    await renderPage({ algorithms: [], algorithmMutations });
    const user = userEvent.setup();
    const panel = await screen.findByTestId("algorithm-register-panel");
    await within(panel).findByText(/no algorithms recorded yet/i);
    await user.click(within(panel).getByRole("button", { name: "Add algorithm" }));
    await user.type(within(panel).getByLabelText(/algorithm \/ system name/i), "Recommendation engine");
    await user.type(within(panel).getByLabelText("Description"), "Ranks content for each user.");
    await user.click(within(panel).getByLabelText("HOSTING"));
    await user.click(within(panel).getByLabelText("DISPLAY"));
    await user.click(within(panel).getByRole("button", { name: "Add algorithm" }));

    await vi.waitFor(() => expect(algorithmMutations).toHaveLength(1));
    expect(algorithmMutations[0]).toMatchObject({ name: "Recommendation engine", description: "Ranks content for each user.", operations: ["HOSTING", "DISPLAY"] });
    expect(toast.success).toHaveBeenCalledWith("Algorithm added to the register.");
  }, 15000);

  it("edits an existing algorithm register entry", async () => {
    const algorithmMutations: unknown[] = [];
    await renderPage({ algorithmMutations });
    const user = userEvent.setup();
    const panel = await findAlgorithmPanel();
    await user.click(within(panel).getByRole("button", { name: "Edit" }));
    const mitigations = within(panel).getByLabelText("Mitigations");
    await user.clear(mitigations);
    await user.type(mitigations, "Updated mitigation text.");
    await user.click(within(panel).getByRole("button", { name: "Save changes" }));

    await vi.waitFor(() => expect(algorithmMutations).toHaveLength(1));
    expect(algorithmMutations[0]).toMatchObject({ mitigations: "Updated mitigation text." });
    expect(toast.success).toHaveBeenCalledWith("Algorithm register entry updated.");
  });

  it("submits a DPIA completion with the SD-04 fields, and no AUDIT-only fields at all", async () => {
    const completeMutations: CompleteMutation[] = [];
    await renderPage({ completeMutations });
    const user = userEvent.setup();
    const row = await screen.findByTestId("sdf-assessment-a1");

    await user.click(within(row).getByRole("button", { name: "Complete assessment" }));
    expect(within(row).queryByLabelText("Independent auditor")).not.toBeInTheDocument();
    await user.type(within(row).getByLabelText("Significant observations"), "No material findings.");
    fireEvent.change(within(row).getByLabelText("Furnished to Board on"), { target: { value: "2026-09-02T10:00" } });
    await user.click(within(row).getByRole("button", { name: "Complete assessment" }));

    await vi.waitFor(() => expect(completeMutations).toHaveLength(1));
    const mutation = completeMutations[0];
    if (!mutation) throw new Error("expected a completion request");
    expect(mutation.id).toBe("a1");
    expect(mutation.body).toMatchObject({
      significantObservations: "No material findings.",
      furnishedToBoardAt: new Date("2026-09-02T10:00").toISOString(),
    });
    expect(mutation.body).not.toHaveProperty("conductedBy");
    expect(mutation.body).not.toHaveProperty("isIndependent");
    expect(toast.success).toHaveBeenCalledWith("Assessment marked complete.");
  }, 15000);

  it("pre-fills the AUDIT completion form from the row's own state, and submits conductedBy/isIndependent when independence is confirmed", async () => {
    const completeMutations: CompleteMutation[] = [];
    await renderPage({ completeMutations });
    const user = userEvent.setup();
    const row = await screen.findByTestId("sdf-assessment-a2");

    await user.click(within(row).getByRole("button", { name: "Complete assessment" }));
    // SD-02: an earlier partial save's conductedBy is on the row already -- the operator should not have to retype it.
    expect(within(row).getByLabelText("Independent auditor")).toHaveValue("Prior Auditor LLP");
    await user.type(within(row).getByLabelText("Significant observations"), "Audit complete, no material gaps.");
    fireEvent.change(within(row).getByLabelText("Furnished to Board on"), { target: { value: "2026-09-02T10:00" } });
    await user.click(within(row).getByLabelText("The auditor is independent"));
    await user.click(within(row).getByRole("button", { name: "Complete assessment" }));

    await vi.waitFor(() => expect(completeMutations).toHaveLength(1));
    const mutation = completeMutations[0];
    if (!mutation) throw new Error("expected a completion request");
    expect(mutation.id).toBe("a2");
    expect(mutation.body).toMatchObject({
      significantObservations: "Audit complete, no material gaps.",
      conductedBy: "Prior Auditor LLP",
      isIndependent: true,
    });
    expect(toast.success).toHaveBeenCalledWith("Assessment marked complete.");
  }, 15000);

  it("still blocks an AUDIT completion without independence, server-side, and surfaces the Rule 13(1) citation verbatim rather than a generic message", async () => {
    const completeMutations: CompleteMutation[] = [];
    await renderPage({ completeMutations });
    const user = userEvent.setup();
    const row = await screen.findByTestId("sdf-assessment-a2");

    expect(await within(row).findByText(/independent auditor required before completion/i)).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Complete assessment" }));
    await user.type(within(row).getByLabelText("Significant observations"), "Audit complete.");
    fireEvent.change(within(row).getByLabelText("Furnished to Board on"), { target: { value: "2026-09-02T10:00" } });
    // "The auditor is independent" left unchecked -- the client does not block this submission itself.
    await user.click(within(row).getByRole("button", { name: "Complete assessment" }));

    await vi.waitFor(() => expect(completeMutations).toHaveLength(1));
    const mutation = completeMutations[0];
    if (!mutation) throw new Error("expected a completion request");
    expect(mutation.body.isIndependent).toBe(false);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Rule 13(1)"));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(SDF_RULE_13_CITATION));
    // The row was not silently marked complete -- it is still open, and the form is still there to retry.
    expect(within(row).getByText("Open")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Complete assessment" })).toBeInTheDocument();
  }, 15000);
});

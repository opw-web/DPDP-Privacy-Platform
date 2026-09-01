import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { countdown } from "../components/breaches/BreachObligationCard";
import {
  buildBreachPayload,
  hasRequiredAffectedSources,
  hasRequiredBreachTimes,
} from "./BreachWizardPage";
import { originalBoardDetailDueAt } from "./BreachDetailPage";
import { BreachObligationCard } from "../components/breaches/BreachObligationCard";

afterEach(() => cleanup());

describe("breach operations", () => {
  it("requires both occurredAt and becameAwareAt before creating a breach", () => {
    expect(hasRequiredBreachTimes("", "2026-08-01T00:00")).toBe(false);
    expect(hasRequiredBreachTimes("2026-08-01T00:00", "")).toBe(false);
    expect(hasRequiredBreachTimes("2026-08-01T00:00", "2026-08-02T00:00")).toBe(true);
  });

  it("requires at least one affected data source", () => {
    expect(hasRequiredAffectedSources([])).toBe(false);
    expect(hasRequiredAffectedSources(["", "  "])).toBe(false);
    expect(hasRequiredAffectedSources(["marketing-source"])).toBe(true);
  });

  it("builds a create payload with selected sources, categories, and both incident clocks", () => {
    const payload = buildBreachPayload({
      title: "  Marketing database exposure  ",
      description: "  A compromised export was discovered.  ",
      occurredAt: "2026-08-27T22:00",
      becameAwareAt: "2026-09-01T16:00",
      affectedSourceIds: ["marketing-source", "marketing-source", ""],
      dataCategories: ["CONTACT", "IDENTITY"],
    });

    expect(payload).toMatchObject({
      title: "Marketing database exposure",
      description: "A compromised export was discovered.",
      affectedSourceIds: ["marketing-source"],
      dataCategories: ["CONTACT", "IDENTITY"],
    });
    expect(payload.occurredAt).toBe(new Date("2026-08-27T22:00").toISOString());
    expect(payload.becameAwareAt).toBe(new Date("2026-09-01T16:00").toISOString());
  });

  it("provides countdown text for each of three obligation clocks", () => {
    const now = Date.parse("2026-08-01T00:00:00Z");
    expect(countdown("2026-08-01T01:00:00Z", now)).toContain("remaining");
    expect(countdown("2026-08-02T00:00:00Z", now)).toContain("remaining");
    expect(countdown("2026-07-31T23:00:00Z", now)).toBe("Overdue");
  });

  it("renders each obligation with its citation and basis chip", () => {
    render(<div>{["BOARD_INITIAL", "BOARD_DETAIL", "PRINCIPAL_NOTICE"].map((code) => <BreachObligationCard key={code} breachId="b1" obligation={{ id: code, code, legalSourceSnapshot: "s.8(6)", basisSnapshot: "STATUTORY", dueAt: "2027-01-01T00:00:00Z", status: "OPEN", evidenceReference: null }} />)}</div>);
    // Each card shows the citation in its body and in the accessible basis
    // tooltip text, so three cards produce six discoverable text nodes.
    expect(screen.getAllByText("s.8(6)")).toHaveLength(6);
    expect(screen.getAllByText("Statutory")).toHaveLength(3);
    expect(screen.getAllByText(/remaining|Overdue/)).toHaveLength(3);
  });

  it("keeps the original BOARD_DETAIL date available when an extension is recorded", () => {
    expect(originalBoardDetailDueAt([
      { id: "1", code: "BOARD_INITIAL", legalSourceSnapshot: "s.8(6)", basisSnapshot: "STATUTORY", dueAt: "2026-08-03T00:00:00Z", status: "OPEN", evidenceReference: null },
      { id: "2", code: "BOARD_DETAIL", legalSourceSnapshot: "s.8(6)", basisSnapshot: "STATUTORY", dueAt: "2026-08-10T00:00:00Z", status: "OPEN", evidenceReference: null },
    ])).toBe("2026-08-10T00:00:00Z");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { countdown } from "../components/breaches/BreachObligationCard";
import {
  buildAffectedPreviewPayload,
  buildBreachPayload,
  hasRequiredAffectedSources,
  hasRequiredBreachTimes,
  missingRule71NarrativeLabels,
  RULE_7_1_ELEMENTS,
  type BreachWizardValues,
} from "./BreachWizardPage";
import { buildExtensionPayload, originalBoardDetailDueAt } from "./BreachDetailPage";
import { BreachObligationCard } from "../components/breaches/BreachObligationCard";

const BASE_WIZARD_VALUES: BreachWizardValues = {
  title: "Marketing database exposure",
  description: "A compromised export was discovered.",
  occurredAt: "2026-08-27T22:00",
  becameAwareAt: "2026-09-01T16:00",
  affectedSourceIds: ["marketing-source"],
  dataCategories: ["CONTACT"],
};

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

  it("falls back to dueAt for the original BOARD_DETAIL date when the clock has never been extended", () => {
    expect(originalBoardDetailDueAt([
      { id: "1", code: "BOARD_INITIAL", legalSourceSnapshot: "s.8(6)", basisSnapshot: "STATUTORY", dueAt: "2026-08-03T00:00:00Z", status: "OPEN", evidenceReference: null, originalDueAt: null },
      { id: "2", code: "BOARD_DETAIL", legalSourceSnapshot: "s.8(6)", basisSnapshot: "STATUTORY", dueAt: "2026-08-10T00:00:00Z", status: "OPEN", evidenceReference: null, originalDueAt: null },
    ])).toBe("2026-08-10T00:00:00Z");
  });

  // D8 regression: dueAt is overwritten in place when an extension is
  // recorded, so reading it back as "the original" would silently return
  // the NEW date. The true original must come from originalDueAt, which
  // stays fixed even though dueAt has moved.
  it("D8 regression: returns the true original BOARD_DETAIL date, not the current (extended) dueAt", () => {
    expect(originalBoardDetailDueAt([
      { id: "1", code: "BOARD_INITIAL", legalSourceSnapshot: "s.8(6)", basisSnapshot: "STATUTORY", dueAt: "2026-08-03T00:00:00Z", status: "OPEN", evidenceReference: null, originalDueAt: null },
      { id: "2", code: "BOARD_DETAIL", legalSourceSnapshot: "s.8(6)", basisSnapshot: "STATUTORY", dueAt: "2026-08-20T00:00:00Z", status: "OPEN", evidenceReference: null, originalDueAt: "2026-08-10T00:00:00Z" },
    ])).toBe("2026-08-10T00:00:00Z");
  });

  // Defect 2 (wizard steps 4-8): affected-principal preview, the five
  // Rule 7(1) narrative fields, and the six-element pre-fill review.
  it("previews affected principals from the selected data sources by default", () => {
    expect(buildAffectedPreviewPayload("sources", ["source-a", "source-b"], "")).toEqual({
      sourceIds: ["source-a", "source-b"],
    });
  });

  it("previews affected principals from a manual/CSV list when that mode is chosen", () => {
    expect(buildAffectedPreviewPayload("manual", ["source-a"], "dp-1\ndp-2")).toEqual({
      csv: "dp-1\ndp-2",
    });
  });

  it("names all six Rule 7(1) elements, breach reference first", () => {
    expect(RULE_7_1_ELEMENTS.map((element) => element.key)).toEqual([
      "reference",
      "natureExtentTiming",
      "consequences",
      "mitigationMeasures",
      "safetyMeasuresForPrincipals",
      "responderContact",
    ]);
  });

  it("flags every one of the five narrative elements as missing on a bare breach", () => {
    expect(missingRule71NarrativeLabels(BASE_WIZARD_VALUES)).toHaveLength(5);
  });

  it("clears a narrative element from the missing list once it is filled in", () => {
    const missing = missingRule71NarrativeLabels({
      ...BASE_WIZARD_VALUES,
      natureExtentTiming: "A misconfigured export exposed contact records.",
    });
    expect(missing).toHaveLength(4);
    expect(missing).not.toContain("Nature, extent and timing of the breach");
  });

  it("reports no missing elements once all five narrative fields are set", () => {
    expect(
      missingRule71NarrativeLabels({
        ...BASE_WIZARD_VALUES,
        natureExtentTiming: "x",
        consequences: "x",
        mitigationMeasures: "x",
        safetyMeasuresForPrincipals: "x",
        responderContact: "x",
      }),
    ).toEqual([]);
  });

  it("carries the narrative fields, board fields, and manual affected-principal CSV into the create payload", () => {
    const payload = buildBreachPayload({
      ...BASE_WIZARD_VALUES,
      affectedPrincipalsCsv: "dp-1\ndp-2",
      natureExtentTiming: "  A misconfigured export.  ",
      consequences: "",
      mitigationMeasures: "Access revoked.",
      safetyMeasuresForPrincipals: undefined,
      responderContact: "dpo@acmeretail.demo",
      boardBroadFacts: "  Full account for the Board.  ",
    });
    expect(payload.csv).toBe("dp-1\ndp-2");
    expect(payload.natureExtentTiming).toBe("A misconfigured export.");
    expect(payload.consequences).toBeUndefined();
    expect(payload.mitigationMeasures).toBe("Access revoked.");
    expect(payload.safetyMeasuresForPrincipals).toBeUndefined();
    expect(payload.responderContact).toBe("dpo@acmeretail.demo");
    expect(payload.boardBroadFacts).toBe("Full account for the Board.");
  });

  it("omits csv from the create payload when the sources-only selection mode is used", () => {
    const payload = buildBreachPayload(BASE_WIZARD_VALUES);
    expect(payload.csv).toBeUndefined();
  });

  // Defect 4: the extension form must send requestedAt -- ExtensionDto
  // requires it and the backend 400s on every submission without it.
  it("includes requestedAt in the extension payload, per ExtensionDto", () => {
    const payload = buildExtensionPayload(
      "2026-09-01T09:00",
      "2026-09-08T12:00",
      "BOARD-EXT-2026-0001",
    );
    expect(payload).toEqual({
      requestedAt: new Date("2026-09-01T09:00").toISOString(),
      grantedUntil: new Date("2026-09-08T12:00").toISOString(),
      reference: "BOARD-EXT-2026-0001",
    });
  });
});

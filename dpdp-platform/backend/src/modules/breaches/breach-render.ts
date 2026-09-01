import type PDFDocument from "pdfkit";
import {
  renderPdf,
  writePdfLetterhead,
  writePdfLine,
  writePdfSectionHeading,
} from "../evidence/pdf-utils";
import type { BoardBreachReport } from "./breach.service";

export function renderBoardInitialPdf(
  data: BoardBreachReport,
): Promise<Buffer> {
  return renderPdf((doc: PDFDocument) => {
    writePdfLetterhead(
      doc,
      `Initial breach intimation: ${data.breach.reference}`,
      data.organizationName,
      data.generatedAt,
    );
    writePdfSectionHeading(doc, "Incident");
    writePdfLine(doc, `Title: ${data.breach.title}`);
    writePdfLine(doc, `Description: ${data.breach.description}`);
    writePdfLine(
      doc,
      `Occurred at: ${data.breach.occurredAt?.toISOString() ?? "not recorded"}`,
    );
    writePdfLine(
      doc,
      `Became aware at: ${data.breach.becameAwareAt.toISOString()}`,
    );
    writePdfLine(doc, `Affected principals: ${data.affectedCount}`);
    writePdfLine(
      doc,
      `Involves children: ${data.breach.involvesChildren ? "Yes" : "No"}`,
    );
    writePdfSectionHeading(doc, "Rule 7(1) narrative");
    writePdfLine(
      doc,
      `Nature, extent and timing: ${data.breach.natureExtentTiming ?? "Draft incomplete"}`,
    );
    writePdfLine(
      doc,
      `Consequences: ${data.breach.consequences ?? "Draft incomplete"}`,
    );
    writePdfLine(
      doc,
      `Mitigation: ${data.breach.mitigationMeasures ?? "Draft incomplete"}`,
    );
    writePdfLine(
      doc,
      `Safety measures: ${data.breach.safetyMeasuresForPrincipals ?? "Draft incomplete"}`,
    );
    writePdfLine(
      doc,
      `Responder contact: ${data.breach.responderContact ?? "Draft incomplete"}`,
    );
    writePdfLine(
      doc,
      "The platform does not file this intimation; a responsible employee must review and submit it to the Board.",
    );
  });
}

export function renderBoardDetailedPdf(
  data: BoardBreachReport,
): Promise<Buffer> {
  return renderPdf((doc: PDFDocument) => {
    writePdfLetterhead(
      doc,
      `Detailed Board breach report: ${data.breach.reference}`,
      data.organizationName,
      data.generatedAt,
    );
    writePdfSectionHeading(doc, "Rule 7(2)(b) details");
    writePdfLine(doc, `Updated description: ${data.breach.description}`);
    writePdfLine(
      doc,
      `Broad facts: ${data.breach.boardBroadFacts ?? "Draft incomplete"}`,
    );
    writePdfLine(
      doc,
      `Mitigation measures: ${data.breach.boardMitigation ?? data.breach.mitigationMeasures ?? "Draft incomplete"}`,
    );
    writePdfLine(
      doc,
      `Findings on person who caused it: ${data.breach.boardPerpetratorFindings ?? "Draft incomplete"}`,
    );
    writePdfLine(
      doc,
      `Remedial measures: ${data.breach.boardRemedialMeasures ?? "Draft incomplete"}`,
    );
    writePdfSectionHeading(
      doc,
      "Intimations to affected Data Principals (BR-13)",
    );
    writePdfLine(doc, `Affected principals: ${data.affectedCount}`);
    for (const [status, count] of Object.entries(data.deliveryStatusCounts))
      writePdfLine(doc, `${status}: ${count}`);
    writePdfLine(
      doc,
      "Counts are drawn from CampaignRecipient delivery records; no delivery is claimed without an underlying record.",
    );
    writePdfSectionHeading(doc, "Obligations");
    for (const obligation of data.obligations)
      writePdfLine(
        doc,
        `${obligation.code}: ${obligation.status} — due ${obligation.dueAt.toISOString()} — ${obligation.legalSourceSnapshot} (${obligation.basisSnapshot})`,
      );
    writePdfLine(
      doc,
      "The platform does not file this report; a responsible employee must review and submit it to the Board.",
    );
  });
}

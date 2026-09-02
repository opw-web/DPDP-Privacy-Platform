import type PDFDocument from "pdfkit";
import {
  renderPdf,
  writePdfLetterhead,
  writePdfLine,
  writePdfSectionHeading,
} from "./pdf-utils";
import type { PrincipalEvidenceFile } from "./principal-evidence.service";

/** Renders the EV-03 per-person evidence file as a downloadable PDF. */
export function renderPrincipalEvidencePdf(
  data: PrincipalEvidenceFile,
): Promise<Buffer> {
  return renderPdf((doc: PDFDocument) => {
    writePdfLetterhead(
      doc,
      `Evidence file: ${data.principal.displayName ?? data.principal.reference}`,
      data.organizationName,
      data.generatedAt,
    );
    writePdfLine(doc, `Principal reference: ${data.principal.reference}`);

    writePdfSectionHeading(doc, "Consent events");
    if (data.consentEvents.length === 0) {
      writePdfLine(doc, "No consent events recorded.");
    }
    for (const event of data.consentEvents) {
      writePdfLine(
        doc,
        `${event.createdAt.toISOString()} -- ${event.purposeName ?? event.purposeId}: ` +
          `${event.fromStatus ?? "(none)"} -> ${event.toStatus} via ${event.channel}` +
          `${event.noticeVersionId ? ` (notice ${event.noticeVersionId})` : ""}`,
      );
    }

    writePdfSectionHeading(doc, "Notice versions shown");
    if (data.noticeVersionsShown.length === 0) {
      writePdfLine(doc, "No notice version recorded against a consent event.");
    }
    for (const version of data.noticeVersionsShown) {
      writePdfLine(
        doc,
        `${version.noticeName ?? version.noticeCode ?? version.noticeVersionId} ` +
          `v${version.version ?? "?"} (hash ${version.contentHash ?? "unknown"})`,
      );
    }

    writePdfSectionHeading(doc, "Requests");
    if (data.requests.length === 0) {
      writePdfLine(doc, "No rights requests recorded.");
    }
    for (const request of data.requests) {
      writePdfLine(
        doc,
        `${request.reference} (${request.type}) -- ${request.status}` +
          `${request.completedAt ? `, completed ${request.completedAt.toISOString()}` : ""}`,
      );
      for (const event of request.events) {
        writePdfLine(
          doc,
          `    ${event.createdAt.toISOString()} -- ${event.fromStatus ?? "(none)"} -> ` +
            `${event.toStatus ?? "(unchanged)"} (${event.actorLabel})`,
        );
      }
    }

    writePdfSectionHeading(doc, "Messages received");
    if (data.messagesReceived.length === 0) {
      writePdfLine(doc, "No messages recorded.");
    }
    for (const message of data.messagesReceived) {
      writePdfLine(
        doc,
        `${message.campaignReference} (${message.category}) via ${message.channel} -- ` +
          `${message.status}${message.suppressReason ? ` (${message.suppressReason})` : ""}`,
      );
    }

    writePdfSectionHeading(doc, "Breach inclusions");
    if (data.breachInclusions.length === 0) {
      writePdfLine(doc, "Not named in any recorded breach.");
    }
    for (const breach of data.breachInclusions) {
      writePdfLine(
        doc,
        `${breach.breachReference} -- ${breach.breachTitle} (aware ` +
          `${breach.becameAwareAt.toISOString()})${breach.notifiedAt ? `, notified ${breach.notifiedAt.toISOString()}` : ", not yet notified"}`,
      );
    }
    // No "Notes" section on the number of suppressed records: spec 4.12
    // requires that where `nonDisclosureDirected` is true, the suppressed
    // request never appears in her evidence file -- and naming the fact
    // that something was withheld under a non-disclosure direction
    // discloses exactly what that direction exists to conceal. The file
    // simply omits the suppressed record and says nothing about its
    // absence. The suppression is still recorded in the audit log
    // (`NON_DISCLOSURE_SUPPRESSION_APPLIED`, see `non-disclosure.ts`) and
    // still counted for staff on the internal evidence JSON view
    // (`GET /api/principals/:id/evidence`, `PrincipalEvidencePage.tsx`'s
    // "N visible request(s); M suppressed request(s)"), which is a
    // separate, staff-only surface from this PDF.
  });
}

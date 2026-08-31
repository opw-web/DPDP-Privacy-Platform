import type PDFDocument from "pdfkit";
import { csvDocument, csvRow } from "../inventory/csv-writer";
import {
  renderPdf,
  writePdfLetterhead,
  writePdfLine,
  writePdfSectionHeading,
} from "./pdf-utils";
import type { AccessReportData } from "./access-report.service";

/**
 * Renders the s.11 access report (spec lines 696-703) as a downloadable
 * PDF. Task 12 brief: "Exportable as PDF (pdfkit, installed) and CSV."
 * No controller in this module calls this directly -- the HTTP routes
 * that expose the access report (`GET /api/requests/:ref/access-report.pdf`
 * and `GET /api/me/access-report.pdf`, spec lines 887/890) live in the
 * requests and principal-portal modules respectively, outside this
 * task's owned paths (`src/modules/evidence/**`). Those callers get the
 * report DATA from `AccessReportService.buildReport()` (exported by
 * `EvidenceModule`) and the two render functions below.
 */
export function renderAccessReportPdf(data: AccessReportData): Promise<Buffer> {
  return renderPdf((doc: PDFDocument) => {
    writePdfLetterhead(
      doc,
      `Access report for ${data.principal.displayName ?? data.principal.reference}`,
      data.organizationName,
      data.generatedAt,
    );
    writePdfLine(doc, `Principal reference: ${data.principal.reference}`);
    writePdfLine(doc, `Age status: ${data.principal.ageStatus}`);

    writePdfSectionHeading(doc, "1. Her personal data");
    if (data.personalData.length === 0) {
      writePdfLine(doc, "No personal data fields recorded.");
    }
    for (const field of data.personalData) {
      const sources = field.sources.map((source) => source.name).join(", ");
      writePdfLine(
        doc,
        `${field.canonicalField}: ${field.value} (source: ${sources || "unknown"}` +
          `${field.conflict ? ", CONFLICTING VALUES ACROSS SOURCES" : ""})`,
      );
    }

    writePdfSectionHeading(doc, "2. Processing activities");
    if (data.processingActivities.length === 0) {
      writePdfLine(doc, "No processing activities recorded.");
    }
    for (const activity of data.processingActivities) {
      writePdfLine(
        doc,
        `${activity.purposeName} (${activity.purposeCode}) -- lawful basis: ` +
          `${activity.lawfulBasis}${activity.legitimateUseLimb ? ` / ${activity.legitimateUseLimb}` : ""}` +
          ` -- source systems: ${activity.sourceSystems.join(", ") || "none"}`,
      );
    }

    writePdfSectionHeading(
      doc,
      "3. Data Fiduciaries and Data Processors her data was shared with",
    );
    if (data.recipients.length === 0) {
      writePdfLine(doc, "No sharing activity recorded against her contributing sources.");
    }
    for (const activity of data.recipients) {
      writePdfLine(
        doc,
        `${activity.recipient.name} (${activity.recipient.type}, ` +
          `${activity.recipient.country}) -- what was shared: ${activity.description}`,
      );
    }

    writePdfSectionHeading(doc, "4. Consent status and history per purpose");
    if (data.consent.length === 0) {
      writePdfLine(doc, "No consent records.");
    }
    for (const entry of data.consent) {
      writePdfLine(
        doc,
        `${entry.purposeName ?? entry.purposeId} (${entry.purposeCode ?? "?"}): ${entry.status}` +
          `${entry.channel ? ` via ${entry.channel}` : ""}`,
      );
      for (const event of entry.history) {
        writePdfLine(
          doc,
          `    ${event.createdAt.toISOString()} -- ${event.fromStatus ?? "(none)"} -> ` +
            `${event.toStatus} (${event.channel}, ${event.actorType}: ${event.actorLabel})`,
        );
      }
    }

    writePdfSectionHeading(doc, "5. Retention position and erasure tasks");
    if (data.retention.length === 0) {
      writePdfLine(doc, "No retention/erasure tasks recorded.");
    }
    for (const task of data.retention) {
      writePdfLine(
        doc,
        `${task.policyName ?? "(no policy)"} -- state: ${task.state}, trigger: ${task.trigger}` +
          `${task.erasureDueAt ? `, erasure due: ${task.erasureDueAt.toISOString()}` : ""}` +
          `${task.retentionFloorUntil ? `, floor until: ${task.retentionFloorUntil.toISOString()}` : ""}`,
      );
    }

    if (data.suppressedRequestCount > 0) {
      writePdfSectionHeading(doc, "Notes");
      writePdfLine(
        doc,
        `${data.suppressedRequestCount} record(s) affecting this report are withheld ` +
          "under a non-disclosure direction and are not shown here.",
      );
    }
  });
}

const ACCESS_REPORT_CSV_HEADER: readonly string[] = [
  "Section",
  "Field/Purpose/Recipient",
  "Detail",
  "Extra",
];

/**
 * Flat, single-sheet CSV rendering of the same five sections, for
 * spreadsheet-side review. Every row starts with its section number so
 * the sheet can be sorted/filtered by section without losing context.
 */
export function renderAccessReportCsv(data: AccessReportData): string {
  const rows: string[][] = [];

  rows.push(["META", "Principal", data.principal.reference, data.principal.displayName ?? ""]);
  rows.push(["META", "Organisation", data.organizationName, ""]);
  rows.push(["META", "Generated at", data.generatedAt.toISOString(), ""]);

  for (const field of data.personalData) {
    rows.push([
      "1. Personal data",
      field.canonicalField,
      field.value,
      field.sources.map((source) => source.name).join("; "),
    ]);
  }

  for (const activity of data.processingActivities) {
    rows.push([
      "2. Processing activities",
      `${activity.purposeName} (${activity.purposeCode})`,
      `${activity.lawfulBasis}${activity.legitimateUseLimb ? ` / ${activity.legitimateUseLimb}` : ""}`,
      activity.sourceSystems.join("; "),
    ]);
  }

  for (const activity of data.recipients) {
    rows.push([
      "3. Shared with",
      `${activity.recipient.name} (${activity.recipient.type})`,
      activity.description,
      activity.recipient.country,
    ]);
  }

  for (const entry of data.consent) {
    rows.push([
      "4. Consent",
      `${entry.purposeName ?? entry.purposeId} (${entry.purposeCode ?? "?"})`,
      entry.status,
      entry.channel ?? "",
    ]);
    for (const event of entry.history) {
      rows.push([
        "4. Consent history",
        `${entry.purposeCode ?? entry.purposeId}`,
        `${event.fromStatus ?? "(none)"} -> ${event.toStatus}`,
        event.createdAt.toISOString(),
      ]);
    }
  }

  for (const task of data.retention) {
    rows.push([
      "5. Retention/erasure",
      task.policyName ?? "(no policy)",
      task.state,
      task.erasureDueAt ? task.erasureDueAt.toISOString() : "",
    ]);
  }

  if (data.suppressedRequestCount > 0) {
    rows.push([
      "NOTE",
      "Withheld under non-disclosure direction",
      String(data.suppressedRequestCount),
      "",
    ]);
  }

  return csvDocument(ACCESS_REPORT_CSV_HEADER, rows);
}

/** Re-exported so callers outside this module don't need their own `csvRow` import just to add a letterhead row. */
export { csvRow };

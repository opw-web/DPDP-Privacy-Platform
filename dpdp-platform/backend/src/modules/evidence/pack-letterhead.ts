import { csvRow } from "../inventory/csv-writer";

/**
 * Prepends the banner every pack artefact must carry (task 12 brief:
 * "each a readable CSV or PDF carrying the organisation name and a
 * generation timestamp"). Applied uniformly to every CSV artefact
 * `EvidencePackService` bundles -- including the two reused from other
 * modules (`RopaExportService.exportCsv()`, `AuditReadService.
 * accessLogCsv()`), whose own standalone endpoints do not carry this
 * banner, so the banner is added here at bundling time rather than by
 * editing those services.
 *
 * Three extra rows plus a blank separator, all still valid CSV (a
 * spreadsheet opens the file cleanly; the banner just reads as short
 * rows above the real header), rather than a `#`-comment convention that
 * not every CSV reader honours.
 */
export function withCsvLetterhead(
  title: string,
  organizationName: string,
  generatedAt: Date,
  csvBody: string,
): string {
  const banner =
    csvRow([title]) +
    "\r\n" +
    csvRow(["Organisation", organizationName]) +
    "\r\n" +
    csvRow(["Generated at", generatedAt.toISOString()]) +
    "\r\n" +
    "\r\n";
  return banner + csvBody;
}

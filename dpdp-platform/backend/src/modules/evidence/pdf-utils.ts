import PDFDocument from "pdfkit";

/**
 * Runs `build` against a fresh `pdfkit` document and resolves with the
 * finished PDF as a `Buffer`. Every PDF this module produces (the access
 * report, the per-person evidence file, and every PDF artefact inside
 * the evidence pack) goes through this one helper so the
 * stream-to-buffer plumbing exists exactly once.
 */
export function renderPdf(build: (doc: PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      build(doc);
      doc.end();
    } catch (error) {
      reject(error as Error);
    }
  });
}

/** The letterhead every pack artefact and evidence document carries (task 12 brief: "each a readable CSV or PDF carrying the organisation name and a generation timestamp"). */
export function writePdfLetterhead(
  doc: PDFDocument,
  title: string,
  organizationName: string,
  generatedAt: Date,
): void {
  doc.fontSize(18).text(title, { align: "left" });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor("#444444");
  doc.text(`Organisation: ${organizationName}`);
  doc.text(`Generated at: ${generatedAt.toISOString()}`);
  doc.fillColor("#000000");
  doc.moveDown(1);
}

/** A section heading, spaced consistently across every document this module renders. */
export function writePdfSectionHeading(doc: PDFDocument, text: string): void {
  doc.moveDown(0.6);
  doc.fontSize(13).fillColor("#000000").text(text, { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10);
}

/** A plain body line, or the supplied fallback when the section has nothing to show. */
export function writePdfLine(doc: PDFDocument, text: string): void {
  doc.fontSize(10).text(text);
}

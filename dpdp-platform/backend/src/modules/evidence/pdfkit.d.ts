/**
 * Minimal ambient typing for `pdfkit` (0.20.x), which ships no
 * TypeScript declarations of its own (verified: no `.d.ts` anywhere
 * under `node_modules/pdfkit`, and no `@types/pdfkit` is installed).
 * Covers only the surface this module's `pdf-utils.ts` and its callers
 * actually use -- not a full re-declaration of the library.
 */
declare module "pdfkit" {
  import { Readable } from "stream";

  interface PDFDocumentOptions {
    size?: string | [number, number];
    margin?: number;
    margins?: { top: number; bottom: number; left: number; right: number };
    bufferPages?: boolean;
    autoFirstPage?: boolean;
  }

  interface PDFTextOptions {
    align?: "left" | "center" | "right" | "justify";
    underline?: boolean;
    width?: number;
    continued?: boolean;
  }

  class PDFDocument extends Readable {
    constructor(options?: PDFDocumentOptions);
    fontSize(size: number): this;
    fillColor(color: string): this;
    text(text: string, options?: PDFTextOptions): this;
    moveDown(lines?: number): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    stroke(): this;
    addPage(options?: PDFDocumentOptions): this;
    end(): void;
    y: number;
    x: number;
    page: { height: number; width: number };
  }

  export = PDFDocument;
}

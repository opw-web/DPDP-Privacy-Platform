import { csvDocument, csvField, csvRow } from "./csv-writer";

describe("csvField", () => {
  it("leaves a plain field unquoted", () => {
    expect(csvField("ORDER_FULFILMENT")).toBe("ORDER_FULFILMENT");
  });

  it("leaves an empty field unquoted", () => {
    expect(csvField("")).toBe("");
  });

  it("quotes a field containing a comma", () => {
    expect(csvField("Contact, Identity")).toBe('"Contact, Identity"');
  });

  it("quotes a field containing a double quote and doubles it", () => {
    expect(csvField('Say "hello"')).toBe('"Say ""hello"""');
  });

  it("quotes a field containing a newline", () => {
    expect(csvField("line one\nline two")).toBe('"line one\nline two"');
  });

  it("quotes a field containing a carriage return", () => {
    expect(csvField("line one\r\nline two")).toBe('"line one\r\nline two"');
  });

  it("quotes a field with leading whitespace", () => {
    expect(csvField(" leading space")).toBe('" leading space"');
  });

  it("quotes a field with trailing whitespace", () => {
    expect(csvField("trailing space ")).toBe('"trailing space "');
  });

  it("does not quote internal whitespace alone", () => {
    expect(csvField("two words")).toBe("two words");
  });

  it("quotes a field combining commas and quotes correctly", () => {
    expect(csvField('a, "b", c')).toBe('"a, ""b"", c"');
  });
});

describe("csvRow", () => {
  it("joins fields with commas, quoting only where needed", () => {
    expect(csvRow(["a", "b, c", 'd"e', ""])).toBe('a,"b, c","d""e",');
  });
});

describe("csvDocument", () => {
  it("emits a stable header row followed by data rows, CRLF-joined", () => {
    const doc = csvDocument(
      ["Name", "Value"],
      [
        ["first", "1"],
        ["second, comma", "2"],
      ],
    );
    expect(doc).toBe("Name,Value\r\n" + 'first,1\r\n"second, comma",2\r\n');
  });

  it("emits only the header row when there are no data rows", () => {
    expect(csvDocument(["A", "B"], [])).toBe("A,B\r\n");
  });

  it("emits a blank column for a purpose row with an unpopulated register field", () => {
    const doc = csvDocument(
      ["Purpose", "Recipients"],
      [["MARKETING_EMAIL", ""]],
    );
    expect(doc).toBe("Purpose,Recipients\r\nMARKETING_EMAIL,\r\n");
  });

  it("round-trips a document containing every special character back to its original fields", () => {
    const originalRows = [
      ["has,comma", 'has"quote', "has\nnewline", " has space "],
    ];
    const doc = csvDocument(["A", "B", "C", "D"], originalRows);
    // Minimal RFC 4180 parser used only to prove round-trip correctness.
    const parsed = parseCsv(doc);
    expect(parsed).toEqual([["A", "B", "C", "D"], ...originalRows]);
  });
});

/** Minimal RFC 4180 CSV parser, used only by the round-trip test above. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\r" && text[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 2;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

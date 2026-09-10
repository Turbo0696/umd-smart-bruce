// SPDX-License-Identifier: CC-BY-SA-4.0
import { describe, expect, it } from "vitest";
import { csvFilename, escapeCsvCell, toCsv } from "@/lib/beerGameCsv";

describe("escapeCsvCell — formula injection", () => {
  it("neutralises cells a spreadsheet would execute", () => {
    // An instructor opening the export must not run a student's payload.
    expect(escapeCsvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(escapeCsvCell("+1+1")).toBe("'+1+1");
    expect(escapeCsvCell("-2+3")).toBe("'-2+3");
    expect(escapeCsvCell("@import")).toBe("'@import");
  });

  it("guards the classic DDE payload dressed up as a name", () => {
    const attack = '=cmd|\'/c calc\'!A1';
    expect(escapeCsvCell(attack).startsWith("'")).toBe(true);
  });

  it("leaves numbers alone so negatives survive as numbers", () => {
    // Prefixing "-5" would turn every negative column into text.
    expect(escapeCsvCell(-5)).toBe("-5");
    expect(escapeCsvCell(-0.5)).toBe("-0.5");
    expect(escapeCsvCell(42)).toBe("42");
    expect(escapeCsvCell(true)).toBe("true");
  });

  it("does not touch ordinary text", () => {
    expect(escapeCsvCell("Malt Mallards")).toBe("Malt Mallards");
    expect(escapeCsvCell("RETAILER")).toBe("RETAILER");
  });
});

describe("escapeCsvCell — RFC 4180 quoting", () => {
  it("quotes values containing a comma", () => {
    expect(escapeCsvCell("Su, Hung-Chung")).toBe('"Su, Hung-Chung"');
  });

  it("doubles embedded quotes", () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes values containing newlines", () => {
    expect(escapeCsvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("renders null and undefined as an empty field", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("keeps the injection guard inside the quotes when both apply", () => {
    // Quoting must wrap the escaped value, not the raw one.
    expect(escapeCsvCell("=a,b")).toBe(`"'=a,b"`);
  });
});

describe("toCsv", () => {
  it("emits a header row then data rows, CRLF terminated", () => {
    expect(toCsv(["round", "order"], [[1, 4], [2, 8]])).toBe(
      "round,order\r\n1,4\r\n2,8\r\n",
    );
  });

  it("emits just the header when there are no rows", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b\r\n");
  });

  it("escapes every cell it writes", () => {
    expect(toCsv(["name"], [["=evil"]])).toBe("name\r\n'=evil\r\n");
  });
});

describe("csvFilename", () => {
  it("builds a tame filename from the parts given", () => {
    expect(csvFilename(["beer-game", "Malt Mallards", "orders"])).toBe(
      "beer-game-malt-mallards-orders.csv",
    );
  });

  it("strips characters that have no business in a filename", () => {
    expect(csvFilename(["a/b\\c:d*e?f"])).toBe("a-b-c-d-e-f.csv");
  });

  it("collapses runs of separators and trims the edges", () => {
    expect(csvFilename(["  spaced   out  "])).toBe("spaced-out.csv");
  });

  it("falls back to a generic name when nothing usable is left", () => {
    expect(csvFilename([""])).toBe("export.csv");
    expect(csvFilename(["!!!"])).toBe("export.csv");
  });
});

// SPDX-License-Identifier: CC-BY-SA-4.0
//
// CSV serialisation for session exports, including the spreadsheet
// formula-injection hardening ported from siemsene/beergame's
// src/utils/sessionCsvExport.ts. See NOTICE.md for attribution.

/**
 * Characters that make Excel, Sheets and LibreOffice treat a cell as a formula
 * rather than text. A student named "=cmd" or a team note starting with "+"
 * would otherwise execute on open in the instructor's spreadsheet.
 */
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  const isNumeric = typeof value === "number" || typeof value === "boolean";
  let text = typeof value === "string" ? value : String(value);

  // Neutralise formulas by prefixing a single quote, which spreadsheets read as
  // "this is text". Done before quoting so the quote ends up inside the field.
  //
  // Numbers and booleans are exempt: they cannot carry a payload, and a
  // negative value stringifies to "-5", which the "-" trigger would otherwise
  // turn into the text "'-5" and break every numeric column in the export.
  // (siemsene's version hardens every cell alike; this is a deliberate
  // narrowing rather than an oversight.)
  if (!isNumeric && text.length > 0 && FORMULA_TRIGGERS.some((t) => text.startsWith(t))) {
    text = `'${text}`;
  }

  // RFC 4180: wrap in double quotes when the value contains a delimiter,
  // quote or newline, and double any embedded quotes.
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(header: readonly string[], rows: readonly unknown[][]): string {
  const lines = [
    header.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  // Trailing newline: some tools drop the final record without it.
  return `${lines.join("\r\n")}\r\n`;
}

/** Filenames are user-visible and end up in downloads folders — keep them tame. */
export function csvFilename(parts: readonly string[]): string {
  const stem = parts
    .join("-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${stem || "export"}.csv`;
}

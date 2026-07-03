import ExcelJS from "exceljs";

export interface ParsedBalanceRow {
  rawName: string;
  normalizedName: string;
  currency: "KZT" | "USD";
  amount: number; // signed: positive = плюс/САЛЫНГАН, negative = минус/КАРЫЗ
  group: "тенге плюс" | "тенге минус" | "доллар САЛЫНГАН" | "доллар КАРЫЗ";
}

export interface ParsedExcelResult {
  sheetName: string;
  rows: ParsedBalanceRow[];
}

/** Strip trailing date-like annotations from names, e.g. "Ата 17.03.25" -> "Ата",
 *  "Дима 04/09/25" -> "Дима", "Серикхан 050126" -> "Серикхан". */
export function normalizeContactName(raw: string): string {
  let s = raw.trim().replace(/\s+/g, " ");
  // trailing date dd.mm.yy / dd/mm/yy / dd.mm.yyyy etc.
  s = s.replace(/\s+\d{1,2}[./]\d{1,2}[./]\d{2,4}$/, "");
  // trailing 6-digit blob (ddmmyy)
  s = s.replace(/\s+\d{6}$/, "");
  // trailing partial date dd/mm or dd.mm
  s = s.replace(/\s+\d{1,2}[./]\d{1,2}$/, "");
  s = s.trim().replace(/[.,]+$/, "").trim();
  return s;
}

export function nameKey(name: string): string {
  return normalizeContactName(name).toLowerCase().replace(/\s+/g, " ").trim();
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && isFinite(v) && v !== 0;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Locate a header cell in the sheet whose (trimmed, lowercased) value equals or
 * contains one of the given needles. Returns {row, col} of the first match. */
function findHeaderCell(
  ws: ExcelJS.Worksheet,
  matches: (v: string) => boolean,
): { row: number; col: number } | null {
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = row.getCell(c).value;
      if (typeof v === "string" && matches(v.trim().toLowerCase())) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

function collectColumn(
  ws: ExcelJS.Worksheet,
  headerRow: number,
  nameCol: number,
  amountCol: number,
  group: ParsedBalanceRow["group"],
  currency: "KZT" | "USD",
  maxScan = 80,
): ParsedBalanceRow[] {
  const out: ParsedBalanceRow[] = [];
  const lastRow = Math.min(ws.rowCount, headerRow + maxScan);
  for (let r = headerRow + 1; r <= lastRow; r++) {
    const nameVal = ws.getCell(r, nameCol).value;
    const amountVal = ws.getCell(r, amountCol).value;
    if (!isNonEmptyString(nameVal) || !isFiniteNumber(amountVal)) continue;
    const rawName = nameVal.trim();
    // skip obvious non-name sub-header labels
    if (/^(доллар|тенге|usd|kzt)$/i.test(rawName)) continue;
    out.push({
      rawName,
      normalizedName: normalizeContactName(rawName),
      currency,
      amount: group.endsWith("минус") || group.endsWith("КАРЫЗ") ? -Math.abs(amountVal) : Math.abs(amountVal),
      group,
    });
  }
  return out;
}

export async function parseContactsExcel(buffer: ArrayBuffer): Promise<ParsedExcelResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  if (wb.worksheets.length === 0) throw new Error("В файле нет листов");
  const ws = wb.worksheets[wb.worksheets.length - 1];

  const plusHeader = findHeaderCell(ws, (v) => v === "плюс");
  const minusHeader = findHeaderCell(ws, (v) => v === "минус");
  const salynganHeader = findHeaderCell(ws, (v) => v.includes("салынган"));
  const karyzHeader = findHeaderCell(ws, (v) => v.includes("карыз"));

  const rows: ParsedBalanceRow[] = [];

  if (plusHeader) {
    rows.push(
      ...collectColumn(ws, plusHeader.row, plusHeader.col - 1, plusHeader.col, "тенге плюс", "KZT"),
    );
  }
  if (minusHeader) {
    rows.push(
      ...collectColumn(ws, minusHeader.row, minusHeader.col - 1, minusHeader.col, "тенге минус", "KZT"),
    );
  }
  if (salynganHeader) {
    rows.push(
      ...collectColumn(
        ws,
        salynganHeader.row,
        salynganHeader.col,
        salynganHeader.col + 1,
        "доллар САЛЫНГАН",
        "USD",
      ),
    );
  }
  if (karyzHeader) {
    rows.push(
      ...collectColumn(ws, karyzHeader.row, karyzHeader.col, karyzHeader.col + 1, "доллар КАРЫЗ", "USD"),
    );
  }

  if (!plusHeader && !minusHeader && !salynganHeader && !karyzHeader) {
    throw new Error(
      'Не удалось найти блок "Остаток" (плюс/минус/САЛЫНГАН/КАРЫЗ) на последнем листе файла',
    );
  }

  return { sheetName: ws.name, rows };
}

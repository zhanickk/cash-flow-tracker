import * as XLSX from "xlsx";

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
  s = s.replace(/\s+\d{1,2}[./]\d{1,2}[./]\d{2,4}$/, "");
  s = s.replace(/\s+\d{6}$/, "");
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

function cellAt(ws: XLSX.WorkSheet, row: number, col: number): unknown {
  const addr = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
  return ws[addr]?.v;
}

/** Locate a header cell (1-indexed row/col) whose trimmed lowercase string value
 * satisfies `matches`. Returns the first match scanning row by row. */
function findHeaderCell(
  ws: XLSX.WorkSheet,
  range: XLSX.Range,
  matches: (v: string) => boolean,
): { row: number; col: number } | null {
  for (let r = range.s.r + 1; r <= range.e.r + 1; r++) {
    for (let c = range.s.c + 1; c <= range.e.c + 1; c++) {
      const v = cellAt(ws, r, c);
      if (typeof v === "string" && matches(v.trim().toLowerCase())) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

function collectColumn(
  ws: XLSX.WorkSheet,
  headerRow: number,
  nameCol: number,
  amountCol: number,
  group: ParsedBalanceRow["group"],
  currency: "KZT" | "USD",
  maxRow: number,
  maxScan = 80,
): ParsedBalanceRow[] {
  const out: ParsedBalanceRow[] = [];
  const lastRow = Math.min(maxRow, headerRow + maxScan);
  for (let r = headerRow + 1; r <= lastRow; r++) {
    const nameVal = cellAt(ws, r, nameCol);
    const amountVal = cellAt(ws, r, amountCol);
    if (!isNonEmptyString(nameVal) || !isFiniteNumber(amountVal)) continue;
    const rawName = nameVal.trim();
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
  // Pass 1: cheap — read only sheet names (bookSheets skips parsing cell data).
  const namesOnly = XLSX.read(buffer, { type: "array", bookSheets: true });
  if (namesOnly.SheetNames.length === 0) throw new Error("В файле нет листов");
  const lastSheetName = namesOnly.SheetNames[namesOnly.SheetNames.length - 1];

  // Pass 2: parse only the last sheet's data (avoids parsing all other sheets).
  const wb = XLSX.read(buffer, { type: "array", sheets: [lastSheetName] });
  const ws = wb.Sheets[lastSheetName];
  if (!ws || !ws["!ref"]) throw new Error("Не удалось прочитать последний лист файла");
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const maxRow = range.e.r + 1;

  const plusHeader = findHeaderCell(ws, range, (v) => v === "плюс");
  const minusHeader = findHeaderCell(ws, range, (v) => v === "минус");
  const salynganHeader = findHeaderCell(ws, range, (v) => v.includes("салынган"));
  const karyzHeader = findHeaderCell(ws, range, (v) => v.includes("карыз"));

  const rows: ParsedBalanceRow[] = [];

  if (plusHeader) {
    rows.push(
      ...collectColumn(ws, plusHeader.row, plusHeader.col - 1, plusHeader.col, "тенге плюс", "KZT", maxRow),
    );
  }
  if (minusHeader) {
    rows.push(
      ...collectColumn(ws, minusHeader.row, minusHeader.col - 1, minusHeader.col, "тенге минус", "KZT", maxRow),
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
        maxRow,
      ),
    );
  }
  if (karyzHeader) {
    rows.push(
      ...collectColumn(ws, karyzHeader.row, karyzHeader.col, karyzHeader.col + 1, "доллар КАРЫЗ", "USD", maxRow),
    );
  }

  if (!plusHeader && !minusHeader && !salynganHeader && !karyzHeader) {
    throw new Error(
      'Не удалось найти блок "Остаток" (плюс/минус/САЛЫНГАН/КАРЫЗ) на последнем листе файла',
    );
  }

  return { sheetName: lastSheetName, rows };
}

/** Только USD: САЛЫНГАН (мы должны) и КАРЫЗ (нам должны) с последнего листа. */
export async function parseUsdContactsExcel(buffer: ArrayBuffer): Promise<ParsedExcelResult> {
  const result = await parseContactsExcel(buffer);
  return {
    sheetName: result.sheetName,
    rows: result.rows.filter((r) => r.currency === "USD"),
  };
}

/** Сводит строки Excel в один баланс USD на контакт (положительный = Салынған, отрицательный = Қарыз). */
export function mergeUsdTargets(rows: ParsedBalanceRow[]): ParsedBalanceRow[] {
  const byKey = new Map<string, ParsedBalanceRow>();
  for (const row of rows) {
    const key = nameKey(row.normalizedName);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...row });
      continue;
    }
    const amount = prev.amount + row.amount;
    byKey.set(key, {
      ...prev,
      amount,
      group: amount >= 0 ? "доллар САЛЫНГАН" : "доллар КАРЫЗ",
    });
  }
  return [...byKey.values()];
}

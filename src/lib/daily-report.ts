import ExcelJS from "exceljs";

export type Currency = "USD" | "EUR" | "RUB" | "CNY" | "GOLD" | "KZT";
export type TxKind = "opening" | "buy" | "sell" | "income" | "expense";

export interface ReportTransaction {
  id: string;
  kind: TxKind;
  ts: number;
  name?: string;
  currency: Currency;
  amount: number;
  rate?: number;
  expenseType?: "regular" | "person";
}

export interface FxCurrencyRow {
  currency: Currency;
  boughtAmount: number;
  buyKzt: number;
  avgBuyRate: number;
  soldAmount: number;
  sellKzt: number;
  avgSellRate: number;
  matchedAmount: number;
  marginKzt: number;
  netKztFlow: number;
}

export interface DailyReportData {
  dateTitle: string;
  fileBaseName: string;
  generatedAt: string;
  rows: {
    time: string;
    kind: string;
    name: string;
    currency: string;
    amount: number;
    rate: number | null;
    kztEffect: number | null;
    note: string;
  }[];
  opening: Record<Currency, number>;
  closing: Record<Currency, number>;
  fxRows: FxCurrencyRow[];
  totalFxMarginKzt: number;
  incomeByCurrency: Partial<Record<Currency, number>>;
  regularExpenseByCurrency: Partial<Record<Currency, number>>;
  personExpenseByCurrency: Partial<Record<Currency, number>>;
  incomeKzt: number;
  regularExpenseKzt: number;
  personExpenseKzt: number;
  netProfitKzt: number;
}

const FX: Currency[] = ["USD", "EUR", "RUB", "CNY", "GOLD"];
const ALL: Currency[] = ["KZT", "USD", "EUR", "RUB", "CNY", "GOLD"];

const KIND_LABEL: Record<TxKind, string> = {
  opening: "Остаток",
  buy: "Покупка",
  sell: "Продажа",
  income: "Приход",
  expense: "Расход",
};

function fmt(n: number, frac = 2) {
  if (!isFinite(n)) return "0";
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: frac,
  });
}

export function reportDateSlug(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export function reportFileBaseName(d = new Date()) {
  return `отчет_${reportDateSlug(d)}`;
}

export function todayDateKey(d = new Date()) {
  return reportDateSlug(d);
}

function kindLabel(tx: ReportTransaction) {
  if (tx.kind === "expense" && tx.expenseType === "person") return "Выдача (кому/забрал)";
  if (tx.kind === "expense") return "Обычный расход";
  return KIND_LABEL[tx.kind];
}

function kztEffect(tx: ReportTransaction): number | null {
  switch (tx.kind) {
    case "buy":
      return -(tx.amount * (tx.rate || 0));
    case "sell":
      return tx.amount * (tx.rate || 0);
    case "income":
      return tx.currency === "KZT" ? tx.amount : null;
    case "expense":
      return tx.currency === "KZT" ? -tx.amount : null;
    default:
      return null;
  }
}

function sumByCurrency(
  txs: ReportTransaction[],
  filter: (t: ReportTransaction) => boolean,
): Partial<Record<Currency, number>> {
  const out: Partial<Record<Currency, number>> = {};
  for (const t of txs) {
    if (!filter(t)) continue;
    out[t.currency] = (out[t.currency] || 0) + t.amount;
  }
  return out;
}

export function buildDailyReport(
  transactions: ReportTransaction[],
  closing: Record<Currency, number>,
): DailyReportData {
  const now = new Date();
  const opening: Record<Currency, number> = {
    KZT: 0,
    USD: 0,
    EUR: 0,
    RUB: 0,
    CNY: 0,
    GOLD: 0,
  };
  for (const t of transactions.filter((x) => x.kind === "opening")) {
    opening[t.currency] += t.amount;
  }

  const fxRows: FxCurrencyRow[] = FX.map((currency) => {
    const buys = transactions.filter((t) => t.kind === "buy" && t.currency === currency);
    const sells = transactions.filter((t) => t.kind === "sell" && t.currency === currency);
    const boughtAmount = buys.reduce((s, t) => s + t.amount, 0);
    const buyKzt = buys.reduce((s, t) => s + t.amount * (t.rate || 0), 0);
    const soldAmount = sells.reduce((s, t) => s + t.amount, 0);
    const sellKzt = sells.reduce((s, t) => s + t.amount * (t.rate || 0), 0);
    const avgBuyRate = boughtAmount > 0 ? buyKzt / boughtAmount : 0;
    const avgSellRate = soldAmount > 0 ? sellKzt / soldAmount : 0;
    const matchedAmount = Math.min(boughtAmount, soldAmount);
    const marginKzt =
      matchedAmount > 0 && avgBuyRate > 0 && avgSellRate > 0
        ? matchedAmount * (avgSellRate - avgBuyRate)
        : 0;
    return {
      currency,
      boughtAmount,
      buyKzt,
      avgBuyRate,
      soldAmount,
      sellKzt,
      avgSellRate,
      matchedAmount,
      marginKzt,
      netKztFlow: sellKzt - buyKzt,
    };
  });

  const totalFxMarginKzt = fxRows.reduce((s, r) => s + r.marginKzt, 0);
  const incomeByCurrency = sumByCurrency(transactions, (t) => t.kind === "income");
  const regularExpenseByCurrency = sumByCurrency(
    transactions,
    (t) => t.kind === "expense" && t.expenseType !== "person",
  );
  const personExpenseByCurrency = sumByCurrency(
    transactions,
    (t) => t.kind === "expense" && t.expenseType === "person",
  );
  const incomeKzt = incomeByCurrency.KZT || 0;
  const regularExpenseKzt = regularExpenseByCurrency.KZT || 0;
  const personExpenseKzt = personExpenseByCurrency.KZT || 0;
  const netProfitKzt = totalFxMarginKzt + incomeKzt - regularExpenseKzt;

  const rows = [...transactions]
    .sort((a, b) => a.ts - b.ts)
    .map((tx) => ({
      time: new Date(tx.ts).toLocaleString("ru-RU"),
      kind: kindLabel(tx),
      name: tx.name || "—",
      currency: tx.currency,
      amount: tx.amount,
      rate: tx.rate ?? null,
      kztEffect: kztEffect(tx),
      note:
        tx.kind === "buy" || tx.kind === "sell"
          ? `KZT: ${fmt((kztEffect(tx) || 0) as number)}`
          : "",
    }));

  return {
    dateTitle: now.toLocaleDateString("ru-RU", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    fileBaseName: reportFileBaseName(now),
    generatedAt: now.toLocaleString("ru-RU"),
    rows,
    opening,
    closing,
    fxRows,
    totalFxMarginKzt,
    incomeByCurrency,
    regularExpenseByCurrency,
    personExpenseByCurrency,
    incomeKzt,
    regularExpenseKzt,
    personExpenseKzt,
    netProfitKzt,
  };
}

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E3A5F" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
const ACCENT_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8F4EA" },
};
const WARN_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFCE8E8" },
};

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });
  row.height = 22;
}

function styleDataSheet(ws: ExcelJS.Worksheet) {
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function buildReportWorkbook(data: DailyReportData): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Кассовый лист";
  wb.created = new Date();

  const summary = wb.addWorksheet("Сводка", {
    properties: { tabColor: { argb: "FF2563EB" } },
  });
  summary.columns = [{ width: 36 }, { width: 22 }, { width: 22 }];
  summary.mergeCells("A1:C1");
  const title = summary.getCell("A1");
  title.value = `Дневной отчёт — ${data.dateTitle}`;
  title.font = { size: 16, bold: true, color: { argb: "FF1E3A5F" } };
  title.alignment = { horizontal: "center" };
  summary.getCell("A2").value = `Сформирован: ${data.generatedAt}`;
  summary.mergeCells("A2:C2");
  summary.getCell("A2").alignment = { horizontal: "center" };

  let r = 4;
  const addSummaryRow = (label: string, value: string | number, highlight?: "good" | "bad") => {
    summary.getCell(`A${r}`).value = label;
    summary.getCell(`A${r}`).font = { bold: true };
    const valCell = summary.getCell(`B${r}`);
    valCell.value = value;
    if (highlight === "good") valCell.fill = ACCENT_FILL;
    if (highlight === "bad") valCell.fill = WARN_FILL;
    valCell.font = { bold: true, size: 12 };
    r++;
  };

  addSummaryRow("Маржа обмена (KZT)", data.totalFxMarginKzt, "good");
  addSummaryRow("Приходы KZT", data.incomeKzt);
  addSummaryRow("Обычные расходы KZT", data.regularExpenseKzt, "bad");
  addSummaryRow(
    "Чистая прибыль дня (KZT)",
    data.netProfitKzt,
    data.netProfitKzt >= 0 ? "good" : "bad",
  );
  r++;
  addSummaryRow("Выдачи людям KZT (инфо)", data.personExpenseKzt);

  r += 1;
  summary.getCell(`A${r}`).value = "Остатки на начало / конец";
  summary.getCell(`A${r}`).font = { bold: true, size: 12 };
  r++;
  const balHeader = summary.getRow(r);
  balHeader.values = ["Валюта", "Начало", "Конец"];
  styleHeaderRow(balHeader);
  r++;
  for (const c of ALL) {
    summary.getRow(r).values = [c, data.opening[c], data.closing[c]];
    r++;
  }

  const fx = wb.addWorksheet("Купля-продажа", {
    properties: { tabColor: { argb: "FF059669" } },
  });
  fx.columns = [
    { width: 10 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
  ];
  const fxH = fx.addRow([
    "Валюта",
    "Куплено",
    "KZT ушло",
    "Ср. курс покупки",
    "Продано",
    "KZT пришло",
    "Ср. курс продажи",
    "Сопоставлено",
    "Маржа KZT",
    "Поток KZT",
  ]);
  styleHeaderRow(fxH);
  for (const row of data.fxRows) {
    if (row.boughtAmount === 0 && row.soldAmount === 0) continue;
    fx.addRow([
      row.currency,
      row.boughtAmount,
      row.buyKzt,
      row.avgBuyRate || "—",
      row.soldAmount,
      row.sellKzt,
      row.avgSellRate || "—",
      row.matchedAmount,
      row.marginKzt,
      row.netKztFlow,
    ]);
  }
  fx.autoFilter = { from: "A1", to: "J1" };
  styleDataSheet(fx);

  const ops = wb.addWorksheet("Операции", {
    properties: { tabColor: { argb: "FF7C3AED" } },
  });
  ops.columns = [
    { width: 18 },
    { width: 18 },
    { width: 20 },
    { width: 10 },
    { width: 14 },
    { width: 12 },
    { width: 16 },
    { width: 24 },
  ];
  const opsH = ops.addRow([
    "Время",
    "Тип",
    "Имя/комментарий",
    "Валюта",
    "Сумма",
    "Курс",
    "Эффект KZT",
    "Примечание",
  ]);
  styleHeaderRow(opsH);
  for (const row of data.rows) {
    ops.addRow([
      row.time,
      row.kind,
      row.name,
      row.currency,
      row.amount,
      row.rate ?? "",
      row.kztEffect ?? "",
      row.note,
    ]);
  }
  ops.autoFilter = { from: "A1", to: "H1" };
  styleDataSheet(ops);

  const exp = wb.addWorksheet("Расходы и приходы", {
    properties: { tabColor: { argb: "FFDC2626" } },
  });
  exp.columns = [{ width: 22 }, { width: 14 }, { width: 14 }];
  exp.addRow(["Категория", "Валюта", "Сумма"]);
  styleHeaderRow(exp.getRow(1));
  for (const c of ALL) {
    const inc = data.incomeByCurrency[c];
    if (inc) exp.addRow(["Приход", c, inc]);
  }
  for (const c of ALL) {
    const ex = data.regularExpenseByCurrency[c];
    if (ex) exp.addRow(["Обычный расход", c, ex]);
  }
  for (const c of ALL) {
    const ex = data.personExpenseByCurrency[c];
    if (ex) exp.addRow(["Выдача людям", c, ex]);
  }
  styleDataSheet(exp);

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export function downloadExcelBuffer(buffer: ArrayBuffer, fileBaseName: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileBaseName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

const DIR_DB = "cash-report-dir";
const DIR_STORE = "handles";

export async function pickReportsDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!("showDirectoryPicker" in window)) return null;
  try {
    const handle = await window.showDirectoryPicker({
      mode: "readwrite",
      id: "cash-flow-reports",
      startIn: "documents",
    });
    await saveDirectoryHandle(handle);
    return handle;
  } catch {
    return null;
  }
}

async function saveDirectoryHandle(handle: FileSystemDirectoryHandle) {
  try {
    const db = await openDirDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DIR_STORE, "readwrite");
      tx.objectStore(DIR_STORE).put(handle, "reports");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export async function loadReportsDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDirDb();
    const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
      const tx = db.transaction(DIR_STORE, "readonly");
      const req = tx.objectStore(DIR_STORE).get("reports");
      req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!handle) return null;
    const perm = await handle.queryPermission({ mode: "readwrite" });
    if (perm === "granted") return handle;
    const req = await handle.requestPermission({ mode: "readwrite" });
    return req === "granted" ? handle : null;
  } catch {
    return null;
  }
}

function openDirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DIR_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DIR_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveExcelToDirectory(
  buffer: ArrayBuffer,
  fileBaseName: string,
  dir?: FileSystemDirectoryHandle | null,
) {
  const handle = dir ?? (await loadReportsDirectory());
  if (!handle) return false;
  try {
    const fileHandle = await handle.getFileHandle(`${fileBaseName}.xlsx`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(buffer);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

export { fmt };

import ExcelJS from "exceljs";
import { peopleMoneySpendFromReportTxs } from "@/lib/fx-people-money-spend";

export type Currency = "USD" | "EUR" | "RUB" | "KGS" | "CNY" | "GOLD" | "KZT";
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
  regularIncomeByCurrency: Partial<Record<Currency, number>>;
  personIncomeByCurrency: Partial<Record<Currency, number>>;
  regularExpenseByCurrency: Partial<Record<Currency, number>>;
  personExpenseByCurrency: Partial<Record<Currency, number>>;
  incomeKzt: number;
  regularIncomeKzt: number;
  personIncomeKzt: number;
  regularExpenseKzt: number;
  personExpenseKzt: number;
  netProfitKzt: number;
  peopleBalance: {
    name: string;
    inKzt: number;
    outKzt: number;
    netKzt: number;
  }[];
  /** USD: трата Жұрттың ақшасы за день (продажа − покупка) */
  peopleMoneySpendUsd: {
    boughtUsd: number;
    soldUsd: number;
    excessUsd: number;
    avgSellRate: number;
    spendKzt: number;
  };
  buyRows: ReportTransaction[];
  sellRows: ReportTransaction[];
  personRows: ReportTransaction[];
}

const FX: Currency[] = ["USD", "EUR", "RUB", "KGS", "CNY", "GOLD"];
const ALL: Currency[] = ["KZT", "USD", "EUR", "RUB", "KGS", "CNY", "GOLD"];

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
    KGS: 0,
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
  // "person"-tagged income is money deposited by/linked to a contact — it increases what we owe
  // them (a liability), not real business profit. Only free-note income (not linked to any
  // contact, expenseType "regular") is genuine revenue and should count toward net profit —
  // this mirrors how expenses are already split into "regular" (real cost) vs "person" (payout,
  // not a cost).
  const regularIncomeByCurrency = sumByCurrency(
    transactions,
    (t) => t.kind === "income" && t.expenseType !== "person",
  );
  const personIncomeByCurrency = sumByCurrency(
    transactions,
    (t) => t.kind === "income" && t.expenseType === "person",
  );
  const regularExpenseByCurrency = sumByCurrency(
    transactions,
    (t) => t.kind === "expense" && t.expenseType !== "person",
  );
  const personExpenseByCurrency = sumByCurrency(
    transactions,
    (t) => t.kind === "expense" && t.expenseType === "person",
  );
  const incomeKzt = incomeByCurrency.KZT || 0;
  const regularIncomeKzt = regularIncomeByCurrency.KZT || 0;
  const personIncomeKzt = personIncomeByCurrency.KZT || 0;
  const regularExpenseKzt = regularExpenseByCurrency.KZT || 0;
  const personExpenseKzt = personExpenseByCurrency.KZT || 0;
  const netProfitKzt = totalFxMarginKzt + regularIncomeKzt - regularExpenseKzt;
  const buyRows = transactions.filter((t) => t.kind === "buy");
  const sellRows = transactions.filter((t) => t.kind === "sell");
  const personRows = transactions.filter((t) => t.kind === "expense" && t.expenseType === "person");
  const peopleMap = new Map<
    string,
    { name: string; inKzt: number; outKzt: number; netKzt: number }
  >();
  for (const tx of transactions) {
    const name = tx.name?.trim();
    if (!name) continue;
    const inSide = tx.kind === "income";
    const outSide = tx.kind === "expense" && tx.expenseType === "person";
    if (!inSide && !outSide) continue;
    const kzt = tx.currency === "KZT" ? tx.amount : 0;
    const prev = peopleMap.get(name) ?? { name, inKzt: 0, outKzt: 0, netKzt: 0 };
    const next = {
      name,
      inKzt: prev.inKzt + (inSide ? kzt : 0),
      outKzt: prev.outKzt + (outSide ? kzt : 0),
      netKzt: prev.netKzt + (inSide ? kzt : outSide ? -kzt : 0),
    };
    peopleMap.set(name, next);
  }
  const peopleBalance = [...peopleMap.values()].sort(
    (a, b) => Math.abs(b.netKzt) - Math.abs(a.netKzt),
  );

  const peopleMoneyDay = peopleMoneySpendFromReportTxs(transactions);
  const peopleMoneySpendUsd = {
    boughtUsd: peopleMoneyDay.boughtUsd,
    soldUsd: peopleMoneyDay.soldUsd,
    excessUsd: peopleMoneyDay.excessUsd,
    avgSellRate: peopleMoneyDay.avgSellRate,
    spendKzt: peopleMoneyDay.spendKzt,
  };

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
    regularIncomeByCurrency,
    personIncomeByCurrency,
    regularExpenseByCurrency,
    personExpenseByCurrency,
    incomeKzt,
    regularIncomeKzt,
    personIncomeKzt,
    regularExpenseKzt,
    personExpenseKzt,
    netProfitKzt,
    peopleBalance,
    peopleMoneySpendUsd,
    buyRows,
    sellRows,
    personRows,
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

function styleRowBorders(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    };
  });
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
  const usdFx = data.fxRows.find((x) => x.currency === "USD");
  if (usdFx && (usdFx.boughtAmount > 0 || usdFx.soldAmount > 0)) {
    addSummaryRow(
      "Трата Жұрттың ақшасы (USD, KZT)",
      data.peopleMoneySpendUsd.excessUsd > 0
        ? `${fmt(data.peopleMoneySpendUsd.excessUsd)} $ × ${fmt(data.peopleMoneySpendUsd.avgSellRate, 4)} = ${fmt(data.peopleMoneySpendUsd.spendKzt)} ₸`
        : "0 (покупка ≥ продажа)",
      data.peopleMoneySpendUsd.excessUsd > 0 ? "bad" : undefined,
    );
  }
  addSummaryRow("Приход без привязки к контакту KZT", data.regularIncomeKzt, "good");
  addSummaryRow("Обычные расходы KZT", data.regularExpenseKzt, "bad");
  addSummaryRow(
    "Чистая прибыль дня (KZT)",
    data.netProfitKzt,
    data.netProfitKzt >= 0 ? "good" : "bad",
  );
  r++;
  addSummaryRow("Приход от контактов KZT (инфо, не прибыль)", data.personIncomeKzt);
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
    styleRowBorders(summary.getRow(r));
    summary.getRow(r).eachCell((cell, col) => {
      if (col > 1) cell.numFmt = "#,##0.00";
    });
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
    const rr = fx.lastRow;
    if (rr) {
      styleRowBorders(rr);
      rr.eachCell((cell, i) => {
        if (i > 1) cell.numFmt = "#,##0.0000";
      });
    }
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
    const rr = ops.lastRow;
    if (rr) {
      styleRowBorders(rr);
      rr.getCell(5).numFmt = "#,##0.00";
      rr.getCell(6).numFmt = "#,##0.0000";
      rr.getCell(7).numFmt = "#,##0.00";
    }
  }
  ops.autoFilter = { from: "A1", to: "H1" };
  styleDataSheet(ops);

  const exp = wb.addWorksheet("Обычные расходы", {
    properties: { tabColor: { argb: "FFDC2626" } },
  });
  exp.columns = [{ width: 22 }, { width: 14 }, { width: 14 }];
  exp.addRow(["Категория", "Валюта", "Сумма"]);
  styleHeaderRow(exp.getRow(1));
  for (const c of ALL) {
    const ex = data.regularExpenseByCurrency[c];
    if (ex) exp.addRow(["Обычный расход", c, ex]);
  }
  exp.eachRow((row, idx) => {
    if (idx === 1) return;
    styleRowBorders(row);
    row.getCell(3).numFmt = "#,##0.00";
  });

  const buySheet = wb.addWorksheet("Купля", { properties: { tabColor: { argb: "FF0EA5E9" } } });
  buySheet.columns = [
    { width: 18 },
    { width: 18 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
  ];
  styleHeaderRow(buySheet.addRow(["Время", "Комментарий", "Валюта", "Сумма", "Курс", "KZT ушло"]));
  for (const tx of data.buyRows) {
    buySheet.addRow([
      new Date(tx.ts).toLocaleString("ru-RU"),
      tx.name || "—",
      tx.currency,
      tx.amount,
      tx.rate ?? "",
      -(tx.amount * (tx.rate || 0)),
    ]);
    const rr = buySheet.lastRow;
    if (rr) {
      styleRowBorders(rr);
      rr.getCell(4).numFmt = "#,##0.00";
      rr.getCell(5).numFmt = "#,##0.0000";
      rr.getCell(6).numFmt = "#,##0.00";
    }
  }
  styleDataSheet(buySheet);

  const sellSheet = wb.addWorksheet("Продажа", { properties: { tabColor: { argb: "FF16A34A" } } });
  sellSheet.columns = [
    { width: 18 },
    { width: 18 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
  ];
  styleHeaderRow(
    sellSheet.addRow(["Время", "Комментарий", "Валюта", "Сумма", "Курс", "KZT пришло"]),
  );
  for (const tx of data.sellRows) {
    sellSheet.addRow([
      new Date(tx.ts).toLocaleString("ru-RU"),
      tx.name || "—",
      tx.currency,
      tx.amount,
      tx.rate ?? "",
      tx.amount * (tx.rate || 0),
    ]);
    const rr = sellSheet.lastRow;
    if (rr) {
      styleRowBorders(rr);
      rr.getCell(4).numFmt = "#,##0.00";
      rr.getCell(5).numFmt = "#,##0.0000";
      rr.getCell(6).numFmt = "#,##0.00";
    }
  }
  styleDataSheet(sellSheet);

  const peopleSheet = wb.addWorksheet("Кому отдали", {
    properties: { tabColor: { argb: "FF9333EA" } },
  });
  peopleSheet.columns = [{ width: 18 }, { width: 24 }, { width: 10 }, { width: 14 }, { width: 14 }];
  styleHeaderRow(peopleSheet.addRow(["Время", "Кто забрал / кому", "Валюта", "Сумма", "KZT"]));
  for (const tx of data.personRows) {
    peopleSheet.addRow([
      new Date(tx.ts).toLocaleString("ru-RU"),
      tx.name || "—",
      tx.currency,
      tx.amount,
      tx.currency === "KZT" ? tx.amount : "",
    ]);
    const rr = peopleSheet.lastRow;
    if (rr) {
      styleRowBorders(rr);
      rr.getCell(4).numFmt = "#,##0.00";
      rr.getCell(5).numFmt = "#,##0.00";
    }
  }
  styleDataSheet(peopleSheet);

  const peopleBalanceSheet = wb.addWorksheet("Лица на балансе", {
    properties: { tabColor: { argb: "FF7C3AED" } },
  });
  peopleBalanceSheet.columns = [{ width: 24 }, { width: 16 }, { width: 16 }, { width: 16 }];
  styleHeaderRow(peopleBalanceSheet.addRow(["Имя", "Внесли KZT", "Забрали KZT", "Баланс KZT"]));
  for (const row of data.peopleBalance) {
    peopleBalanceSheet.addRow([row.name, row.inKzt, row.outKzt, row.netKzt]);
    const rr = peopleBalanceSheet.lastRow;
    if (rr) {
      styleRowBorders(rr);
      rr.getCell(2).numFmt = "#,##0.00";
      rr.getCell(3).numFmt = "#,##0.00";
      rr.getCell(4).numFmt = "#,##0.00";
    }
  }
  styleDataSheet(peopleBalanceSheet);

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

type DirHandleWithPerms = FileSystemDirectoryHandle & {
  queryPermission: (opts: { mode: string }) => Promise<PermissionState>;
  requestPermission: (opts: { mode: string }) => Promise<PermissionState>;
};

export async function pickReportsDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const w = window as unknown as {
    showDirectoryPicker?: (opts?: {
      mode?: string;
      id?: string;
      startIn?: string;
    }) => Promise<FileSystemDirectoryHandle>;
  };
  if (!w.showDirectoryPicker) return null;
  try {
    const handle = await w.showDirectoryPicker({
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
    const h = handle as DirHandleWithPerms;
    const perm = await h.queryPermission({ mode: "readwrite" });
    if (perm === "granted") return handle;
    const req = await h.requestPermission({ mode: "readwrite" });
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

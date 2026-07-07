import ExcelJS from "exceljs";
import type { FxCurrencySummary, FxDaySummary, FxSale } from "@/lib/fx-sales";
import type { ClientFxRow } from "@/lib/fx-client-report";
import { fmt } from "@/lib/cash-shared";

export function fxSalesReportFileBaseName(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `fx_продажи_${dd}-${mm}-${yyyy}_${hh}-${min}`;
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  row.height = 22;
}

function borderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    };
  });
}

export async function buildFxSalesReportWorkbook(input: {
  sales: FxSale[];
  summary: FxCurrencySummary[];
  daily: FxDaySummary[];
  periodLabel: string;
  currencyLabels: Map<string, string>;
  heldInKzt?: { currencyCode: string; label: string; foreignTotal: number; kztTotal: number; count: number }[];
  potRemainders?: { currency: string; karyz: number; salynghan: number }[];
  clientRows?: ClientFxRow[];
}): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Кассовый лист";
  wb.created = new Date();

  const totalKzt = input.summary.reduce((s, r) => s + r.kztTotal, 0);

  const summaryWs = wb.addWorksheet("Сводка", {
    properties: { tabColor: { argb: "FF15803D" } },
  });
  summaryWs.columns = [
    { width: 22 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 10 },
  ];
  summaryWs.addRow([`Период: ${input.periodLabel}`]).font = { bold: true };
  summaryWs.addRow([`Итого в тенге: ${totalKzt.toLocaleString("ru-RU")} ₸`]).font = { bold: true };
  summaryWs.addRow([]);
  const sh = summaryWs.addRow([
    "Валюта",
    "Объём",
    "Сумма ₸",
    "Ср.взв. курс",
    "Курс (итог)",
    "Ср. арифм.",
    "Оп.",
  ]);
  styleHeader(sh);
  for (const row of input.summary) {
    const r = summaryWs.addRow([
      row.label,
      row.foreignTotal,
      row.kztTotal,
      row.weightedRate,
      row.effectiveRate,
      row.avgRate,
      row.count,
    ]);
    borderRow(r);
    r.getCell(2).numFmt = "#,##0.00";
    r.getCell(3).numFmt = "#,##0.00";
    r.getCell(4).numFmt = "#,##0.0000";
    r.getCell(5).numFmt = "#,##0.0000";
    r.getCell(6).numFmt = "#,##0.0000";
  }

  if (input.potRemainders?.length) {
    summaryWs.addRow([]);
    summaryWs.addRow(["Остатки котла (текущие)"]).font = { bold: true };
    const ph = summaryWs.addRow(["Валюта", "Қарыз", "Салынған", "", "", "", ""]);
    styleHeader(ph);
    for (const p of input.potRemainders) {
      const r = summaryWs.addRow([p.currency, p.karyz, p.salynghan, "", "", "", ""]);
      borderRow(r);
      r.getCell(2).numFmt = "#,##0.00";
      r.getCell(3).numFmt = "#,##0.00";
    }
  }

  if (input.heldInKzt?.length) {
    const heldWs = wb.addWorksheet("Держим в тенге", {
      properties: { tabColor: { argb: "FFCA8A04" } },
    });
    heldWs.columns = [{ width: 22 }, { width: 18 }, { width: 18 }, { width: 10 }];
    heldWs.addRow([`Период: ${input.periodLabel}`]).font = { bold: true };
    heldWs.addRow([]);
    const hh = heldWs.addRow(["Валюта", "Продано (Салынған)", "Сумма ₸", "Оп."]);
    styleHeader(hh);
    for (const row of input.heldInKzt) {
      const r = heldWs.addRow([row.label, row.foreignTotal, row.kztTotal, row.count]);
      borderRow(r);
      r.getCell(2).numFmt = "#,##0.00";
      r.getCell(3).numFmt = "#,##0.00";
    }
  }

  if (input.clientRows?.length) {
    const cws = wb.addWorksheet("По клиентам", {
      properties: { tabColor: { argb: "FF7C3AED" } },
    });
    cws.columns = [{ width: 28 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 8 }];
    const ch = cws.addRow(["Клиент", "Валюта", "Қарыз", "Салынған", "Баланс", "Оп."]);
    styleHeader(ch);
    for (const row of input.clientRows) {
      const r = cws.addRow([
        row.name,
        row.currency,
        row.karyzTotal,
        row.salynghanTotal,
        row.balance,
        row.txCount,
      ]);
      borderRow(r);
      r.getCell(3).numFmt = "#,##0.00";
      r.getCell(4).numFmt = "#,##0.00";
      r.getCell(5).numFmt = "#,##0.00";
    }
  }

  const dailyWs = wb.addWorksheet("По дням", {
    properties: { tabColor: { argb: "FF2563EB" } },
  });
  dailyWs.columns = [{ width: 14 }, { width: 18 }, { width: 12 }];
  const dh = dailyWs.addRow(["Дата", "Сумма (₸)", "Операций"]);
  styleHeader(dh);
  for (const row of input.daily) {
    const r = dailyWs.addRow([row.label, row.kztTotal, row.count]);
    borderRow(r);
    r.getCell(2).numFmt = "#,##0.00";
  }

  const opsWs = wb.addWorksheet("Операции", {
    properties: { tabColor: { argb: "FF1E3A5F" } },
  });
  opsWs.columns = [
    { width: 12 },
    { width: 10 },
    { width: 10 },
    { width: 14 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 24 },
  ];
  const oh = opsWs.addRow([
    "Дата",
    "Время",
    "Валюта",
    "Объём",
    "Курс",
    "Сумма ₸",
    "Қарыз",
    "Салынған",
    "Примечание",
  ]);
  styleHeader(oh);
  opsWs.views = [{ state: "frozen", ySplit: 1 }];

  const sorted = [...input.sales].sort((a, b) => b.occurredAt - a.occurredAt);
  for (const s of sorted) {
    const d = new Date(s.occurredAt);
    const r = opsWs.addRow([
      d.toLocaleDateString("ru-RU"),
      d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      input.currencyLabels.get(s.currencyCode) ?? s.currencyCode,
      s.foreignAmount,
      s.rate,
      s.kztAmount,
      s.karyzAmount ?? 0,
      s.salynghanAmount ?? 0,
      s.note ?? "",
    ]);
    borderRow(r);
    r.getCell(4).numFmt = "#,##0.00";
    r.getCell(5).numFmt = "#,##0.0000";
    r.getCell(6).numFmt = "#,##0.00";
    r.getCell(7).numFmt = "#,##0.00";
    r.getCell(8).numFmt = "#,##0.00";
  }

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export function periodLabelFromFilters(filters: {
  period: string;
  dateFrom: string;
  dateTo: string;
}): string {
  if (filters.period === "all") return "Все время";
  if (filters.period === "day") return "Сегодня";
  if (filters.period === "week") return "Последние 7 дней";
  if (filters.period === "month") return "Текущий месяц";
  if (filters.dateFrom && filters.dateTo) {
    return `${filters.dateFrom.split("-").reverse().join(".")} — ${filters.dateTo.split("-").reverse().join(".")}`;
  }
  return "Произвольный период";
}

export function fmtSaleRow(s: FxSale) {
  return `${fmt(s.foreignAmount)} ${s.currencyCode} × ${fmt(s.rate, 4)} = ${fmt(s.kztAmount)} ₸`;
}

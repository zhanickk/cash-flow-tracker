import ExcelJS from "exceljs";
import type { FxCurrencySummary, FxSale } from "@/lib/fx-sales";

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

export function periodLabelFromFilters(filters: {
  period: string;
  dateFrom: string;
  dateTo: string;
}): string {
  if (filters.period === "all") return "Всё время";
  if (filters.period === "day") return "Сегодня";
  if (filters.period === "week") return "7 дней";
  if (filters.period === "month") return "Текущий месяц";
  if (filters.dateFrom && filters.dateTo) return `${filters.dateFrom} — ${filters.dateTo}`;
  return "Период";
}

export async function buildFxSalesReportWorkbook(input: {
  sales: FxSale[];
  summary: FxCurrencySummary[];
  periodLabel: string;
  currencyLabels: Map<string, string>;
}): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Кассовый лист";
  wb.created = new Date();

  const totalKzt = input.summary.reduce((s, r) => s + r.kztTotal, 0);

  const summaryWs = wb.addWorksheet("Сводка");
  summaryWs.columns = [{ width: 22 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 10 }];
  summaryWs.addRow([`Период: ${input.periodLabel}`]).font = { bold: true };
  summaryWs.addRow([`Итого в тенге: ${totalKzt.toLocaleString("ru-RU")} ₸`]).font = { bold: true };
  summaryWs.addRow([]);
  const sh = summaryWs.addRow(["Валюта", "Продано", "Сумма ₸", "Ср. курс", "Оп."]);
  styleHeader(sh);
  for (const row of input.summary) {
    const r = summaryWs.addRow([
      row.label,
      row.foreignTotal,
      row.kztTotal,
      row.weightedRate,
      row.count,
    ]);
    borderRow(r);
    r.getCell(2).numFmt = "#,##0.00";
    r.getCell(3).numFmt = "#,##0.00";
    r.getCell(4).numFmt = "#,##0.0000";
  }

  const opsWs = wb.addWorksheet("Операции");
  opsWs.columns = [
    { width: 18 },
    { width: 10 },
    { width: 14 },
    { width: 12 },
    { width: 14 },
    { width: 24 },
  ];
  const oh = opsWs.addRow(["Дата", "Валюта", "Объём", "Курс", "Сумма ₸", "Примечание"]);
  styleHeader(oh);
  for (const s of input.sales) {
    const d = new Date(s.occurredAt);
    const r = opsWs.addRow([
      d.toLocaleString("ru-RU"),
      input.currencyLabels.get(s.currencyCode) ?? s.currencyCode,
      s.foreignAmount,
      s.rate,
      s.kztAmount,
      s.note ?? "",
    ]);
    borderRow(r);
    r.getCell(3).numFmt = "#,##0.00";
    r.getCell(4).numFmt = "#,##0.0000";
    r.getCell(5).numFmt = "#,##0.00";
  }

  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

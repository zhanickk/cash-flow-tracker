import ExcelJS from "exceljs";
import type { Currency } from "@/lib/cash-shared";
import { CURRENCIES } from "@/lib/cash-shared";

export interface SummaryContactRow {
  name: string;
  kztBalance: number;
  usdBalance: number;
}

export function summaryReportFileBaseName(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `сводка_${dd}-${mm}-${yyyy}_${hh}-${min}`;
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  row.height = 20;
}

function styleBorders(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    };
  });
}

export async function buildSummaryReportWorkbook(
  contacts: SummaryContactRow[],
  cashTotals: Record<Currency, number>,
  generatedAt = new Date(),
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Кассовый лист";
  wb.created = generatedAt;

  const cashWs = wb.addWorksheet("Касса", { properties: { tabColor: { argb: "FF2563EB" } } });
  cashWs.columns = [{ width: 14 }, { width: 22 }];
  cashWs.mergeCells("A1:B1");
  cashWs.getCell("A1").value = `Остатки кассы на ${generatedAt.toLocaleString("ru-RU")}`;
  cashWs.getCell("A1").font = { size: 14, bold: true, color: { argb: "FF1E3A5F" } };
  const cashHeader = cashWs.addRow(["Валюта", "Остаток"]);
  styleHeader(cashHeader);
  for (const c of CURRENCIES) {
    const row = cashWs.addRow([c.short, cashTotals[c.code] ?? 0]);
    styleBorders(row);
    row.getCell(2).numFmt = "#,##0.00";
  }

  const contactsWs = wb.addWorksheet("Баланс контактов", {
    properties: { tabColor: { argb: "FF059669" } },
  });
  contactsWs.columns = [{ width: 32 }, { width: 20 }, { width: 20 }];
  contactsWs.mergeCells("A1:C1");
  contactsWs.getCell("A1").value = `Баланс контактов на ${generatedAt.toLocaleString("ru-RU")}`;
  contactsWs.getCell("A1").font = { size: 14, bold: true, color: { argb: "FF1E3A5F" } };
  const contactsHeader = contactsWs.addRow(["Имя", "Тенге", "USD"]);
  styleHeader(contactsHeader);
  contactsWs.views = [{ state: "frozen", ySplit: 2 }];
  const sorted = [...contacts].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  for (const c of sorted) {
    const row = contactsWs.addRow([c.name, c.kztBalance, c.usdBalance]);
    styleBorders(row);
    row.getCell(2).numFmt = "#,##0";
    row.getCell(3).numFmt = "#,##0.00";
    if (c.kztBalance < 0) row.getCell(2).font = { color: { argb: "FFB91C1C" } };
    if (c.usdBalance < 0) row.getCell(3).font = { color: { argb: "FFB91C1C" } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

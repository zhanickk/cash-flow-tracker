import ExcelJS from "exceljs";
import type { HistoryEntry } from "@/lib/cash-shared";

const ACTION_LABEL: Record<HistoryEntry["action"], string> = {
  add: "Добавлено",
  edit: "Изменено",
  delete: "Удалено",
  reset: "Сброс/новый день",
};

const KIND_LABEL: Record<string, string> = {
  opening: "Остаток",
  buy: "Покупка",
  sell: "Продажа",
  income: "Приход",
  expense: "Расход",
};

export function journalReportFileBaseName(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `журнал_изменений_${dd}-${mm}-${yyyy}_${hh}-${min}`;
}

export async function buildJournalReportWorkbook(entries: HistoryEntry[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Кассовый лист";
  wb.created = new Date();

  const ws = wb.addWorksheet("Журнал изменений", {
    properties: { tabColor: { argb: "FF1E3A5F" } },
  });
  ws.columns = [
    { width: 12 },
    { width: 10 },
    { width: 16 },
    { width: 16 },
    { width: 70 },
  ];
  const header = ws.addRow(["Дата", "Время", "Действие", "Тип операции", "Описание"]);
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  header.height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const sorted = [...entries].sort((a, b) => b.ts - a.ts);
  for (const e of sorted) {
    const d = new Date(e.ts);
    const row = ws.addRow([
      d.toLocaleDateString("ru-RU"),
      d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      ACTION_LABEL[e.action] ?? e.action,
      e.kind ? (KIND_LABEL[e.kind] ?? e.kind) : "—",
      e.summary,
    ]);
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
      cell.alignment = { vertical: "top", wrapText: true };
    });
    if (e.action === "delete") row.getCell(3).font = { color: { argb: "FFB91C1C" } };
    if (e.action === "add") row.getCell(3).font = { color: { argb: "FF15803D" } };
    if (e.action === "reset") row.getCell(3).font = { bold: true, color: { argb: "FFB91C1C" } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

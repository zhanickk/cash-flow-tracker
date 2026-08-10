import ExcelJS from "exceljs";
import type { FxSale, FxCurrency } from "@/lib/fx-sales";
import type { FxPurchase } from "@/lib/fx-purchases";

export interface FxTradeCurrencySummary {
  currencyCode: string;
  label: string;
  /** Купили: объём валюты и сколько тенге за это отдали. */
  boughtAmount: number;
  boughtKzt: number;
  avgBuyRate: number;
  buyCount: number;
  /** Продали: объём валюты и сколько тенге за это получили. */
  soldAmount: number;
  soldKzt: number;
  avgSellRate: number;
  sellCount: number;
  /** Остаток на руках (купили − продали) и его стоимость по среднему курсу покупки. */
  remainderAmount: number;
  remainderValueKzt: number;
  /** Прибыль считается только с объёма, который реально и куплен, и продан. */
  matchedAmount: number;
  marginKzt: number;
  avgProfitPerUnit: number;
}

function weightedRate(kztTotal: number, volTotal: number) {
  return volTotal > 0 ? kztTotal / volTotal : 0;
}

/**
 * Сводка «купили/продали» по каждой валюте: объёмы в валюте и в тенге,
 * средневзвешенный курс покупки/продажи, остаток на руках (оценённый по
 * среднему курсу покупки — сколько тенге сейчас «сидит» в этом остатке),
 * и средняя прибыль — маржа с объёма, который уже и куплен, и продан.
 */
export function buildFxTradeSummary(
  purchases: FxPurchase[],
  sales: FxSale[],
  currencies: FxCurrency[],
): FxTradeCurrencySummary[] {
  const labelByCode = new Map(currencies.map((c) => [c.code, c.label]));
  const codes = new Set<string>();
  for (const p of purchases) codes.add(p.currencyCode);
  for (const s of sales) codes.add(s.currencyCode);

  const rows: FxTradeCurrencySummary[] = [...codes].map((currencyCode) => {
    const buys = purchases.filter((p) => p.currencyCode === currencyCode);
    const sells = sales.filter((s) => s.currencyCode === currencyCode);

    const boughtAmount = buys.reduce((a, p) => a + p.foreignAmount, 0);
    const boughtKzt = buys.reduce((a, p) => a + p.kztAmount, 0);
    const avgBuyRate = weightedRate(boughtKzt, boughtAmount);

    const soldAmount = sells.reduce((a, s) => a + s.foreignAmount, 0);
    const soldKzt = sells.reduce((a, s) => a + s.kztAmount, 0);
    const avgSellRate = weightedRate(soldKzt, soldAmount);

    const matchedAmount = Math.min(boughtAmount, soldAmount);
    const marginKzt =
      matchedAmount > 0 && avgBuyRate > 0 && avgSellRate > 0
        ? matchedAmount * (avgSellRate - avgBuyRate)
        : 0;
    const avgProfitPerUnit = matchedAmount > 0 ? marginKzt / matchedAmount : 0;

    const remainderAmount = boughtAmount - soldAmount;
    const remainderValueKzt = avgBuyRate > 0 ? remainderAmount * avgBuyRate : 0;

    return {
      currencyCode,
      label: labelByCode.get(currencyCode) ?? currencyCode,
      boughtAmount,
      boughtKzt,
      avgBuyRate,
      buyCount: buys.length,
      soldAmount,
      soldKzt,
      avgSellRate,
      sellCount: sells.length,
      remainderAmount,
      remainderValueKzt,
      matchedAmount,
      marginKzt,
      avgProfitPerUnit,
    };
  });

  return rows.sort((a, b) => b.boughtKzt + b.soldKzt - (a.boughtKzt + a.soldKzt));
}

export function fxTradesReportFileBaseName(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `fx_купли_продажи_${dd}-${mm}-${yyyy}_${hh}-${min}`;
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

export async function buildFxTradesReportWorkbook(input: {
  summary: FxTradeCurrencySummary[];
  periodLabel: string;
}): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Кассовый лист";
  wb.created = new Date();

  const ws = wb.addWorksheet("Купли-продажи");
  ws.columns = [
    { width: 12 },
    { width: 14 },
    { width: 16 },
    { width: 12 },
    { width: 14 },
    { width: 16 },
    { width: 12 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 12 },
  ];
  ws.addRow([`Период: ${input.periodLabel}`]).font = { bold: true };
  ws.addRow([]);
  const h = ws.addRow([
    "Валюта",
    "Куплено",
    "Сумма ₸ (куплено)",
    "Курс покупки",
    "Продано",
    "Сумма ₸ (продано)",
    "Курс продажи",
    "Остаток",
    "Стоимость остатка ₸",
    "Прибыль ₸",
    "Ср. прибыль/ед.",
  ]);
  styleHeader(h);
  for (const row of input.summary) {
    const r = ws.addRow([
      row.label,
      row.boughtAmount,
      row.boughtKzt,
      row.avgBuyRate,
      row.soldAmount,
      row.soldKzt,
      row.avgSellRate,
      row.remainderAmount,
      row.remainderValueKzt,
      row.marginKzt,
      row.avgProfitPerUnit,
    ]);
    borderRow(r);
    [2, 3, 5, 6, 8, 9, 10].forEach((c) => (r.getCell(c).numFmt = "#,##0.00"));
    [4, 7, 11].forEach((c) => (r.getCell(c).numFmt = "#,##0.0000"));
  }

  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

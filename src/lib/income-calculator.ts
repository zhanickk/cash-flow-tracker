import type { FxSale, FxCurrency } from "@/lib/fx-sales";
import type { FxPurchase } from "@/lib/fx-purchases";

export interface IncomeCurrencyBreakdown {
  currencyCode: string;
  label: string;
  soldAmount: number;
  soldKzt: number;
  avgSellRate: number;
  costOfSoldKzt: number;
  avgCostRate: number;
  marginKzt: number;
  saleCount: number;
}

export interface IncomeSummary {
  totalMarginKzt: number;
  totalSoldKzt: number;
  byCurrency: IncomeCurrencyBreakdown[];
}

interface CostEvent {
  ts: number;
  type: "buy" | "sell";
  foreignAmount: number;
  kztAmount: number;
}

/**
 * Доход по методу скользящей средней себестоимости (weighted average cost).
 *
 * Почему не просто «купили/продали за период»: если валюту купили в одном
 * периоде, а продали в другом (типичная ситуация для золота — лежит месяцами),
 * расчёт «только внутри периода» покажет 0 дохода там, где он реально есть —
 * объём продажи внутри периода не находит себе пары среди покупок ЭТОГО ЖЕ
 * периода.
 *
 * Вместо этого мы прогоняем ВСЮ историю покупок и продаж по валюте в
 * хронологическом порядке, ведём накопительно: остаток (qty) и его
 * себестоимость (costKzt). Каждая покупка добавляет к остатку и себестоимости.
 * Каждая продажа списывается по текущей средней себестоимости остатка на
 * тот момент (costKzt / qty) — так работает бухгалтерский метод
 * средневзвешенной стоимости запасов. Доход конкретной продажи = сумма
 * продажи в тенге − списанная себестоимость. В сумму периода попадают только
 * продажи, дата которых попадает в выбранный период — но их себестоимость
 * могла быть сформирована покупками из ЛЮБОГО более раннего периода.
 */
function computeCurrencyIncome(
  buys: FxPurchase[],
  sells: FxSale[],
  fromTs: number,
  toTs: number,
): {
  soldAmount: number;
  soldKzt: number;
  costOfSoldKzt: number;
  saleCount: number;
} {
  const events: CostEvent[] = [
    ...buys.map((b) => ({
      ts: b.occurredAt,
      type: "buy" as const,
      foreignAmount: b.foreignAmount,
      kztAmount: b.kztAmount,
    })),
    ...sells.map((s) => ({
      ts: s.occurredAt,
      type: "sell" as const,
      foreignAmount: s.foreignAmount,
      kztAmount: s.kztAmount,
    })),
  ].sort((a, b) => a.ts - b.ts || (a.type === "buy" ? -1 : 1));

  let qty = 0;
  let costKzt = 0;
  let soldAmount = 0;
  let soldKzt = 0;
  let costOfSoldKzt = 0;
  let saleCount = 0;

  for (const e of events) {
    if (e.type === "buy") {
      qty += e.foreignAmount;
      costKzt += e.kztAmount;
      continue;
    }
    // Часть продажи, у которой есть реальная себестоимость (обеспечена
    // учтёнными покупками), и часть, которой нет (остаток qty < объёма
    // продажи — валюта продана раньше, чем мы начали вести журнал покупок,
    // либо продано больше, чем куплено). Для необеспеченной части себестоимость
    // неизвестна — считаем её равной сумме продажи (доход = 0 по этой части),
    // а не нулю (что раньше превращало всю сумму продажи в «доход» и давало
    // нереалистично раздутые цифры).
    const backedAmount = Math.min(qty, e.foreignAmount);
    const unbackedAmount = e.foreignAmount - backedAmount;
    const avgCost = qty > 0 ? costKzt / qty : 0;
    const backedCost = backedAmount * avgCost;
    const unbackedCost =
      unbackedAmount > 0 ? (unbackedAmount / e.foreignAmount) * e.kztAmount : 0;
    const saleCost = backedCost + unbackedCost;
    qty -= backedAmount;
    costKzt -= backedCost;
    if (qty < 0) {
      qty = 0;
      costKzt = 0;
    }
    if (e.ts >= fromTs && e.ts <= toTs) {
      soldAmount += e.foreignAmount;
      soldKzt += e.kztAmount;
      costOfSoldKzt += saleCost;
      saleCount++;
    }
  }

  return { soldAmount, soldKzt, costOfSoldKzt, saleCount };
}

export function buildIncomeSummary(
  purchases: FxPurchase[],
  sales: FxSale[],
  currencies: FxCurrency[],
  fromTs: number,
  toTs: number,
): IncomeSummary {
  const labelByCode = new Map(currencies.map((c) => [c.code, c.label]));
  const codes = new Set<string>();
  for (const p of purchases) codes.add(p.currencyCode);
  for (const s of sales) codes.add(s.currencyCode);

  const byCurrency: IncomeCurrencyBreakdown[] = [...codes]
    .map((currencyCode) => {
      const buys = purchases.filter((p) => p.currencyCode === currencyCode);
      const sells = sales.filter((s) => s.currencyCode === currencyCode);
      const { soldAmount, soldKzt, costOfSoldKzt, saleCount } = computeCurrencyIncome(
        buys,
        sells,
        fromTs,
        toTs,
      );
      return {
        currencyCode,
        label: labelByCode.get(currencyCode) ?? currencyCode,
        soldAmount,
        soldKzt,
        avgSellRate: soldAmount > 0 ? soldKzt / soldAmount : 0,
        costOfSoldKzt,
        avgCostRate: soldAmount > 0 ? costOfSoldKzt / soldAmount : 0,
        marginKzt: soldKzt - costOfSoldKzt,
        saleCount,
      };
    })
    .filter((r) => r.saleCount > 0)
    .sort((a, b) => b.marginKzt - a.marginKzt);

  const totalMarginKzt = byCurrency.reduce((s, r) => s + r.marginKzt, 0);
  const totalSoldKzt = byCurrency.reduce((s, r) => s + r.soldKzt, 0);

  return { totalMarginKzt, totalSoldKzt, byCurrency };
}

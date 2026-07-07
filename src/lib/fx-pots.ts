import type { Tables } from "@/integrations/supabase/types";
import type { FxSale } from "@/lib/fx-sales";

export type ContactTxType =
  | "salynghan"
  | "karyz"
  | "conversion"
  | "adjustment"
  | "cash_income"
  | "cash_expense"
  | "repayment";

export type ContactTx = Tables<"contact_transactions">;

export interface CurrencyPotTotals {
  currencyCode: string;
  /** Сумма Қарыз — клиенты должны нам (положительное число в единицах валюты) */
  totalKaryz: number;
  /** Сумма Салынған — мы должны клиентам */
  totalSalynghan: number;
}

export interface UsdAllocation {
  karyzAmount: number;
  salynghanAmount: number;
  /** После этой продажи остаток Қарыз (может быть < 0) */
  karyzRemainderAfter: number;
  /** После этой продажи остаток Салынған (может быть < 0) */
  salynghanRemainderAfter: number;
  /** Часть из Салынған в тенге (для учёта риска) */
  salynghanKzt: number;
}

export interface FxSaleWithAllocation extends FxSale {
  karyzAmount: number;
  salynghanAmount: number;
  allocationLabel: string;
}

export function inferTxType(amount: number, source?: string | null): ContactTxType {
  if (source === "conversion") return "conversion";
  if (amount > 0) return "salynghan";
  if (amount < 0) return "karyz";
  return "adjustment";
}

export function txTypeLabel(txType: string | null | undefined, amount: number): string {
  const t = txType ?? inferTxType(amount);
  switch (t) {
    case "salynghan":
      return "Салынған";
    case "karyz":
      return "Қарыз";
    case "conversion":
      return "Конвертация";
    case "cash_income":
      return "Приход (касса)";
    case "cash_expense":
      return "Расход (касса)";
    case "repayment":
      return "Погашение";
    default:
      return "Корректировка";
  }
}

/** Агрегат «общий котёл» по валюте из клиентской базы. */
export function aggregatePotFromContacts(
  txs: ContactTx[],
  currencyCode: string,
): CurrencyPotTotals {
  let totalKaryz = 0;
  let totalSalynghan = 0;
  for (const t of txs) {
    if (t.currency !== currencyCode) continue;
    const amt = Number(t.amount);
    const type = t.tx_type ?? inferTxType(amt, t.source);
    if (type === "conversion") continue;
    if (type === "karyz" || amt < 0) totalKaryz += Math.abs(amt);
    else if (type === "salynghan" || amt > 0) totalSalynghan += amt;
  }
  return { currencyCode, totalKaryz, totalSalynghan };
}

/** Все валюты, по которым есть операции контактов. */
export function currenciesWithContactOps(txs: ContactTx[]): string[] {
  const set = new Set<string>();
  for (const t of txs) set.add(t.currency);
  return [...set].sort();
}

/**
 * Распределение одной USD-продажи по логике ТЗ:
 * сначала Қарыз, превышение — из Салынған; допускается уход в минус.
 */
export function allocateUsdSale(
  volume: number,
  karyzRemainder: number,
  salynghanRemainder: number,
  rate: number,
): UsdAllocation {
  const fromKaryz = Math.min(volume, Math.max(0, karyzRemainder));
  const fromSalynghan = volume - fromKaryz;
  return {
    karyzAmount: fromKaryz,
    salynghanAmount: fromSalynghan,
    karyzRemainderAfter: karyzRemainder - fromKaryz,
    salynghanRemainderAfter: salynghanRemainder - fromSalynghan,
    salynghanKzt: fromSalynghan * rate,
  };
}

/**
 * Пересчёт остатков и разметки всех USD-продаж по хронологии.
 * Если в БД уже есть karyz_amount/salynghan_amount — используются при replay только если
 * передан useStored=false (по умолчанию пересчитываем заново для консистентности).
 */
export function replayUsdSales(
  contactTxs: ContactTx[],
  sales: Array<FxSale & { karyzAmount?: number; salynghanAmount?: number }>,
): {
  pot: CurrencyPotTotals;
  karyzRemainder: number;
  salynghanRemainder: number;
  enriched: FxSaleWithAllocation[];
} {
  const pot = aggregatePotFromContacts(contactTxs, "USD");
  let karyzRem = pot.totalKaryz;
  let salynghanRem = pot.totalSalynghan;

  const usdSales = [...sales]
    .filter((s) => s.currencyCode === "USD")
    .sort((a, b) => a.occurredAt - b.occurredAt);

  const enriched: FxSaleWithAllocation[] = [];

  for (const s of usdSales) {
    const alloc = allocateUsdSale(s.foreignAmount, karyzRem, salynghanRem, s.rate);
    karyzRem = alloc.karyzRemainderAfter;
    salynghanRem = alloc.salynghanRemainderAfter;

    enriched.push({
      ...s,
      karyzAmount: alloc.karyzAmount,
      salynghanAmount: alloc.salynghanAmount,
      allocationLabel: allocationLabel(alloc.karyzAmount, alloc.salynghanAmount, "USD"),
    });
  }

  return {
    pot,
    karyzRemainder: karyzRem,
    salynghanRemainder: salynghanRem,
    enriched,
  };
}

export function allocationLabel(karyz: number, salynghan: number, currency: string): string {
  if (karyz > 0 && salynghan > 0) {
    return `Қарыз ${karyz} + Салынған ${salynghan} ${currency}`;
  }
  if (salynghan > 0) return `Салынған ${salynghan} ${currency}`;
  if (karyz > 0) return `Қарыз ${karyz} ${currency}`;
  return "—";
}

/** Средневзвешенный курс за набор продаж одной валюты. */
export function weightedAvgRate(sales: FxSale[]): number {
  let vol = 0;
  let kzt = 0;
  for (const s of sales) {
    vol += s.foreignAmount;
    kzt += s.kztAmount;
  }
  return vol > 0 ? kzt / vol : 0;
}

/** «Держим в тенге» — только часть продаж из Салынған (USD). */
export function frozenSalynghanKzt(
  sales: FxSaleWithAllocation[],
  periodFilter?: (s: FxSale) => boolean,
): { totalKzt: number; byDay: Map<string, number>; sales: FxSaleWithAllocation[] } {
  const list = sales.filter(
    (s) => s.salynghanAmount > 0 && (!periodFilter || periodFilter(s)),
  );
  let totalKzt = 0;
  const byDay = new Map<string, number>();
  for (const s of list) {
    const kzt = s.salynghanAmount * s.rate;
    totalKzt += kzt;
    const d = new Date(s.occurredAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    byDay.set(key, (byDay.get(key) ?? 0) + kzt);
  }
  return { totalKzt, byDay, sales: list };
}

export function potRemaindersAfterSales(
  pot: CurrencyPotTotals,
  soldForeign: number,
  soldFromKaryz: number,
  soldFromSalynghan: number,
): { karyzRemainder: number; salynghanRemainder: number } {
  return {
    karyzRemainder: pot.totalKaryz - soldFromKaryz,
    salynghanRemainder: pot.totalSalynghan - soldFromSalynghan,
  };
}

/** Для не-USD валют: простой остаток без разделения котла при продаже. */
export function simpleCurrencyBalance(
  pot: CurrencyPotTotals,
  soldForeign: number,
): number {
  return pot.totalKaryz + pot.totalSalynghan - soldForeign;
}

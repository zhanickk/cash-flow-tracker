import type { Tables } from "@/integrations/supabase/types";

type CashTxRow = Tables<"cash_transactions">;

export interface CashFxOp {
  id: string;
  currency: string;
  occurredAt: number;
  kind: "buy" | "sell";
  foreignAmount: number;
  rate: number;
  kztAmount: number;
  note?: string;
}

/** @deprecated используйте CashFxOp — оставлено для обратной совместимости имени */
export type UsdCashFxOp = CashFxOp;

/** Локальный ключ дня YYYY-MM-DD (часовой пояс браузера / сервера отчёта). */
export function localDateKey(ts: number, timeZone?: string): string {
  const d = new Date(ts);
  if (timeZone) {
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateLabelFromKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Любая валюта, кроме тенге — курс всегда в тенге за единицу. */
export function cashRowsToFxOps(rows: CashTxRow[]): CashFxOp[] {
  return rows
    .filter((r) => r.currency !== "KZT" && (r.kind === "buy" || r.kind === "sell"))
    .map((r) => {
      const foreignAmount = Number(r.amount);
      const rate = Number(r.rate ?? 0);
      return {
        id: r.id,
        currency: r.currency,
        occurredAt: new Date(r.ts).getTime(),
        kind: r.kind as "buy" | "sell",
        foreignAmount,
        rate,
        kztAmount: foreignAmount * rate,
        note: r.name ?? undefined,
      };
    });
}

/** @deprecated используйте cashRowsToFxOps — оставлено для обратной совместимости имени */
export function cashRowsToUsdFxOps(rows: CashTxRow[]): CashFxOp[] {
  return cashRowsToFxOps(rows).filter((op) => op.currency === "USD");
}

/**
 * "reserve_spend" — за день продали валюты больше, чем купили: избыток продан
 * из клиентского резерва (Салынған), считаем по среднему курсу ПРОДАЖ.
 * "excess_buy" — за день купили валюты больше, чем продали: остаток осел у нас,
 * тенге на него уже потрачены, считаем по среднему курсу ПОКУПОК.
 * "balanced" — куплено и продано поровну (или операций не было).
 */
export type SpendDirection = "reserve_spend" | "excess_buy" | "balanced";

export interface PeopleMoneySpendDay {
  dateKey: string;
  dateLabel: string;
  currency: string;
  boughtAmt: number;
  soldAmt: number;
  direction: SpendDirection;
  /** абсолютная величина избытка: |sold-bought| или |bought-sold|, см. direction */
  excessAmt: number;
  /** курс, применённый к excessAmt (avgSellRate для reserve_spend, avgBuyRate для excess_buy) */
  avgRate: number;
  spendKzt: number;
  avgBuyRate: number;
  avgSellRate: number;
  buys: CashFxOp[];
  sells: CashFxOp[];

  /** @deprecated используйте boughtAmt */
  boughtUsd: number;
  /** @deprecated используйте soldAmt */
  soldUsd: number;
  /** @deprecated используйте excessAmt (только для direction === "reserve_spend") */
  excessUsd: number;
}

export interface PeopleMoneySpendReport {
  currency: string;
  today: PeopleMoneySpendDay;
  /** Дни, где было ненулевое расхождение (в любую сторону) */
  daysWithSpend: PeopleMoneySpendDay[];
  /** Все дни с операциями по этой валюте */
  daysWithActivity: PeopleMoneySpendDay[];
  /** Сумма excessAmt по дням direction === "reserve_spend" */
  totalExcessUsd: number;
  /** Сумма spendKzt по дням direction === "reserve_spend" */
  totalSpendKzt: number;
  /** Сумма excessAmt по дням direction === "excess_buy" */
  totalExcessBuyAmt: number;
  /** Сумма spendKzt по дням direction === "excess_buy" */
  totalExcessBuyKzt: number;
}

function emptyDay(dateKey: string, currency: string): PeopleMoneySpendDay {
  return {
    dateKey,
    dateLabel: dateLabelFromKey(dateKey),
    currency,
    boughtAmt: 0,
    soldAmt: 0,
    direction: "balanced",
    excessAmt: 0,
    avgRate: 0,
    spendKzt: 0,
    avgBuyRate: 0,
    avgSellRate: 0,
    buys: [],
    sells: [],
    boughtUsd: 0,
    soldUsd: 0,
    excessUsd: 0,
  };
}

function buildDayRow(
  dateKey: string,
  currency: string,
  buys: CashFxOp[],
  sells: CashFxOp[],
): PeopleMoneySpendDay {
  const boughtAmt = buys.reduce((s, b) => s + b.foreignAmount, 0);
  const soldAmt = sells.reduce((s, x) => s + x.foreignAmount, 0);
  const buyKzt = buys.reduce((s, b) => s + b.kztAmount, 0);
  const sellKzt = sells.reduce((s, x) => s + x.kztAmount, 0);
  const avgBuyRate = boughtAmt > 0 ? buyKzt / boughtAmt : 0;
  const avgSellRate = soldAmt > 0 ? sellKzt / soldAmt : 0;

  const net = soldAmt - boughtAmt;
  let direction: SpendDirection = "balanced";
  let excessAmt = 0;
  let avgRate = 0;
  if (net > 0) {
    direction = "reserve_spend";
    excessAmt = net;
    avgRate = avgSellRate;
  } else if (net < 0) {
    direction = "excess_buy";
    excessAmt = -net;
    avgRate = avgBuyRate;
  }
  const spendKzt = excessAmt * avgRate;

  return {
    dateKey,
    dateLabel: dateLabelFromKey(dateKey),
    currency,
    boughtAmt,
    soldAmt,
    direction,
    excessAmt,
    avgRate,
    spendKzt,
    avgBuyRate,
    avgSellRate,
    buys: [...buys].sort((a, b) => a.occurredAt - b.occurredAt),
    sells: [...sells].sort((a, b) => a.occurredAt - b.occurredAt),
    // legacy mirror (только имеет смысл для reserve_spend, как раньше)
    boughtUsd: boughtAmt,
    soldUsd: soldAmt,
    excessUsd: direction === "reserve_spend" ? excessAmt : 0,
  };
}

/**
 * «Трата Жұрттың ақшасы» — по дням сравниваем покупку/продажу валюты за тенге.
 * Если продали больше, чем купили — избыток считается тратой клиентского резерва
 * (Салынған) по средневзвешенному курсу продаж. Если купили больше, чем продали —
 * избыток остаётся у нас как остаток валюты, а потраченные на него тенге фиксируем
 * по средневзвешенному курсу покупок — тем же полем, с обратным направлением.
 */
export function computePeopleMoneySpend(
  ops: CashFxOp[],
  now = Date.now(),
): PeopleMoneySpendReport {
  const currency = ops[0]?.currency ?? "USD";
  const byDay = new Map<string, { buys: CashFxOp[]; sells: CashFxOp[] }>();

  for (const op of ops) {
    const key = localDateKey(op.occurredAt);
    const bucket = byDay.get(key) ?? { buys: [], sells: [] };
    if (op.kind === "buy") bucket.buys.push(op);
    else bucket.sells.push(op);
    byDay.set(key, bucket);
  }

  const daysWithActivity = [...byDay.entries()]
    .map(([dateKey, { buys, sells }]) => buildDayRow(dateKey, currency, buys, sells))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  const daysWithSpend = daysWithActivity.filter((d) => d.direction !== "balanced");
  const todayKey = localDateKey(now);
  const today = daysWithActivity.find((d) => d.dateKey === todayKey) ?? emptyDay(todayKey, currency);

  const reserveDays = daysWithSpend.filter((d) => d.direction === "reserve_spend");
  const excessBuyDays = daysWithSpend.filter((d) => d.direction === "excess_buy");

  return {
    currency,
    today,
    daysWithSpend,
    daysWithActivity,
    totalExcessUsd: reserveDays.reduce((s, d) => s + d.excessAmt, 0),
    totalSpendKzt: reserveDays.reduce((s, d) => s + d.spendKzt, 0),
    totalExcessBuyAmt: excessBuyDays.reduce((s, d) => s + d.excessAmt, 0),
    totalExcessBuyKzt: excessBuyDays.reduce((s, d) => s + d.spendKzt, 0),
  };
}

/** Отчёт по всем валютам сразу (кроме KZT), сгруппированный по коду валюты. */
export function computePeopleMoneySpendByCurrency(
  ops: CashFxOp[],
  now = Date.now(),
): Record<string, PeopleMoneySpendReport> {
  const byCurrency = new Map<string, CashFxOp[]>();
  for (const op of ops) {
    const list = byCurrency.get(op.currency) ?? [];
    list.push(op);
    byCurrency.set(op.currency, list);
  }
  const result: Record<string, PeopleMoneySpendReport> = {};
  for (const [currency, currencyOps] of byCurrency) {
    result[currency] = computePeopleMoneySpend(currencyOps, now);
  }
  return result;
}

/** Упрощённый ввод для дневного отчёта кассы (USD, для обратной совместимости XLSX-отчёта). */
export function peopleMoneySpendFromReportTxs(
  txs: { id: string; kind: string; ts: number; currency: string; amount: number; rate?: number }[],
): PeopleMoneySpendDay {
  const ops: CashFxOp[] = txs
    .filter((t) => t.currency === "USD" && (t.kind === "buy" || t.kind === "sell"))
    .map((t) => {
      const rate = t.rate ?? 0;
      return {
        id: t.id,
        currency: "USD",
        occurredAt: t.ts,
        kind: t.kind as "buy" | "sell",
        foreignAmount: t.amount,
        rate,
        kztAmount: t.amount * rate,
      };
    });
  return computePeopleMoneySpend(ops).today;
}

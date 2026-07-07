import type { Tables } from "@/integrations/supabase/types";

type CashTxRow = Tables<"cash_transactions">;

export interface UsdCashFxOp {
  id: string;
  occurredAt: number;
  kind: "buy" | "sell";
  foreignAmount: number;
  rate: number;
  kztAmount: number;
  note?: string;
}

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

export function cashRowsToUsdFxOps(rows: CashTxRow[]): UsdCashFxOp[] {
  return rows
    .filter((r) => r.currency === "USD" && (r.kind === "buy" || r.kind === "sell"))
    .map((r) => {
      const foreignAmount = Number(r.amount);
      const rate = Number(r.rate ?? 0);
      return {
        id: r.id,
        occurredAt: new Date(r.ts).getTime(),
        kind: r.kind as "buy" | "sell",
        foreignAmount,
        rate,
        kztAmount: foreignAmount * rate,
        note: r.name ?? undefined,
      };
    });
}

export interface PeopleMoneySpendDay {
  dateKey: string;
  dateLabel: string;
  boughtUsd: number;
  soldUsd: number;
  /** max(0, sold − bought) — продано из резерва Жұрттың ақшасы */
  excessUsd: number;
  avgSellRate: number;
  spendKzt: number;
  buys: UsdCashFxOp[];
  sells: UsdCashFxOp[];
}

export interface PeopleMoneySpendReport {
  today: PeopleMoneySpendDay;
  /** Дни, где продали больше чем купили (трата > 0) */
  daysWithSpend: PeopleMoneySpendDay[];
  /** Все дни с USD buy/sell */
  daysWithActivity: PeopleMoneySpendDay[];
  totalExcessUsd: number;
  totalSpendKzt: number;
}

function emptyDay(dateKey: string): PeopleMoneySpendDay {
  return {
    dateKey,
    dateLabel: dateLabelFromKey(dateKey),
    boughtUsd: 0,
    soldUsd: 0,
    excessUsd: 0,
    avgSellRate: 0,
    spendKzt: 0,
    buys: [],
    sells: [],
  };
}

function buildDayRow(dateKey: string, buys: UsdCashFxOp[], sells: UsdCashFxOp[]): PeopleMoneySpendDay {
  const boughtUsd = buys.reduce((s, b) => s + b.foreignAmount, 0);
  const soldUsd = sells.reduce((s, x) => s + x.foreignAmount, 0);
  const sellKzt = sells.reduce((s, x) => s + x.kztAmount, 0);
  const avgSellRate = soldUsd > 0 ? sellKzt / soldUsd : 0;
  const excessUsd = Math.max(0, soldUsd - boughtUsd);
  const spendKzt = excessUsd * avgSellRate;

  return {
    dateKey,
    dateLabel: dateLabelFromKey(dateKey),
    boughtUsd,
    soldUsd,
    excessUsd,
    avgSellRate,
    spendKzt,
    buys: [...buys].sort((a, b) => a.occurredAt - b.occurredAt),
    sells: [...sells].sort((a, b) => a.occurredAt - b.occurredAt),
  };
}

/**
 * «Трата Жұрттың ақшасы» — если за день продали USD больше, чем купили,
 * превышение считается расходом клиентского резерва (Салынған) по средневзвешенному курсу продаж.
 */
export function computePeopleMoneySpend(
  ops: UsdCashFxOp[],
  now = Date.now(),
): PeopleMoneySpendReport {
  const byDay = new Map<string, { buys: UsdCashFxOp[]; sells: UsdCashFxOp[] }>();

  for (const op of ops) {
    const key = localDateKey(op.occurredAt);
    const bucket = byDay.get(key) ?? { buys: [], sells: [] };
    if (op.kind === "buy") bucket.buys.push(op);
    else bucket.sells.push(op);
    byDay.set(key, bucket);
  }

  const daysWithActivity = [...byDay.entries()]
    .map(([dateKey, { buys, sells }]) => buildDayRow(dateKey, buys, sells))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  const daysWithSpend = daysWithActivity.filter((d) => d.excessUsd > 0);
  const todayKey = localDateKey(now);
  const today = daysWithActivity.find((d) => d.dateKey === todayKey) ?? emptyDay(todayKey);

  return {
    today,
    daysWithSpend,
    daysWithActivity,
    totalExcessUsd: daysWithSpend.reduce((s, d) => s + d.excessUsd, 0),
    totalSpendKzt: daysWithSpend.reduce((s, d) => s + d.spendKzt, 0),
  };
}

/** Упрощённый ввод для дневного отчёта кассы. */
export function peopleMoneySpendFromReportTxs(
  txs: { id: string; kind: string; ts: number; currency: string; amount: number; rate?: number }[],
): PeopleMoneySpendDay {
  const ops: UsdCashFxOp[] = txs
    .filter((t) => t.currency === "USD" && (t.kind === "buy" || t.kind === "sell"))
    .map((t) => {
      const rate = t.rate ?? 0;
      return {
        id: t.id,
        occurredAt: t.ts,
        kind: t.kind as "buy" | "sell",
        foreignAmount: t.amount,
        rate,
        kztAmount: t.amount * rate,
      };
    });
  return computePeopleMoneySpend(ops).today;
}

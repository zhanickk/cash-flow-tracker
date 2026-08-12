import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fetchAllRows } from "@/lib/supabase-paginate";
import {
  computeSessionExcessByCurrency,
  type CashFxOp,
  type PeopleMoneySpendDay,
  type PeopleMoneySpendReport,
  type SpendDirection,
} from "@/lib/fx-people-money-spend";

type LogRow = Tables<"people_money_spend_log">;

export interface MoneySpendLogEntry {
  id: string;
  sessionStart: number;
  sessionEnd: number;
  currency: string;
  boughtAmount: number;
  soldAmount: number;
  avgBuyRate: number;
  avgSellRate: number;
  direction: SpendDirection;
  excessAmount: number;
  avgRate: number;
  spendKzt: number;
}

const LOG_KEY = ["people-money-spend-log"];

export function rowToEntry(r: LogRow): MoneySpendLogEntry {
  return {
    id: r.id,
    sessionStart: new Date(r.session_start).getTime(),
    sessionEnd: new Date(r.session_end).getTime(),
    currency: r.currency_code,
    boughtAmount: Number(r.bought_amount),
    soldAmount: Number(r.sold_amount),
    avgBuyRate: Number(r.avg_buy_rate),
    avgSellRate: Number(r.avg_sell_rate),
    direction: (r.direction as SpendDirection) || "balanced",
    excessAmount: Number(r.excess_amount),
    avgRate: Number(r.avg_rate),
    spendKzt: Number(r.spend_kzt),
  };
}

/** Постоянный журнал "Трата Жұрттың ақшасы" по завершённым сессиям — не
 * стирается при "Новый день" (в отличие от cash_transactions, откуда
 * считается ТЕКУЩАЯ ещё не закрытая сессия). История страницы = этот
 * журнал + текущая сессия. */
export function useMoneySpendLog() {
  return useQuery({
    queryKey: LOG_KEY,
    queryFn: async (): Promise<MoneySpendLogEntry[]> => {
      const rows = await fetchAllRows<LogRow>((from, to) =>
        supabase
          .from("people_money_spend_log")
          .select("*")
          .order("session_start", { ascending: false })
          .range(from, to),
      );
      return rows.map(rowToEntry);
    },
  });
}

/** Записывает итог по каждой валюте за закончившуюся сессию в постоянный
 * журнал — вызывается при "Новый день", чтобы история "Трата Жұрттың
 * ақшасы" не терялась при сбросе cash_transactions. Пишет только валюты, по
 * которым была хоть какая-то покупка/продажа за сессию. */
export async function recordMoneySpendLog(
  sessionStart: number,
  sessionEnd: number,
  rows: PeopleMoneySpendDay[],
  cashierName?: string | null,
) {
  const payload = rows
    .filter((r) => r.boughtAmt > 0 || r.soldAmt > 0)
    .map((r) => ({
      session_start: new Date(sessionStart).toISOString(),
      session_end: new Date(sessionEnd).toISOString(),
      currency_code: r.currency,
      bought_amount: r.boughtAmt,
      sold_amount: r.soldAmt,
      avg_buy_rate: r.avgBuyRate,
      avg_sell_rate: r.avgSellRate,
      direction: r.direction,
      excess_amount: r.excessAmt,
      avg_rate: r.avgRate,
      spend_kzt: r.spendKzt,
      cashier_name: cashierName ?? null,
    }));
  if (payload.length === 0) return;
  const { error } = await supabase.from("people_money_spend_log").insert(payload);
  if (error) throw error;
}

function logEntryToDay(e: MoneySpendLogEntry): PeopleMoneySpendDay {
  const d = new Date(e.sessionStart);
  const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dateLabel = d.toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return {
    dateKey,
    dateLabel,
    currency: e.currency,
    boughtAmt: e.boughtAmount,
    soldAmt: e.soldAmount,
    direction: e.direction,
    excessAmt: e.excessAmount,
    avgRate: e.avgRate,
    spendKzt: e.spendKzt,
    avgBuyRate: e.avgBuyRate,
    avgSellRate: e.avgSellRate,
    buys: [],
    sells: [],
    boughtUsd: e.boughtAmount,
    soldUsd: e.soldAmount,
    excessUsd: e.direction === "reserve_spend" ? e.excessAmount : 0,
  };
}

function emptyLiveDay(currency: string): PeopleMoneySpendDay {
  return {
    dateKey: "live",
    dateLabel: "Сегодня (текущая сессия)",
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

/** Полный отчёт по каждой валюте: текущая (ещё не закрытая) сессия из живых
 * cash_transactions + вся прошлая история из постоянного журнала. История
 * теперь не пропадает при "Новый день" — раньше страница считала историю
 * по дням прямо из cash_transactions, которая стирается сбросом. */
export function buildMergedPeopleMoneySpendReports(
  liveOps: CashFxOp[],
  logEntries: MoneySpendLogEntry[],
): Record<string, PeopleMoneySpendReport> {
  const liveByCurrency = computeSessionExcessByCurrency(liveOps);

  const currencies = new Set<string>([
    ...Object.keys(liveByCurrency),
    ...logEntries.map((e) => e.currency),
  ]);

  const result: Record<string, PeopleMoneySpendReport> = {};
  for (const currency of currencies) {
    const liveRow = liveByCurrency[currency];
    const today: PeopleMoneySpendDay = liveRow
      ? { ...liveRow, dateKey: "live", dateLabel: "Сегодня (текущая сессия)" }
      : emptyLiveDay(currency);

    const historicalRows = logEntries
      .filter((e) => e.currency === currency)
      .map(logEntryToDay)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

    const daysWithActivity = [today, ...historicalRows].filter(
      (d) => d.boughtAmt > 0 || d.soldAmt > 0,
    );
    const daysWithSpend = daysWithActivity.filter((d) => d.direction !== "balanced");
    const reserveDays = daysWithSpend.filter((d) => d.direction === "reserve_spend");
    const excessBuyDays = daysWithSpend.filter((d) => d.direction === "excess_buy");

    result[currency] = {
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
  return result;
}

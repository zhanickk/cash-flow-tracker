import { supabase } from "@/integrations/supabase/client";
import { getCachedCashierName } from "@/lib/auth";
import { rowToTx } from "@/lib/cash-register";
import type { Transaction } from "@/lib/cash-shared";
import { txsToFxOps } from "@/lib/fx-people-money-spend";
import {
  carryOutFrom,
  computeSimpleIncome,
  totalSimpleIncome,
  type CarryIn,
  type SimpleCurrencyIncome,
} from "@/lib/simple-income";

/**
 * Пересчёт цепочки смен после правки прошлого дня.
 *
 * Смены связаны переносом остатка: изменил операцию 14-го — поехали доход
 * 14-го, перенос на 15-е, доход 15-го и так далее до текущей. Поэтому правка
 * одного дня требует переиграть все последующие, иначе цифры разойдутся
 * молча: журнал будет говорить одно, а перенос — другое.
 *
 * Пересчёт детерминированный: берём архив операций по дням, идём по датам от
 * старой к новой и на каждой считаем ту же формулу, что и обычная смена.
 */

export interface DayIncome {
  businessDate: string;
  incomeKzt: number;
  rows: SimpleCurrencyIncome[];
  carryOut: CarryIn[];
}

/** Операции всех смен начиная с указанной даты, сгруппированные по дате. */
async function loadDaysFrom(fromDate: string): Promise<Map<string, Transaction[]>> {
  const { data, error } = await supabase
    .from("cash_transactions")
    .select("*")
    .gte("business_date", fromDate)
    .order("ts", { ascending: true });
  if (error) throw error;

  const byDate = new Map<string, Transaction[]>();
  for (const row of data ?? []) {
    const date = row.business_date;
    if (!date) continue;
    const list = byDate.get(date) ?? [];
    list.push(rowToTx(row));
    byDate.set(date, list);
  }
  return byDate;
}

/** Перенос, с которым стартовала указанная дата — это остаток предыдущей
 * смены, лежащий в журнале. */
export async function carryInBefore(date: string): Promise<CarryIn[]> {
  const { data, error } = await supabase
    .from("people_money_spend_log")
    .select("*")
    .lt("business_date", date)
    .order("business_date", { ascending: false });
  if (error) throw error;
  // По КАЖДОЙ валюте берём её последнюю запись до этой даты, а не строки
  // одного предыдущего дня. Иначе валюта, не торговавшаяся в тот день,
  // выпадает из переноса вместе со своей себестоимостью — ровно так
  // потерялось золото (780 г в кассе против 10 г в цепочке).
  const latestByCurrency = new Map<string, (typeof data)[number]>();
  for (const r of data ?? []) {
    if (!latestByCurrency.has(r.currency_code)) latestByCurrency.set(r.currency_code, r);
  }
  return [...latestByCurrency.values()]
    .filter((r) => Number(r.excess_amount) > 0 && Number(r.avg_rate) > 0)
    .map((r) => ({
      currency: r.currency_code,
      amount:
        r.direction === "excess_buy" ? Number(r.excess_amount) : -Number(r.excess_amount),
      rate: Number(r.avg_rate),
    }));
}

/**
 * Считает, как изменится цепочка, НЕ записывая ничего. Нужно для окна
 * подтверждения: показать «было → станет» до того, как пользователь согласится.
 */
export async function previewChain(fromDate: string): Promise<DayIncome[]> {
  const byDate = await loadDaysFrom(fromDate);
  const dates = [...byDate.keys()].sort();
  let carry = await carryInBefore(fromDate);

  const result: DayIncome[] = [];
  for (const date of dates) {
    const txs = byDate.get(date) ?? [];
    const rows = computeSimpleIncome(txsToFxOps(txs), carry);
    const carryOut = carryOutFrom(rows);
    result.push({
      businessDate: date,
      incomeKzt: totalSimpleIncome(rows),
      rows: Object.values(rows),
      carryOut,
    });
    carry = carryOut;
  }
  return result;
}

/** Доход по дням, как он записан в журнале сейчас. */
export async function currentChain(fromDate: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("people_money_spend_log")
    .select("business_date, income_kzt")
    .gte("business_date", fromDate);
  if (error) throw error;
  const map: Record<string, number> = {};
  for (const r of data ?? []) {
    if (!r.business_date) continue;
    map[r.business_date] = (map[r.business_date] ?? 0) + Number(r.income_kzt);
  }
  return map;
}

/**
 * Применяет пересчёт: переписывает журнал смен по затронутым дням и обновляет
 * перенос текущей смены остатком последнего закрытого дня.
 */
export async function applyChain(fromDate: string, chain: DayIncome[]) {
  for (const day of chain) {
    const { error: delErr } = await supabase
      .from("people_money_spend_log")
      .delete()
      .eq("business_date", day.businessDate);
    if (delErr) throw delErr;

    const payload = day.rows
      .filter((r) => r.boughtAmt > 0 || r.soldAmt > 0)
      .map((r) => ({
        business_date: day.businessDate,
        session_start: `${day.businessDate}T00:00:00Z`,
        session_end: `${day.businessDate}T23:59:59Z`,
        currency_code: r.currency,
        bought_amount: r.boughtAmt,
        sold_amount: r.soldAmt,
        avg_buy_rate: r.avgBuyRate,
        avg_sell_rate: r.avgSellRate,
        direction: r.direction,
        excess_amount: r.excessAmt,
        avg_rate: r.excessRate,
        spend_kzt: Math.abs(r.excessKzt),
        carry_in_amount: r.carryInAmount,
        carry_in_rate: r.carryInRate,
        matched_amount: r.matchedAmt,
        income_kzt: r.incomeKzt,
        cashier_name: getCachedCashierName(),
      }));
    if (payload.length > 0) {
      const { error } = await supabase.from("people_money_spend_log").insert(payload);
      if (error) throw error;
    }
  }

  // Текущая смена стартует с остатка последнего закрытого дня.
  const last = chain[chain.length - 1];
  if (last) {
    const { error: delErr } = await supabase
      .from("session_carry_in")
      .delete()
      .neq("currency_code", "");
    if (delErr) throw delErr;
    const rows = last.carryOut.filter((r) => r.amount !== 0 && r.rate > 0);
    if (rows.length > 0) {
      const { error } = await supabase.from("session_carry_in").insert(
        rows.map((r) => ({ currency_code: r.currency, amount: r.amount, rate: r.rate })),
      );
      if (error) throw error;
    }
  }
}

/** Запись в журнал правок прошлых смен — что меняли и каким оно было. */
export async function logPastDayEdit(input: {
  businessDate: string;
  action: string;
  summary: string;
  before?: unknown;
  after?: unknown;
}) {
  const { error } = await supabase.from("past_day_edit_log").insert({
    business_date: input.businessDate,
    action: input.action,
    summary: input.summary,
    before_value: (input.before ?? null) as never,
    after_value: (input.after ?? null) as never,
    cashier_name: getCachedCashierName(),
  });
  if (error) throw error;
}

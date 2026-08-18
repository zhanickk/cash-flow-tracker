import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { type Transaction, type HistoryEntry, txLabel } from "@/lib/cash-shared";
import { allocationForSellInsert, recomputeUsdSaleAllocations } from "@/lib/fx-allocation-persist";
import {
  syncFxSaleDeleteFromCashTx,
  syncFxSaleFromCashTx,
  syncFxSaleUpdateFromCashTx,
} from "@/lib/fx-sales";
import {
  recordFxPurchase,
  syncFxPurchaseDeleteFromCashTx,
  syncFxPurchaseFromCashTx,
  syncFxPurchaseUpdateFromCashTx,
} from "@/lib/fx-purchases";
import {
  syncExpenseDeleteFromCashTx,
  syncExpenseFromCashTx,
  syncExpenseUpdateFromCashTx,
} from "@/lib/expenses";
import { getCachedCashierName } from "@/lib/auth";
import { recordMoneySpendLog } from "@/lib/people-money-spend-log";
import { replaceSessionCarryIn, CARRY_IN_KEY } from "@/lib/session-carry-in";
import { setSessionDate, SESSION_DATE_KEY } from "@/lib/session-date";
import { updateCostBasis, COST_BASIS_KEY } from "@/lib/currency-cost-basis";
import type { CarryIn, SimpleCurrencyIncome } from "@/lib/simple-income";
import type { PeopleMoneySpendDay } from "@/lib/fx-people-money-spend";

export type CashTxRow = Tables<"cash_transactions">;
export type CashHistoryRow = Tables<"cash_register_history">;

const TX_KEY = ["cash-transactions"];
const HISTORY_KEY = ["cash-history"];

export function rowToTx(r: CashTxRow): Transaction {
  return {
    id: r.id,
    kind: r.kind as Transaction["kind"],
    ts: new Date(r.ts).getTime(),
    name: r.name ?? undefined,
    currency: r.currency as Transaction["currency"],
    amount: Number(r.amount),
    rate: r.rate == null ? undefined : Number(r.rate),
    expenseType: (r.expense_type as Transaction["expenseType"]) ?? undefined,
    contactTxId: r.contact_tx_id ?? undefined,
  };
}

function rowToHistory(r: CashHistoryRow): HistoryEntry {
  return {
    id: r.id,
    ts: new Date(r.ts).getTime(),
    action: r.action as HistoryEntry["action"],
    kind: (r.kind as HistoryEntry["kind"]) ?? undefined,
    summary: r.summary,
    cashierName: r.cashier_name ?? undefined,
  };
}

/* ============== Reads ============== */

/**
 * Операции смены. Без аргумента — текущая открытая смена; с датой — архивная.
 *
 * Операции больше не удаляются при «Новый день», а остаются в базе с рабочей
 * датой, поэтому читать таблицу целиком нельзя: без фильтра касса показала бы
 * все дни разом. Дату берём из session_state, чтобы она совпадала с той, что
 * стоит в шапке.
 */
export function useCashTransactions(businessDate?: string) {
  return useQuery({
    queryKey: businessDate ? [...TX_KEY, businessDate] : TX_KEY,
    queryFn: async (): Promise<Transaction[]> => {
      let date = businessDate;
      if (!date) {
        const { data: st, error: stErr } = await supabase
          .from("session_state")
          .select("business_date")
          .eq("id", true)
          .maybeSingle();
        if (stErr) throw stErr;
        date = st?.business_date ?? undefined;
      }
      let q = supabase.from("cash_transactions").select("*").order("ts", { ascending: true });
      // Строки без даты — наследие до появления архива, они принадлежат
      // текущей смене.
      q = date ? q.or(`business_date.eq.${date},business_date.is.null`) : q;
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(rowToTx);
    },
  });
}

/** Даты смен, попавшие в архив, от новых к старым. */
export function useArchivedDays() {
  return useQuery({
    queryKey: ["archived-days"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("cash_transactions")
        .select("business_date")
        .not("business_date", "is", null);
      if (error) throw error;
      const set = new Set<string>();
      for (const r of data ?? []) if (r.business_date) set.add(r.business_date);
      return [...set].sort((a, b) => b.localeCompare(a));
    },
  });
}

/** Supabase/PostgREST caps a single request at 1000 rows by default, so once the
 * journal grows past that the oldest/most-recent entries silently disappear.
 * Page through with .range() until a page comes back short. */
async function fetchAllCashHistory(): Promise<CashHistoryRow[]> {
  const pageSize = 1000;
  const rows: CashHistoryRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("cash_register_history")
      .select("*")
      .order("ts", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export function useCashHistory() {
  return useQuery({
    queryKey: HISTORY_KEY,
    queryFn: async (): Promise<HistoryEntry[]> => {
      const rows = await fetchAllCashHistory();
      return rows.map(rowToHistory);
    },
  });
}

/* ============== History logging (internal) ============== */

export async function insertHistory(entry: Omit<HistoryEntry, "id" | "ts">) {
  const { error } = await supabase.from("cash_register_history").insert({
    action: entry.action,
    kind: entry.kind ?? null,
    summary: entry.summary,
    cashier_name: getCachedCashierName(),
  });
  if (error) throw error;
}

/* ============== Mutations ============== */

async function settleCashMutations(
  qc: ReturnType<typeof useQueryClient>,
  tx?: Pick<Transaction, "kind">,
) {
  if (tx?.kind === "sell") await recomputeUsdSaleAllocations();
  qc.invalidateQueries({ queryKey: TX_KEY });
  qc.invalidateQueries({ queryKey: HISTORY_KEY });
  qc.invalidateQueries({ queryKey: ["fx-sales"] });
  qc.invalidateQueries({ queryKey: ["fx-purchases"] });
  qc.invalidateQueries({ queryKey: ["expenses"] });
  qc.invalidateQueries({ queryKey: ["fx-currency-holdings"] });
  qc.invalidateQueries({ queryKey: ["fx-risk-dashboard"] });
}

export function useAddCashTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tx: Transaction) => {
      const occurredAt = tx.ts ? new Date(tx.ts).toISOString() : new Date().toISOString();
      let karyzAmount = 0;
      let salynghanAmount = 0;
      let allocNote = "";
      if (tx.kind === "sell" && tx.rate) {
        const alloc = await allocationForSellInsert({
          kind: tx.kind,
          currency: tx.currency,
          foreignAmount: tx.amount,
          rate: tx.rate,
          occurredAt,
        });
        karyzAmount = alloc.karyzAmount;
        salynghanAmount = alloc.salynghanAmount;
        if (alloc.warning) allocNote = ` · ${alloc.warning}`;
      }
      const { error } = await supabase.from("cash_transactions").insert({
        id: tx.id,
        kind: tx.kind,
        currency: tx.currency,
        amount: tx.amount,
        name: tx.name ?? null,
        rate: tx.rate ?? null,
        expense_type: tx.expenseType ?? null,
        contact_tx_id: tx.contactTxId ?? null,
        ts: occurredAt,
        karyz_amount: karyzAmount,
        salynghan_amount: salynghanAmount,
      });
      if (error) throw error;
      if (tx.kind === "sell" && tx.rate) {
        await syncFxSaleFromCashTx({
          id: tx.id,
          kind: tx.kind,
          currency: tx.currency,
          amount: tx.amount,
          rate: tx.rate,
          name: tx.name ?? null,
          ts: occurredAt,
        });
      }
      if ((tx.kind === "buy" || tx.kind === "opening") && tx.rate) {
        // "opening" (Остаток) с указанным курсом — тоже даёт себестоимость
        // на будущее в Калькуляторе дохода/дневном отчёте.
        await syncFxPurchaseFromCashTx({
          id: tx.id,
          kind: tx.kind,
          currency: tx.currency,
          amount: tx.amount,
          rate: tx.rate,
          name: tx.name ?? null,
          ts: occurredAt,
        });
      }
      if (tx.kind === "expense") {
        await syncExpenseFromCashTx({
          id: tx.id,
          kind: tx.kind,
          expenseType: tx.expenseType ?? null,
          currency: tx.currency,
          amount: tx.amount,
          name: tx.name ?? null,
          ts: occurredAt,
        });
      }
      await insertHistory({
        action: "add",
        kind: tx.kind,
        summary: `Добавлено — ${txLabel(tx)}${allocNote}`,
      });
      return tx;
    },
    onMutate: async (tx) => {
      await qc.cancelQueries({ queryKey: TX_KEY });
      const prev = qc.getQueryData<Transaction[]>(TX_KEY);
      qc.setQueryData<Transaction[]>(TX_KEY, (old) => [...(old ?? []), { ...tx, ts: Date.now() }]);
      return { prev };
    },
    onError: (_err, _tx, ctx) => {
      if (ctx?.prev) qc.setQueryData(TX_KEY, ctx.prev);
    },
    onSettled: async (_d, _e, tx) => {
      await settleCashMutations(qc, tx);
    },
  });
}

export function useUpdateCashTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; patch: Partial<Transaction>; old: Transaction }) => {
      const { id, patch, old } = vars;
      const dbPatch: TablesUpdate<"cash_transactions"> = {};
      if (patch.name !== undefined) dbPatch.name = patch.name ?? null;
      if (patch.currency !== undefined) dbPatch.currency = patch.currency;
      if (patch.amount !== undefined) dbPatch.amount = patch.amount;
      if (patch.rate !== undefined) dbPatch.rate = patch.rate ?? null;
      if (patch.contactTxId !== undefined) dbPatch.contact_tx_id = patch.contactTxId ?? null;
      if (Object.keys(dbPatch).length > 0) {
        const { error } = await supabase.from("cash_transactions").update(dbPatch).eq("id", id);
        if (error) throw error;
      }
      const merged: Transaction = {
        ...old,
        ...patch,
        name: patch.name !== undefined ? patch.name : old.name,
        currency: patch.currency ?? old.currency,
        amount: patch.amount ?? old.amount,
        rate: patch.rate !== undefined ? patch.rate : old.rate,
      };
      if (old.kind === "sell" || merged.kind === "sell") {
        await syncFxSaleUpdateFromCashTx(id, {
          kind: merged.kind,
          currency: merged.currency,
          amount: merged.amount,
          rate: merged.rate ?? null,
          name: merged.name ?? null,
          ts: merged.ts,
        });
      }
      if (["buy", "opening"].includes(old.kind) || ["buy", "opening"].includes(merged.kind)) {
        await syncFxPurchaseUpdateFromCashTx(id, {
          kind: merged.kind,
          currency: merged.currency,
          amount: merged.amount,
          rate: merged.rate ?? null,
          name: merged.name ?? null,
          ts: merged.ts,
        });
      }
      if (old.kind === "expense" || merged.kind === "expense") {
        await syncExpenseUpdateFromCashTx(id, {
          kind: merged.kind,
          expenseType: merged.expenseType ?? null,
          currency: merged.currency,
          amount: merged.amount,
          name: merged.name ?? null,
          ts: merged.ts,
        });
      }
      const changes: string[] = [];
      if (patch.name !== undefined && patch.name !== old.name)
        changes.push(`имя: "${old.name ?? ""}" → "${patch.name ?? ""}"`);
      if (patch.currency && patch.currency !== old.currency)
        changes.push(`валюта: ${old.currency} → ${patch.currency}`);
      if (patch.amount !== undefined && patch.amount !== old.amount)
        changes.push(`сумма: ${old.amount} → ${patch.amount}`);
      if (patch.rate !== undefined && patch.rate !== old.rate)
        changes.push(`курс: ${old.rate ?? "—"} → ${patch.rate ?? "—"}`);
      await insertHistory({
        action: "edit",
        kind: old.kind,
        summary: `Изменено — ${txLabel(old)} (${changes.join(", ") || "без изменений"})`,
      });
      return vars;
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: TX_KEY });
      const prev = qc.getQueryData<Transaction[]>(TX_KEY);
      qc.setQueryData<Transaction[]>(TX_KEY, (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(TX_KEY, ctx.prev);
    },
    onSettled: async (_d, _e, vars) => {
      await settleCashMutations(qc, vars?.old);
    },
  });
}

export function useDeleteCashTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (old: Transaction) => {
      if (old.kind === "sell") {
        await syncFxSaleDeleteFromCashTx(old.id);
      }
      if (old.kind === "buy" || old.kind === "opening") {
        await syncFxPurchaseDeleteFromCashTx(old.id);
      }
      if (old.kind === "expense") {
        await syncExpenseDeleteFromCashTx(old.id);
      }
      const { error } = await supabase.from("cash_transactions").delete().eq("id", old.id);
      if (error) throw error;
      await insertHistory({ action: "delete", kind: old.kind, summary: `Удалено — ${txLabel(old)}` });
      return old;
    },
    onMutate: async (old) => {
      await qc.cancelQueries({ queryKey: TX_KEY });
      const prev = qc.getQueryData<Transaction[]>(TX_KEY);
      qc.setQueryData<Transaction[]>(TX_KEY, (list) => (list ?? []).filter((t) => t.id !== old.id));
      return { prev };
    },
    onError: (_err, _old, ctx) => {
      if (ctx?.prev) qc.setQueryData(TX_KEY, ctx.prev);
    },
    onSettled: async (_d, _e, old) => {
      await settleCashMutations(qc, old);
    },
  });
}

export function useResetCashRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Чистим только текущую смену: архив прошлых дней не трогаем.
      const { data: st } = await supabase
        .from("session_state")
        .select("business_date")
        .eq("id", true)
        .maybeSingle();
      const date = st?.business_date;
      let q = supabase.from("cash_transactions").delete();
      q = date ? q.or(`business_date.eq.${date},business_date.is.null`) : q.is("business_date", null);
      const { error } = await q;
      if (error) throw error;
      await insertHistory({
        action: "reset",
        summary: "КАССА ПЕРЕЗАПУЩЕНА — операции текущей смены очищены",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TX_KEY });
      qc.invalidateQueries({ queryKey: HISTORY_KEY });
      qc.invalidateQueries({ queryKey: ["fx-sales"] });
      qc.invalidateQueries({ queryKey: ["fx-purchases"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["fx-currency-holdings"] });
    },
  });
}

export function useNewDayCashRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      openings,
      excessBuys = [],
      spendLog = [],
      sessionStart,
      simpleRows = [],
      carryOut = [],
      closingBusinessDate,
      openingBusinessDate,
    }: {
      openings: Transaction[];
      /** Валюты, где за уходящую сессию купили больше, чем продали (излишек-
       * закуп из "Трата Жұрттың ақшасы") — себестоимость этого излишка
       * записывается в fx_purchases автоматически, чтобы Калькулятор дохода
       * с завтрашнего дня считал его не "без себестоимости" (0 маржи), а по
       * реальному среднему курсу покупки. Раньше это приходилось делать
       * вручную по просьбе пользователя — теперь модуль "Трата Жұрттың
       * ақшасы" и создан для этого: считает сам каждый раз при "Новый день". */
      excessBuys?: { currencyCode: string; foreignAmount: number; rate: number }[];
      /** Полный итог "Трата Жұрттың ақшасы" по каждой валюте за уходящую
       * сессию (оба направления) — пишется в постоянный журнал
       * people_money_spend_log, чтобы история страницы не терялась при
       * сбросе cash_transactions. */
      spendLog?: PeopleMoneySpendDay[];
      sessionStart: number;
      /** Итог закрывающейся смены по простой формуле обменника
       * (ср.курс продажи − ср.курс покупки) × min(куплено, продано). */
      simpleRows?: SimpleCurrencyIncome[];
      /** Остаток, уезжающий в следующую смену: >0 — излишек закупа (встанет
       * в её покупки), <0 — перепродали (встанет в её продажи). */
      carryOut?: CarryIn[];
      /** Рабочая дата закрывающейся смены — под ней её итог ляжет в журнал. */
      closingBusinessDate?: string;
      /** Рабочая дата открываемой смены (может быть впереди календаря). */
      openingBusinessDate?: string;
    }) => {
      // Операции закрывающейся смены НЕ удаляем — помечаем её рабочей датой и
      // оставляем в архиве, чтобы день можно было открыть и исправить. Раньше
      // они стирались, и ошибку прошлого дня уже нечем было поправить.
      if (closingBusinessDate) {
        const { error: stampErr } = await supabase
          .from("cash_transactions")
          .update({ business_date: closingBusinessDate })
          .is("business_date", null);
        if (stampErr) throw stampErr;
      }
      if (openings.length > 0) {
        const { error: insErr } = await supabase.from("cash_transactions").insert(
          openings.map((o) => ({
            id: o.id,
            kind: o.kind,
            currency: o.currency,
            amount: o.amount,
            name: o.name ?? null,
            business_date: openingBusinessDate ?? null,
          })),
        );
        if (insErr) throw insErr;
      }
      const now = Date.now();
      const occurredAt = new Date(now).toISOString();
      for (const eb of excessBuys) {
        if (eb.foreignAmount <= 0 || eb.rate <= 0) continue;
        await recordFxPurchase({
          currencyCode: eb.currencyCode,
          foreignAmount: eb.foreignAmount,
          rate: eb.rate,
          occurredAt,
          note: "Остаток на начало дня (излишек-закуп, авто из «Трата Жұрттың ақшасы»)",
        });
      }
      await recordMoneySpendLog(
        sessionStart,
        now,
        spendLog,
        getCachedCashierName(),
        simpleRows,
        closingBusinessDate,
      );
      // Остаток уходящей смены становится стартом следующей: перезаписываем
      // перенос целиком, чтобы там не осталось позавчерашних строк.
      await replaceSessionCarryIn(carryOut);
      if (openingBusinessDate) await setSessionDate(openingBusinessDate);
      // Курс закупа держим отдельно от переноса: перенос у простаивающей
      // валюты исчезает, а себестоимость её запаса — нет.
      await updateCostBasis(simpleRows);
      await insertHistory({
        action: "reset",
        summary: `НОВЫЙ ДЕНЬ — остатки перенесены (${openings.length} валют)${
          excessBuys.length > 0 ? `, себестоимость излишка записана (${excessBuys.length})` : ""
        }`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TX_KEY });
      qc.invalidateQueries({ queryKey: HISTORY_KEY });
      qc.invalidateQueries({ queryKey: ["fx-sales"] });
      qc.invalidateQueries({ queryKey: ["fx-purchases"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["fx-currency-holdings"] });
      qc.invalidateQueries({ queryKey: ["people-money-spend-log"] });
      qc.invalidateQueries({ queryKey: CARRY_IN_KEY });
      qc.invalidateQueries({ queryKey: SESSION_DATE_KEY });
      qc.invalidateQueries({ queryKey: COST_BASIS_KEY });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { insertHistory } from "@/lib/cash-register";
import { fmt, txLabel, type Currency, type Transaction } from "@/lib/cash-shared";
import { getCachedCashierName } from "@/lib/auth";
import { weightedAvgRate } from "@/lib/fx-pots";
import {
  computeUsdAllocationForNewSale,
  recomputeUsdSaleAllocations,
} from "@/lib/fx-allocation-persist";

export type FxCurrency = Tables<"fx_currencies">;
type FxSaleRow = Tables<"fx_sales">;

export interface FxSale {
  id: string;
  occurredAt: number;
  currencyCode: string;
  foreignAmount: number;
  rate: number;
  kztAmount: number;
  note?: string;
  cashierName?: string;
  /** Связь с операцией кассы (может обнулиться при новом дне) */
  cashTransactionId?: string | null;
  /** Только для чтения из кассы (currency-balance) */
  karyzAmount?: number;
  salynghanAmount?: number;
  allocationLabel?: string;
}

export type PeriodPreset = "all" | "day" | "week" | "month" | "custom";

export interface FxSalesFilters {
  period: PeriodPreset;
  dateFrom: string;
  dateTo: string;
  currencies: string[];
}

export interface FxCurrencySummary {
  currencyCode: string;
  label: string;
  foreignTotal: number;
  kztTotal: number;
  weightedRate: number;
  count: number;
}

const SALES_KEY = ["fx-sales"];
const CURRENCIES_KEY = ["fx-currencies"];
const TX_KEY = ["cash-transactions"];
const HISTORY_KEY = ["cash-history"];

function fxRowToSale(r: FxSaleRow): FxSale {
  return {
    id: r.id,
    occurredAt: new Date(r.occurred_at).getTime(),
    currencyCode: r.currency_code,
    foreignAmount: Number(r.foreign_amount),
    rate: Number(r.rate),
    kztAmount: Number(r.kzt_amount),
    note: r.note ?? undefined,
    cashierName: r.cashier_name ?? undefined,
    cashTransactionId: r.cash_transaction_id,
  };
}

export function saleLabel(s: FxSale, currencyLabel?: string) {
  const cur = currencyLabel ?? s.currencyCode;
  return `${cur}: ${fmt(s.foreignAmount)} × ${fmt(s.rate, 4)} = ${fmt(s.kztAmount)} ₸`;
}

export function defaultFilters(): FxSalesFilters {
  const now = new Date();
  const start = new Date(now);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return {
    period: "month",
    dateFrom: toDateInput(start),
    dateTo: toDateInput(now),
    currencies: [],
  };
}

export function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toDateTimeLocalInput(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

function startOfDay(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).getTime();
}

function endOfDay(dateStr: string) {
  return new Date(`${dateStr}T23:59:59.999`).getTime();
}

export function applyPeriodPreset(period: PeriodPreset, base = new Date()) {
  const end = new Date(base);
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  if (period === "day") {
    return { dateFrom: toDateInput(start), dateTo: toDateInput(end) };
  }
  if (period === "week") {
    start.setDate(start.getDate() - 6);
    return { dateFrom: toDateInput(start), dateTo: toDateInput(end) };
  }
  if (period === "month") {
    start.setDate(1);
    return { dateFrom: toDateInput(start), dateTo: toDateInput(end) };
  }
  return { dateFrom: "", dateTo: "" };
}

export function filterFxSales(sales: FxSale[], filters: FxSalesFilters): FxSale[] {
  let fromTs = filters.dateFrom ? startOfDay(filters.dateFrom) : -Infinity;
  let toTs = filters.dateTo ? endOfDay(filters.dateTo) : Infinity;

  if (filters.period !== "custom" && filters.period !== "all") {
    const range = applyPeriodPreset(filters.period);
    fromTs = startOfDay(range.dateFrom);
    toTs = endOfDay(range.dateTo);
  }

  const currencyCodes = filters.currencies ?? [];
  const currencySet =
    currencyCodes.length > 0 ? new Set(currencyCodes.map((c) => c.toUpperCase())) : null;

  return sales.filter((s) => {
    if (filters.period !== "all") {
      if (s.occurredAt < fromTs || s.occurredAt > toTs) return false;
    }
    if (currencySet && !currencySet.has(s.currencyCode)) return false;
    return true;
  });
}

export function filtersToPeriodTs(filters: FxSalesFilters): { fromTs: number; toTs: number } {
  let fromTs = filters.dateFrom ? startOfDay(filters.dateFrom) : -Infinity;
  let toTs = filters.dateTo ? endOfDay(filters.dateTo) : Infinity;
  if (filters.period !== "custom" && filters.period !== "all") {
    const range = applyPeriodPreset(filters.period);
    fromTs = startOfDay(range.dateFrom);
    toTs = endOfDay(range.dateTo);
  }
  return { fromTs, toTs };
}

export function aggregateByCurrency(
  sales: FxSale[],
  currencies: FxCurrency[],
): FxCurrencySummary[] {
  const labelByCode = new Map(currencies.map((c) => [c.code, c.label]));
  const map = new Map<string, FxSale[]>();

  for (const s of sales) {
    const list = map.get(s.currencyCode) ?? [];
    list.push(s);
    map.set(s.currencyCode, list);
  }

  return [...map.entries()]
    .map(([currencyCode, list]) => {
      const foreignTotal = list.reduce((a, s) => a + s.foreignAmount, 0);
      const kztTotal = list.reduce((a, s) => a + s.kztAmount, 0);
      const weightedRate = weightedAvgRate(
        list.map((s) => ({
          ...s,
          foreignAmount: s.foreignAmount,
          rate: s.rate,
          kztAmount: s.kztAmount,
          currencyCode: s.currencyCode,
          occurredAt: s.occurredAt,
          id: s.id,
        })),
      );
      return {
        currencyCode,
        label: labelByCode.get(currencyCode) ?? currencyCode,
        foreignTotal,
        kztTotal,
        weightedRate,
        count: list.length,
      };
    })
    .sort((a, b) => b.kztTotal - a.kztTotal);
}

/** Запись в журнал fx_sales (не удаляется при новом дне кассы). */
export async function recordFxSale(input: {
  cashTransactionId?: string | null;
  occurredAt: string;
  currencyCode: string;
  foreignAmount: number;
  rate: number;
  note?: string | null;
}): Promise<string> {
  const kztAmount = input.foreignAmount * input.rate;
  const { data, error } = await supabase
    .from("fx_sales")
    .insert({
      cash_transaction_id: input.cashTransactionId ?? null,
      currency_code: input.currencyCode,
      foreign_amount: input.foreignAmount,
      rate: input.rate,
      kzt_amount: kztAmount,
      note: input.note?.trim() || null,
      occurred_at: input.occurredAt,
      cashier_name: getCachedCashierName(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Синхронизация продажи из кассы → журнал fx_sales (создание). */
export async function syncFxSaleFromCashTx(tx: {
  id: string;
  kind: string;
  currency: string;
  amount: number;
  rate?: number | null;
  name?: string | null;
  ts: string | number;
}) {
  if (tx.kind !== "sell") return;
  const { data: existing } = await supabase
    .from("fx_sales")
    .select("id")
    .eq("cash_transaction_id", tx.id)
    .maybeSingle();
  if (existing) return;

  const rate = Number(tx.rate ?? 0);
  if (rate <= 0) return;

  await recordFxSale({
    cashTransactionId: tx.id,
    occurredAt: typeof tx.ts === "number" ? new Date(tx.ts).toISOString() : tx.ts,
    currencyCode: tx.currency,
    foreignAmount: Number(tx.amount),
    rate,
    note: tx.name,
  });
}

/** Обновление записи журнала по операции кассы. */
export async function syncFxSaleUpdateFromCashTx(
  cashTxId: string,
  merged: {
    kind: string;
    currency: string;
    amount: number;
    rate?: number | null;
    name?: string | null;
    ts?: string | number;
  },
) {
  if (merged.kind !== "sell") {
    await syncFxSaleDeleteFromCashTx(cashTxId);
    return;
  }

  const rate = Number(merged.rate ?? 0);
  const { data: existing } = await supabase
    .from("fx_sales")
    .select("id")
    .eq("cash_transaction_id", cashTxId)
    .maybeSingle();

  if (rate <= 0) {
    if (existing) {
      const { error } = await supabase.from("fx_sales").delete().eq("id", existing.id);
      if (error) throw error;
    }
    return;
  }

  const foreignAmount = Number(merged.amount);
  const kztAmount = foreignAmount * rate;
  const occurredAt =
    merged.ts !== undefined
      ? typeof merged.ts === "number"
        ? new Date(merged.ts).toISOString()
        : merged.ts
      : undefined;

  if (existing) {
    const patch: TablesUpdate<"fx_sales"> = {
      currency_code: merged.currency,
      foreign_amount: foreignAmount,
      rate,
      kzt_amount: kztAmount,
      note: merged.name?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (occurredAt) patch.occurred_at = occurredAt;
    const { error } = await supabase.from("fx_sales").update(patch).eq("id", existing.id);
    if (error) throw error;
    return;
  }

  await recordFxSale({
    cashTransactionId: cashTxId,
    occurredAt: occurredAt ?? new Date().toISOString(),
    currencyCode: merged.currency,
    foreignAmount,
    rate,
    note: merged.name,
  });
}

/** Удаление записи журнала, связанной с операцией кассы. */
export async function syncFxSaleDeleteFromCashTx(cashTxId: string) {
  const { error } = await supabase
    .from("fx_sales")
    .delete()
    .eq("cash_transaction_id", cashTxId);
  if (error) throw error;
}

/* ============== Reads ============== */

export function useFxCurrencies() {
  return useQuery({
    queryKey: CURRENCIES_KEY,
    queryFn: async (): Promise<FxCurrency[]> => {
      const { data, error } = await supabase
        .from("fx_currencies")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFxSales() {
  return useQuery({
    queryKey: SALES_KEY,
    queryFn: async (): Promise<FxSale[]> => {
      const { data, error } = await supabase
        .from("fx_sales")
        .select("*")
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(fxRowToSale);
    },
  });
}

function invalidateFxSalesOnly(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: SALES_KEY });
}

function invalidateCashAndSales(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: SALES_KEY });
  qc.invalidateQueries({ queryKey: TX_KEY });
  qc.invalidateQueries({ queryKey: HISTORY_KEY });
  qc.invalidateQueries({ queryKey: ["fx-currency-holdings"] });
  qc.invalidateQueries({ queryKey: ["fx-risk-dashboard"] });
}

export { recomputeUsdSaleAllocations } from "@/lib/fx-allocation-persist";

/* ============== Mutations ============== */

export function useAddFxCurrency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { code: string; label: string; symbol?: string }) => {
      const code = input.code.trim().toUpperCase();
      const { data: maxRow } = await supabase
        .from("fx_currencies")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const sortOrder = (maxRow?.sort_order ?? 0) + 1;
      const { error } = await supabase.from("fx_currencies").insert({
        code,
        label: input.label.trim(),
        symbol: input.symbol?.trim() || null,
        sort_order: sortOrder,
      });
      if (error) throw error;
      await insertHistory({
        action: "add",
        summary: `FX продажи: добавлена валюта ${code} (${input.label.trim()})`,
      });
      return code;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CURRENCIES_KEY });
    },
  });
}

/** Новая продажа: касса + журнал fx_sales. */
export function useAddFxSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      occurredAt: string;
      currencyCode: string;
      foreignAmount: number;
      rate: number;
      note?: string;
    }) => {
      const id = crypto.randomUUID();
      let karyzAmount = 0;
      let salynghanAmount = 0;
      let allocWarning: string | undefined;

      if (input.currencyCode === "USD") {
        const alloc = await computeUsdAllocationForNewSale({
          foreignAmount: input.foreignAmount,
          rate: input.rate,
          occurredAt: input.occurredAt,
        });
        karyzAmount = alloc.karyzAmount;
        salynghanAmount = alloc.salynghanAmount;
        allocWarning = alloc.warning;
      }

      const tx: Transaction = {
        id,
        kind: "sell",
        ts: new Date(input.occurredAt).getTime(),
        currency: input.currencyCode as Currency,
        amount: input.foreignAmount,
        rate: input.rate,
        name: input.note?.trim() || undefined,
      };
      const { error } = await supabase.from("cash_transactions").insert({
        id,
        kind: "sell",
        currency: input.currencyCode,
        amount: input.foreignAmount,
        rate: input.rate,
        name: input.note?.trim() || null,
        ts: input.occurredAt,
        karyz_amount: karyzAmount,
        salynghan_amount: salynghanAmount,
      });
      if (error) throw error;

      await recordFxSale({
        cashTransactionId: id,
        occurredAt: input.occurredAt,
        currencyCode: input.currencyCode,
        foreignAmount: input.foreignAmount,
        rate: input.rate,
        note: input.note,
      });

      let summary = `Добавлено — ${txLabel(tx)}`;
      if (allocWarning) summary += ` · ${allocWarning}`;
      await insertHistory({ action: "add", kind: "sell", summary });
      return { warning: allocWarning };
    },
    onSuccess: async () => {
      await recomputeUsdSaleAllocations();
      invalidateCashAndSales(qc);
    },
  });
}

/** Редактирование только в журнале fx_sales (касса и контакты не трогаем). */
export function useUpdateFxSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string;
      old: FxSale;
      patch: {
        occurredAt?: string;
        currencyCode?: string;
        foreignAmount?: number;
        rate?: number;
        note?: string | null;
      };
    }) => {
      const { id, old, patch } = vars;
      const foreignAmount = patch.foreignAmount ?? old.foreignAmount;
      const rate = patch.rate ?? old.rate;
      const kztAmount = foreignAmount * rate;

      const dbPatch: TablesUpdate<"fx_sales"> = {
        kzt_amount: kztAmount,
        updated_at: new Date().toISOString(),
      };
      if (patch.occurredAt !== undefined) dbPatch.occurred_at = patch.occurredAt;
      if (patch.currencyCode !== undefined) dbPatch.currency_code = patch.currencyCode;
      if (patch.foreignAmount !== undefined) dbPatch.foreign_amount = patch.foreignAmount;
      if (patch.rate !== undefined) dbPatch.rate = patch.rate;
      if (patch.note !== undefined) dbPatch.note = patch.note;

      const { error } = await supabase.from("fx_sales").update(dbPatch).eq("id", id);
      if (error) throw error;

      await insertHistory({
        action: "edit",
        kind: "sell",
        summary: `FX журнал: изменена продажа ${old.currencyCode} ${fmt(foreignAmount)} × ${fmt(rate, 4)}`,
      });
    },
    onSuccess: () => {
      invalidateFxSalesOnly(qc);
    },
  });
}

/** Удаление только из журнала fx_sales. */
export function useDeleteFxSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (old: FxSale) => {
      const { error } = await supabase.from("fx_sales").delete().eq("id", old.id);
      if (error) throw error;
      await insertHistory({
        action: "delete",
        kind: "sell",
        summary: `FX журнал: удалена продажа ${saleLabel(old)}`,
      });
    },
    onSuccess: () => {
      invalidateFxSalesOnly(qc);
    },
  });
}

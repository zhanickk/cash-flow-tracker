import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { insertHistory } from "@/lib/cash-register";
import { getCachedCashierName } from "@/lib/auth";
import { fmt } from "@/lib/cash-shared";

export type FxCurrency = Tables<"fx_currencies">;
export type FxSaleRow = Tables<"fx_sales">;

export interface FxSale {
  id: string;
  occurredAt: number;
  currencyCode: string;
  foreignAmount: number;
  rate: number;
  kztAmount: number;
  note?: string;
  cashierName?: string;
}

export type PeriodPreset = "all" | "day" | "week" | "month" | "custom";

export interface FxSalesFilters {
  period: PeriodPreset;
  dateFrom: string;
  dateTo: string;
  currencies: string[];
  kztMin: string;
  kztMax: string;
  rateMin: string;
  rateMax: string;
}

export interface FxCurrencySummary {
  currencyCode: string;
  label: string;
  foreignTotal: number;
  kztTotal: number;
  avgRate: number;
  count: number;
}

export interface FxDaySummary {
  dateKey: string;
  label: string;
  kztTotal: number;
  count: number;
}

const SALES_KEY = ["fx-sales"];
const CURRENCIES_KEY = ["fx-currencies"];

function rowToSale(r: FxSaleRow): FxSale {
  return {
    id: r.id,
    occurredAt: new Date(r.occurred_at).getTime(),
    currencyCode: r.currency_code,
    foreignAmount: Number(r.foreign_amount),
    rate: Number(r.rate),
    kztAmount: Number(r.kzt_amount),
    note: r.note ?? undefined,
    cashierName: r.cashier_name ?? undefined,
  };
}

export function saleLabel(s: FxSale, currencyLabel?: string) {
  const cur = currencyLabel ?? s.currencyCode;
  return `${cur}: ${fmt(s.foreignAmount)} × ${fmt(s.rate, 4)} = ${fmt(s.kztAmount)} ₸`;
}

export function defaultFilters(): FxSalesFilters {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return {
    period: "month",
    dateFrom: toDateInput(start),
    dateTo: toDateInput(now),
    currencies: [],
    kztMin: "",
    kztMax: "",
    rateMin: "",
    rateMax: "",
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

function parseOptionalNumber(s: string): number | undefined {
  if (!s.trim()) return undefined;
  const cleaned = s.replace(/\s/g, "").replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? undefined : n;
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

  const kztMin = parseOptionalNumber(filters.kztMin);
  const kztMax = parseOptionalNumber(filters.kztMax);
  const rateMin = parseOptionalNumber(filters.rateMin);
  const rateMax = parseOptionalNumber(filters.rateMax);
  const currencySet =
    filters.currencies.length > 0 ? new Set(filters.currencies.map((c) => c.toUpperCase())) : null;

  return sales.filter((s) => {
    if (filters.period !== "all") {
      if (s.occurredAt < fromTs || s.occurredAt > toTs) return false;
    }
    if (currencySet && !currencySet.has(s.currencyCode)) return false;
    if (kztMin !== undefined && s.kztAmount < kztMin) return false;
    if (kztMax !== undefined && s.kztAmount > kztMax) return false;
    if (rateMin !== undefined && s.rate < rateMin) return false;
    if (rateMax !== undefined && s.rate > rateMax) return false;
    return true;
  });
}

export function aggregateByCurrency(
  sales: FxSale[],
  currencies: FxCurrency[],
): FxCurrencySummary[] {
  const labelByCode = new Map(currencies.map((c) => [c.code, c.label]));
  const map = new Map<string, { foreign: number; kzt: number; rateSum: number; count: number }>();

  for (const s of sales) {
    const prev = map.get(s.currencyCode) ?? { foreign: 0, kzt: 0, rateSum: 0, count: 0 };
    map.set(s.currencyCode, {
      foreign: prev.foreign + s.foreignAmount,
      kzt: prev.kzt + s.kztAmount,
      rateSum: prev.rateSum + s.rate,
      count: prev.count + 1,
    });
  }

  return [...map.entries()]
    .map(([currencyCode, v]) => ({
      currencyCode,
      label: labelByCode.get(currencyCode) ?? currencyCode,
      foreignTotal: v.foreign,
      kztTotal: v.kzt,
      avgRate: v.count > 0 ? v.rateSum / v.count : 0,
      count: v.count,
    }))
    .sort((a, b) => b.kztTotal - a.kztTotal);
}

export function aggregateByDay(sales: FxSale[]): FxDaySummary[] {
  const map = new Map<string, { kzt: number; count: number }>();
  for (const s of sales) {
    const d = new Date(s.occurredAt);
    const key = toDateInput(d);
    const prev = map.get(key) ?? { kzt: 0, count: 0 };
    map.set(key, { kzt: prev.kzt + s.kztAmount, count: prev.count + 1 });
  }
  return [...map.entries()]
    .map(([dateKey, v]) => ({
      dateKey,
      label: new Date(dateKey).toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
      }),
      kztTotal: v.kzt,
      count: v.count,
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
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
      return (data ?? []).map(rowToSale);
    },
  });
}

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
      const kztAmount = input.foreignAmount * input.rate;
      const { error } = await supabase.from("fx_sales").insert({
        occurred_at: input.occurredAt,
        currency_code: input.currencyCode,
        foreign_amount: input.foreignAmount,
        rate: input.rate,
        kzt_amount: kztAmount,
        note: input.note?.trim() || null,
        cashier_name: getCachedCashierName(),
      });
      if (error) throw error;
      await insertHistory({
        action: "add",
        kind: "sell",
        summary: `FX продажа: ${input.currencyCode} ${fmt(input.foreignAmount)} × ${fmt(input.rate, 4)} = ${fmt(kztAmount)} ₸`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SALES_KEY });
    },
  });
}

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
      const dbPatch: TablesUpdate<"fx_sales"> = {
        updated_at: new Date().toISOString(),
        kzt_amount: foreignAmount * rate,
      };
      if (patch.occurredAt !== undefined) dbPatch.occurred_at = patch.occurredAt;
      if (patch.currencyCode !== undefined) dbPatch.currency_code = patch.currencyCode;
      if (patch.foreignAmount !== undefined) dbPatch.foreign_amount = patch.foreignAmount;
      if (patch.rate !== undefined) dbPatch.rate = patch.rate;
      if (patch.note !== undefined) dbPatch.note = patch.note;

      const { error } = await supabase.from("fx_sales").update(dbPatch).eq("id", id);
      if (error) throw error;

      const cur = patch.currencyCode ?? old.currencyCode;
      await insertHistory({
        action: "edit",
        kind: "sell",
        summary: `FX продажа изменена: ${cur} ${fmt(foreignAmount)} × ${fmt(rate, 4)} = ${fmt(foreignAmount * rate)} ₸`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SALES_KEY });
    },
  });
}

export function useDeleteFxSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (old: FxSale) => {
      const { error } = await supabase.from("fx_sales").delete().eq("id", old.id);
      if (error) throw error;
      await insertHistory({
        action: "delete",
        kind: "sell",
        summary: `FX продажа удалена: ${saleLabel(old)}`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SALES_KEY });
    },
  });
}

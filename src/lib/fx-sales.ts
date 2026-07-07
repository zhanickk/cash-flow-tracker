import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { insertHistory } from "@/lib/cash-register";
import { fmt, txLabel, type Currency, type Transaction } from "@/lib/cash-shared";
import {
  aggregatePotFromContacts,
  allocationLabel,
  replayUsdSales,
  weightedAvgRate,
  type ContactTx,
} from "@/lib/fx-pots";
import {
  computeUsdAllocationForNewSale,
  recomputeUsdSaleAllocations,
} from "@/lib/fx-allocation-persist";
import { mappedToFxSaleFields } from "@/lib/fx-sale-map";

export type FxCurrency = Tables<"fx_currencies">;
type CashTxRow = Tables<"cash_transactions">;

export interface FxSale {
  id: string;
  occurredAt: number;
  currencyCode: string;
  foreignAmount: number;
  rate: number;
  kztAmount: number;
  note?: string;
  cashierName?: string;
  /** Доля продажи из Қарыз (USD, общий котёл) */
  karyzAmount?: number;
  /** Доля из Салынған */
  salynghanAmount?: number;
  allocationLabel?: string;
}

export type PeriodPreset = "all" | "day" | "week" | "month" | "custom";

export type SourceFilter = "all" | "karyz" | "salynghan" | "mixed";

export interface FxSalesFilters {
  period: PeriodPreset;
  dateFrom: string;
  dateTo: string;
  currencies: string[];
  kztMin: string;
  kztMax: string;
  rateMin: string;
  rateMax: string;
  source: SourceFilter;
  contactId: string;
}

export interface FxCurrencySummary {
  currencyCode: string;
  label: string;
  foreignTotal: number;
  kztTotal: number;
  avgRate: number;
  /** Средневзвешенный курс Σ(объём×курс)/Σ(объём) */
  weightedRate: number;
  /** Ручная корректировка (если задана) */
  effectiveRate: number;
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
const TX_KEY = ["cash-transactions"];
const HISTORY_KEY = ["cash-history"];

function cashTxToSale(r: CashTxRow): FxSale {
  return mappedToFxSaleFields(r) as FxSale;
}

export function cashRowsToSales(rows: CashTxRow[]): FxSale[] {
  return rows.map(cashTxToSale);
}

function saleToTransaction(s: FxSale): Transaction {
  return {
    id: s.id,
    kind: "sell",
    ts: s.occurredAt,
    currency: s.currencyCode as Currency,
    amount: s.foreignAmount,
    rate: s.rate,
    name: s.note,
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
    source: "all",
    contactId: "",
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
    if (filters.source !== "all" && s.currencyCode === "USD") {
      const k = s.karyzAmount ?? 0;
      const sh = s.salynghanAmount ?? 0;
      if (filters.source === "karyz" && !(k > 0 && sh === 0)) return false;
      if (filters.source === "salynghan" && !(sh > 0 && k === 0)) return false;
      if (filters.source === "mixed" && !(k > 0 && sh > 0)) return false;
    }
    if (filters.source !== "all" && s.currencyCode !== "USD") return false;
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
  rateOverrides?: Map<string, number>,
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
      const weightedRate = weightedAvgRate(list);
      const avgRate = list.length > 0 ? list.reduce((a, s) => a + s.rate, 0) / list.length : 0;
      const override = rateOverrides?.get(currencyCode);
      const effectiveRate = override ?? weightedRate;
      return {
        currencyCode,
        label: labelByCode.get(currencyCode) ?? currencyCode,
        foreignTotal,
        kztTotal,
        avgRate,
        weightedRate,
        effectiveRate,
        count: list.length,
      };
    })
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
        .from("cash_transactions")
        .select("*")
        .eq("kind", "sell")
        .order("ts", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(cashTxToSale);
    },
  });
}

export function useFxReportContacts() {
  return useQuery({
    queryKey: ["fx-report-contacts"],
    queryFn: async () => {
      const [{ data: contacts, error: cErr }, { data: txs, error: tErr }] = await Promise.all([
        supabase.from("contacts").select("*").order("name"),
        supabase.from("contact_transactions").select("*"),
      ]);
      if (cErr) throw cErr;
      if (tErr) throw tErr;
      return { contacts: contacts ?? [], txs: txs ?? [] };
    },
  });
}

function invalidateCashAndSales(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: SALES_KEY });
  qc.invalidateQueries({ queryKey: TX_KEY });
  qc.invalidateQueries({ queryKey: HISTORY_KEY });
  qc.invalidateQueries({ queryKey: ["fx-currency-holdings"] });
  qc.invalidateQueries({ queryKey: ["contacts-with-balances"] });
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
      const currency = (patch.currencyCode ?? old.currencyCode) as Currency;
      const dbPatch: TablesUpdate<"cash_transactions"> = {};
      if (patch.occurredAt !== undefined) dbPatch.ts = patch.occurredAt;
      if (patch.currencyCode !== undefined) dbPatch.currency = patch.currencyCode;
      if (patch.foreignAmount !== undefined) dbPatch.amount = patch.foreignAmount;
      if (patch.rate !== undefined) dbPatch.rate = patch.rate;
      if (patch.note !== undefined) dbPatch.name = patch.note;

      const { error } = await supabase.from("cash_transactions").update(dbPatch).eq("id", id);
      if (error) throw error;

      const next: Transaction = {
        id,
        kind: "sell",
        ts: patch.occurredAt ? new Date(patch.occurredAt).getTime() : old.occurredAt,
        currency,
        amount: foreignAmount,
        rate,
        name: patch.note === undefined ? old.note : patch.note ?? undefined,
      };
      const changes: string[] = [];
      if (patch.occurredAt !== undefined)
        changes.push(`дата: ${new Date(old.occurredAt).toLocaleString("ru-RU")} → ${new Date(patch.occurredAt).toLocaleString("ru-RU")}`);
      if (patch.currencyCode && patch.currencyCode !== old.currencyCode)
        changes.push(`валюта: ${old.currencyCode} → ${patch.currencyCode}`);
      if (patch.foreignAmount !== undefined && patch.foreignAmount !== old.foreignAmount)
        changes.push(`сумма: ${old.foreignAmount} → ${patch.foreignAmount}`);
      if (patch.rate !== undefined && patch.rate !== old.rate)
        changes.push(`курс: ${old.rate} → ${patch.rate}`);
      if (patch.note !== undefined && patch.note !== (old.note ?? null))
        changes.push(`примечание изменено`);

      await insertHistory({
        action: "edit",
        kind: "sell",
        summary: `Изменено — ${txLabel(next)} (${changes.join(", ") || "без изменений"})`,
      });
    },
    onSuccess: async () => {
      await recomputeUsdSaleAllocations();
      invalidateCashAndSales(qc);
    },
  });
}

export function useDeleteFxSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (old: FxSale) => {
      const { error } = await supabase.from("cash_transactions").delete().eq("id", old.id);
      if (error) throw error;
      await insertHistory({
        action: "delete",
        kind: "sell",
        summary: `Удалено — ${txLabel(saleToTransaction(old))}`,
      });
    },
    onSuccess: async () => {
      await recomputeUsdSaleAllocations();
      invalidateCashAndSales(qc);
    },
  });
}

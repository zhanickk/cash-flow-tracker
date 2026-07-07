import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { insertHistory } from "@/lib/cash-register";
import { fmt, FX_CURRENCIES } from "@/lib/cash-shared";
import type { FxSale } from "@/lib/fx-sales";

export type FxCurrencyHoldingRow = Tables<"fx_currency_holdings">;

export interface CurrencyHoldingCard {
  id: string | null;
  currencyCode: string;
  label: string;
  symbol: string | null;
  totalReceived: number;
  debtAmount: number;
  /** Продано (из кассы, все операции sell) */
  soldForeign: number;
  /** Остаток = получено − долг − продано */
  balance: number;
  /** Сумма всех продаж в тенге (все время) */
  soldKztTotal: number;
  note?: string;
  sales: FxSale[];
}

export const HOLDINGS_KEY = ["fx-currency-holdings"];

function soldTotalsForCurrency(sales: FxSale[], code: string) {
  const list = sales.filter((s) => s.currencyCode === code);
  let soldForeign = 0;
  let soldKztTotal = 0;
  for (const s of list) {
    soldForeign += s.foreignAmount;
    soldKztTotal += s.kztAmount;
  }
  return { soldForeign, soldKztTotal, sales: list };
}

export function buildHoldingCards(
  currencies: Tables<"fx_currencies">[],
  holdings: FxCurrencyHoldingRow[],
  sales: FxSale[],
): CurrencyHoldingCard[] {
  const holdingByCode = new Map(holdings.map((h) => [h.currency_code, h]));
  const codes = new Set<string>();
  for (const c of currencies) codes.add(c.code);
  for (const h of holdings) codes.add(h.currency_code);
  for (const s of sales) codes.add(s.currencyCode);

  const meta = new Map(currencies.map((c) => [c.code, c]));
  for (const c of FX_CURRENCIES) {
    if (!meta.has(c.code)) {
      meta.set(c.code, {
        code: c.code,
        label: c.label,
        symbol: c.symbol,
        sort_order: 0,
        is_active: true,
        created_at: "",
      } as Tables<"fx_currencies">);
    }
  }

  return [...codes]
    .map((code) => {
      const m = meta.get(code);
      const h = holdingByCode.get(code);
      const { soldForeign, soldKztTotal, sales: curSales } = soldTotalsForCurrency(sales, code);
      const totalReceived = Number(h?.total_received ?? 0);
      const debtAmount = Number(h?.debt_amount ?? 0);
      return {
        id: h?.id ?? null,
        currencyCode: code,
        label: m?.label ?? code,
        symbol: m?.symbol ?? null,
        totalReceived,
        debtAmount,
        soldForeign,
        balance: totalReceived - debtAmount - soldForeign,
        soldKztTotal,
        note: h?.note ?? undefined,
        sales: [...curSales].sort((a, b) => b.occurredAt - a.occurredAt),
      };
    })
    .filter(
      (c) =>
        c.totalReceived > 0 ||
        c.debtAmount > 0 ||
        c.soldForeign > 0 ||
        c.id !== null,
    )
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

/** Сводка «Держим в тенге» за период (из отфильтрованных продаж). */
export function heldInKztSummary(
  sales: FxSale[],
  currencies: Tables<"fx_currencies">[],
): { currencyCode: string; label: string; foreignTotal: number; kztTotal: number; count: number }[] {
  const labels = new Map(currencies.map((c) => [c.code, c.label]));
  const map = new Map<string, { foreign: number; kzt: number; count: number }>();
  for (const s of sales) {
    const prev = map.get(s.currencyCode) ?? { foreign: 0, kzt: 0, count: 0 };
    map.set(s.currencyCode, {
      foreign: prev.foreign + s.foreignAmount,
      kzt: prev.kzt + s.kztAmount,
      count: prev.count + 1,
    });
  }
  return [...map.entries()]
    .map(([currencyCode, v]) => ({
      currencyCode,
      label: labels.get(currencyCode) ?? currencyCode,
      foreignTotal: v.foreign,
      kztTotal: v.kzt,
      count: v.count,
    }))
    .sort((a, b) => b.kztTotal - a.kztTotal);
}

export function useCurrencyHoldings() {
  return useQuery({
    queryKey: HOLDINGS_KEY,
    queryFn: async () => {
      const [
        { data: currencies, error: cErr },
        { data: holdings, error: hErr },
        { data: cashRows, error: tErr },
      ] = await Promise.all([
        supabase.from("fx_currencies").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("fx_currency_holdings").select("*"),
        supabase.from("cash_transactions").select("*").eq("kind", "sell").order("ts", { ascending: false }),
      ]);
      if (cErr) throw cErr;
      if (hErr) throw hErr;
      if (tErr) throw tErr;

      const sales: FxSale[] = (cashRows ?? []).map((r) => {
        const foreignAmount = Number(r.amount);
        const rate = Number(r.rate ?? 0);
        return {
          id: r.id,
          occurredAt: new Date(r.ts).getTime(),
          currencyCode: r.currency,
          foreignAmount,
          rate,
          kztAmount: foreignAmount * rate,
          note: r.name ?? undefined,
        };
      });

      return {
        cards: buildHoldingCards(currencies ?? [], holdings ?? [], sales),
        allSales: sales,
        currencies: currencies ?? [],
      };
    },
  });
}

export function useSaveCurrencyHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      currencyCode: string;
      totalReceived: number;
      debtAmount: number;
      note?: string;
    }) => {
      const payload = {
        currency_code: input.currencyCode,
        total_received: input.totalReceived,
        debt_amount: input.debtAmount,
        note: input.note?.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase
        .from("fx_currency_holdings")
        .select("id")
        .eq("currency_code", input.currencyCode)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("fx_currency_holdings")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fx_currency_holdings").insert(payload);
        if (error) throw error;
      }

      await insertHistory({
        action: "edit",
        summary: `Баланс ${input.currencyCode}: получено ${fmt(input.totalReceived)}, долг ${fmt(input.debtAmount)}`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HOLDINGS_KEY });
    },
  });
}

export function useDeleteCurrencyHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; currencyCode: string }) => {
      const { error } = await supabase.from("fx_currency_holdings").delete().eq("id", input.id);
      if (error) throw error;
      await insertHistory({
        action: "delete",
        summary: `Удалена карточка баланса ${input.currencyCode}`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HOLDINGS_KEY });
    },
  });
}

export function balanceTone(value: number) {
  if (value > 0) return "text-success";
  if (value < 0) return "text-danger";
  return "text-muted-foreground";
}

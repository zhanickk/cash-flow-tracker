import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { FX_CURRENCIES } from "@/lib/cash-shared";
import type { FxSale } from "@/lib/fx-sales";
import {
  aggregatePotFromContacts,
  currenciesWithContactOps,
  replayUsdSales,
  simpleCurrencyBalance,
  type ContactTx,
} from "@/lib/fx-pots";
import { cashRowsToSales } from "@/lib/fx-sales";

export interface CurrencyHoldingCard {
  currencyCode: string;
  label: string;
  symbol: string | null;
  /** Всего Қарыз (клиенты должны нам) — из контактов */
  totalKaryz: number;
  /** Всего Салынған (мы должны клиентам) — из контактов */
  totalSalynghan: number;
  soldForeign: number;
  soldFromKaryz: number;
  soldFromSalynghan: number;
  /** Остаток Қарыз после продаж (USD: отдельно; прочие: N/A как 0) */
  karyzRemainder: number;
  /** Остаток Салынған после продаж */
  salynghanRemainder: number;
  /** Для не-USD: общий остаток */
  balance: number;
  soldKztTotal: number;
  /** Тенге «заморожено» из продаж Салынған (USD) */
  salynghanKztTotal: number;
  sales: FxSale[];
  isUsd: boolean;
}

export const HOLDINGS_KEY = ["fx-currency-holdings"];

function soldTotalsForCurrency(sales: FxSale[], code: string) {
  const list = sales.filter((s) => s.currencyCode === code);
  let soldForeign = 0;
  let soldKztTotal = 0;
  let soldFromKaryz = 0;
  let soldFromSalynghan = 0;
  let salynghanKztTotal = 0;
  for (const s of list) {
    soldForeign += s.foreignAmount;
    soldKztTotal += s.kztAmount;
    soldFromKaryz += s.karyzAmount ?? 0;
    soldFromSalynghan += s.salynghanAmount ?? 0;
    salynghanKztTotal += (s.salynghanAmount ?? 0) * s.rate;
  }
  return {
    soldForeign,
    soldKztTotal,
    soldFromKaryz,
    soldFromSalynghan,
    salynghanKztTotal,
    sales: list,
  };
}

export function buildHoldingCards(
  currencies: Tables<"fx_currencies">[],
  contactTxs: ContactTx[],
  sales: FxSale[],
): CurrencyHoldingCard[] {
  const usdReplay = replayUsdSales(contactTxs, sales);

  const codes = new Set<string>();
  for (const c of currencies) codes.add(c.code);
  for (const c of currenciesWithContactOps(contactTxs)) codes.add(c);
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
      const pot = aggregatePotFromContacts(contactTxs, code);
      const sold = soldTotalsForCurrency(sales, code);
      const isUsd = code === "USD";

      let karyzRemainder = pot.totalKaryz - sold.soldFromKaryz;
      let salynghanRemainder = pot.totalSalynghan - sold.soldFromSalynghan;
      if (isUsd) {
        karyzRemainder = usdReplay.karyzRemainder;
        salynghanRemainder = usdReplay.salynghanRemainder;
      }

      const balance = isUsd
        ? karyzRemainder + salynghanRemainder
        : simpleCurrencyBalance(pot, sold.soldForeign);

      return {
        currencyCode: code,
        label: m?.label ?? code,
        symbol: m?.symbol ?? null,
        totalKaryz: pot.totalKaryz,
        totalSalynghan: pot.totalSalynghan,
        soldForeign: sold.soldForeign,
        soldFromKaryz: sold.soldFromKaryz,
        soldFromSalynghan: sold.soldFromSalynghan,
        karyzRemainder,
        salynghanRemainder,
        balance,
        soldKztTotal: sold.soldKztTotal,
        salynghanKztTotal: sold.salynghanKztTotal,
        sales: [...sold.sales].sort((a, b) => b.occurredAt - a.occurredAt),
        isUsd,
      };
    })
    .filter(
      (c) =>
        c.currencyCode === "USD" &&
        (c.totalKaryz > 0 || c.totalSalynghan > 0 || c.soldForeign > 0),
    )
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

/** «Держим в тенге» — только продажи из Салынған (по ТЗ). */
export function heldInKztSummary(
  sales: FxSale[],
  currencies: Tables<"fx_currencies">[],
): { currencyCode: string; label: string; foreignTotal: number; kztTotal: number; count: number }[] {
  const labels = new Map(currencies.map((c) => [c.code, c.label]));
  const map = new Map<string, { foreign: number; kzt: number; count: number }>();
  for (const s of sales) {
    const sal = s.salynghanAmount ?? (s.currencyCode === "USD" ? 0 : s.foreignAmount);
    if (sal <= 0) continue;
    const kzt = sal * s.rate;
    const prev = map.get(s.currencyCode) ?? { foreign: 0, kzt: 0, count: 0 };
    map.set(s.currencyCode, {
      foreign: prev.foreign + sal,
      kzt: prev.kzt + kzt,
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
        { data: contactTxs, error: ctErr },
        { data: cashRows, error: tErr },
      ] = await Promise.all([
        supabase.from("fx_currencies").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("contact_transactions").select("*"),
        supabase.from("cash_transactions").select("*").eq("kind", "sell").order("ts", { ascending: false }),
      ]);
      if (cErr) throw cErr;
      if (ctErr) throw ctErr;
      if (tErr) throw tErr;

      const sales = cashRowsToSales(cashRows ?? []);

      return {
        cards: buildHoldingCards(currencies ?? [], (contactTxs ?? []) as ContactTx[], sales),
        allSales: sales,
        contactTxs: (contactTxs ?? []) as ContactTx[],
        currencies: currencies ?? [],
        usdReplay: replayUsdSales((contactTxs ?? []) as ContactTx[], sales),
      };
    },
  });
}

export function balanceTone(value: number) {
  if (value > 0) return "text-success";
  if (value < 0) return "text-danger";
  return "text-muted-foreground";
}

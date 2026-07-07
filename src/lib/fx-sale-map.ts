import type { Tables } from "@/integrations/supabase/types";
import { allocationLabel } from "@/lib/fx-pots";

export interface MappedFxSale {
  id: string;
  occurredAt: number;
  currencyCode: string;
  foreignAmount: number;
  rate: number;
  kztAmount: number;
  karyzAmount: number;
  salynghanAmount: number;
}

type CashTxRow = Tables<"cash_transactions">;

export function cashRowToMappedSale(r: CashTxRow): MappedFxSale {
  const foreignAmount = Number(r.amount);
  const rate = Number(r.rate ?? 0);
  const karyzAmount = Number(r.karyz_amount ?? 0);
  const salynghanAmount = Number(r.salynghan_amount ?? 0);
  return {
    id: r.id,
    occurredAt: new Date(r.ts).getTime(),
    currencyCode: r.currency,
    foreignAmount,
    rate,
    kztAmount: foreignAmount * rate,
    karyzAmount,
    salynghanAmount,
  };
}

export function cashRowsToMappedSales(rows: CashTxRow[]): MappedFxSale[] {
  return rows.map(cashRowToMappedSale);
}

export function mappedToFxSaleFields(r: CashTxRow) {
  const s = cashRowToMappedSale(r);
  return {
    ...s,
    note: r.name ?? undefined,
    allocationLabel:
      r.currency === "USD"
        ? allocationLabel(s.karyzAmount, s.salynghanAmount, r.currency)
        : undefined,
  };
}

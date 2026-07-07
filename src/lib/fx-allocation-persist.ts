import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/cash-shared";
import { cashRowsToMappedSales } from "@/lib/fx-sale-map";
import {
  allocateUsdSale,
  replayUsdSales,
  type ContactTx,
} from "@/lib/fx-pots";

/** Пересчитать и сохранить karyz/salynghan_amount для всех USD-продаж. */
export async function recomputeUsdSaleAllocations(): Promise<void> {
  const [{ data: contactTxs }, { data: cashRows }] = await Promise.all([
    supabase.from("contact_transactions").select("*"),
    supabase.from("cash_transactions").select("*").eq("kind", "sell").eq("currency", "USD").order("ts"),
  ]);
  const sales = cashRowsToMappedSales(cashRows ?? []);
  const { enriched } = replayUsdSales((contactTxs ?? []) as ContactTx[], sales);
  await Promise.all(
    enriched.map((s) =>
      supabase
        .from("cash_transactions")
        .update({
          karyz_amount: s.karyzAmount,
          salynghan_amount: s.salynghanAmount,
        })
        .eq("id", s.id),
    ),
  );
}

export async function computeUsdAllocationForNewSale(input: {
  foreignAmount: number;
  rate: number;
  occurredAt: string;
}): Promise<{ karyzAmount: number; salynghanAmount: number; warning?: string }> {
  const [{ data: contactTxs }, { data: cashRows }] = await Promise.all([
    supabase.from("contact_transactions").select("*"),
    supabase
      .from("cash_transactions")
      .select("*")
      .eq("kind", "sell")
      .eq("currency", "USD")
      .lt("ts", input.occurredAt)
      .order("ts"),
  ]);
  const priorSales = cashRowsToMappedSales(cashRows ?? []);
  const { karyzRemainder, salynghanRemainder } = replayUsdSales(
    (contactTxs ?? []) as ContactTx[],
    priorSales,
  );
  const alloc = allocateUsdSale(
    input.foreignAmount,
    karyzRemainder,
    salynghanRemainder,
    input.rate,
  );
  let warning: string | undefined;
  if (alloc.salynghanAmount > 0) {
    warning = `Продано ${fmt(alloc.salynghanAmount)} USD из средств клиентов (Салынған), курс ${fmt(input.rate, 4)}, сумма в тенге ${fmt(alloc.salynghanKzt)} ₸`;
  }
  if (alloc.karyzRemainderAfter < 0 || alloc.salynghanRemainderAfter < 0) {
    warning = (warning ? warning + ". " : "") + "Внимание: остаток котла ушёл в минус.";
  }
  return {
    karyzAmount: alloc.karyzAmount,
    salynghanAmount: alloc.salynghanAmount,
    warning,
  };
}

export async function allocationForSellInsert(input: {
  kind: string;
  currency: string;
  foreignAmount: number;
  rate: number;
  occurredAt: string;
}): Promise<{ karyzAmount: number; salynghanAmount: number; warning?: string }> {
  if (input.kind !== "sell" || input.currency !== "USD") {
    return { karyzAmount: 0, salynghanAmount: 0 };
  }
  return computeUsdAllocationForNewSale({
    foreignAmount: input.foreignAmount,
    rate: input.rate,
    occurredAt: input.occurredAt,
  });
}

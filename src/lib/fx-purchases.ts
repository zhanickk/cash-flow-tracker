import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { getCachedCashierName } from "@/lib/auth";
import { fetchAllRows } from "@/lib/supabase-paginate";

type FxPurchaseRow = Tables<"fx_purchases">;

export interface FxPurchase {
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
}

const PURCHASES_KEY = ["fx-purchases"];

function fxRowToPurchase(r: FxPurchaseRow): FxPurchase {
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

/** Запись в журнал fx_purchases (не удаляется при новом дне кассы) — зеркало recordFxSale. */
export async function recordFxPurchase(input: {
  cashTransactionId?: string | null;
  occurredAt: string;
  currencyCode: string;
  foreignAmount: number;
  rate: number;
  note?: string | null;
}): Promise<string> {
  const kztAmount = input.foreignAmount * input.rate;
  const { data, error } = await supabase
    .from("fx_purchases")
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

/** Синхронизация покупки из кассы → журнал fx_purchases (создание). */
export async function syncFxPurchaseFromCashTx(tx: {
  id: string;
  kind: string;
  currency: string;
  amount: number;
  rate?: number | null;
  name?: string | null;
  ts: string | number;
}) {
  if (tx.kind !== "buy") return;
  const { data: existing } = await supabase
    .from("fx_purchases")
    .select("id")
    .eq("cash_transaction_id", tx.id)
    .maybeSingle();
  if (existing) return;

  const rate = Number(tx.rate ?? 0);
  if (rate <= 0) return;

  await recordFxPurchase({
    cashTransactionId: tx.id,
    occurredAt: typeof tx.ts === "number" ? new Date(tx.ts).toISOString() : tx.ts,
    currencyCode: tx.currency,
    foreignAmount: Number(tx.amount),
    rate,
    note: tx.name,
  });
}

/** Обновление записи журнала по операции кассы. */
export async function syncFxPurchaseUpdateFromCashTx(
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
  if (merged.kind !== "buy") {
    await syncFxPurchaseDeleteFromCashTx(cashTxId);
    return;
  }

  const rate = Number(merged.rate ?? 0);
  const { data: existing } = await supabase
    .from("fx_purchases")
    .select("id")
    .eq("cash_transaction_id", cashTxId)
    .maybeSingle();

  if (rate <= 0) {
    if (existing) {
      const { error } = await supabase.from("fx_purchases").delete().eq("id", existing.id);
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
    const patch: TablesUpdate<"fx_purchases"> = {
      currency_code: merged.currency,
      foreign_amount: foreignAmount,
      rate,
      kzt_amount: kztAmount,
      note: merged.name?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (occurredAt) patch.occurred_at = occurredAt;
    const { error } = await supabase.from("fx_purchases").update(patch).eq("id", existing.id);
    if (error) throw error;
    return;
  }

  await recordFxPurchase({
    cashTransactionId: cashTxId,
    occurredAt: occurredAt ?? new Date().toISOString(),
    currencyCode: merged.currency,
    foreignAmount,
    rate,
    note: merged.name,
  });
}

/** Удаление записи журнала, связанной с операцией кассы. */
export async function syncFxPurchaseDeleteFromCashTx(cashTxId: string) {
  const { error } = await supabase.from("fx_purchases").delete().eq("cash_transaction_id", cashTxId);
  if (error) throw error;
}

export function useFxPurchases() {
  return useQuery({
    queryKey: PURCHASES_KEY,
    queryFn: async (): Promise<FxPurchase[]> => {
      const rows = await fetchAllRows<FxPurchaseRow>((from, to) =>
        supabase
          .from("fx_purchases")
          .select("*")
          .order("occurred_at", { ascending: false })
          .range(from, to),
      );
      return rows.map(fxRowToPurchase);
    },
  });
}

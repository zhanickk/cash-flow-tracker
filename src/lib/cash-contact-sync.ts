import { supabase } from "@/integrations/supabase/client";
import type { Currency, Transaction } from "@/lib/cash-shared";

export const CASH_INCOME_NOTE = "Касса: приход";
export const CASH_EXPENSE_NOTE = "Касса: расход";

export function isCashContactLinkedTx(
  tx: Pick<Transaction, "kind" | "expenseType" | "name">,
): boolean {
  if (!tx.name?.trim()) return false;
  if (tx.kind === "income" && tx.expenseType !== "regular") return true;
  if (tx.kind === "expense" && tx.expenseType === "person") return true;
  return false;
}

export function cashContactNote(tx: Pick<Transaction, "kind" | "expenseType">): string | null {
  if (tx.kind === "income" && tx.expenseType !== "regular") return CASH_INCOME_NOTE;
  if (tx.kind === "expense" && tx.expenseType === "person") return CASH_EXPENSE_NOTE;
  return null;
}

export function cashTxSignedAmount(kind: Transaction["kind"], amount: number): number {
  return kind === "income" ? amount : -amount;
}

/** Найти contact_transactions без связи contact_tx_id (старые или сбой при создании). */
export async function findOrphanedContactTxId(
  cashTx: Transaction,
  contactId: string,
): Promise<string | null> {
  const note = cashContactNote(cashTx);
  if (!note) return null;

  const signedAmount = cashTxSignedAmount(cashTx.kind, cashTx.amount);
  const windowStart = new Date(cashTx.ts - 5 * 60 * 1000).toISOString();
  const windowEnd = new Date(cashTx.ts + 5 * 60 * 1000).toISOString();

  async function pickUnlinked(candidates: { id: string }[] | null): Promise<string | null> {
    if (!candidates?.length) return null;
    for (const row of candidates) {
      const { data: linked, error } = await supabase
        .from("cash_transactions")
        .select("id")
        .eq("contact_tx_id", row.id)
        .neq("id", cashTx.id)
        .limit(1);
      if (error) throw error;
      if (!linked?.length) return row.id;
    }
    return null;
  }

  const { data, error } = await supabase
    .from("contact_transactions")
    .select("id")
    .eq("contact_id", contactId)
    .eq("note", note)
    .eq("currency", cashTx.currency)
    .eq("amount", signedAmount)
    .gte("occurred_at", windowStart)
    .lte("occurred_at", windowEnd)
    .order("occurred_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  const match = await pickUnlinked(data);
  if (match) return match;

  const { data: fallback, error: fbErr } = await supabase
    .from("contact_transactions")
    .select("id")
    .eq("contact_id", contactId)
    .eq("note", note)
    .eq("currency", cashTx.currency)
    .eq("amount", signedAmount)
    .is("conversion_id", null)
    .order("occurred_at", { ascending: false })
    .limit(5);
  if (fbErr) throw fbErr;
  return pickUnlinked(fallback);
}

export async function resolveContactTxId(
  cashTx: Transaction,
  contactId: string,
): Promise<string | null> {
  if (cashTx.contactTxId) return cashTx.contactTxId;
  return findOrphanedContactTxId(cashTx, contactId);
}

export function contactSyncPayload(
  cashTx: Transaction,
  patch: Partial<Transaction>,
): { amount: number; currency: Currency } {
  return {
    amount: cashTxSignedAmount(cashTx.kind, patch.amount ?? cashTx.amount),
    currency: (patch.currency ?? cashTx.currency) as Currency,
  };
}

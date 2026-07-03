import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { type Transaction, type HistoryEntry, txLabel } from "@/lib/cash-shared";

export type CashTxRow = Tables<"cash_transactions">;
export type CashHistoryRow = Tables<"cash_register_history">;

const TX_KEY = ["cash-transactions"];
const HISTORY_KEY = ["cash-history"];

function rowToTx(r: CashTxRow): Transaction {
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
  };
}

/* ============== Reads ============== */

export function useCashTransactions() {
  return useQuery({
    queryKey: TX_KEY,
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase
        .from("cash_transactions")
        .select("*")
        .order("ts", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(rowToTx);
    },
  });
}

export function useCashHistory() {
  return useQuery({
    queryKey: HISTORY_KEY,
    queryFn: async (): Promise<HistoryEntry[]> => {
      const { data, error } = await supabase
        .from("cash_register_history")
        .select("*")
        .order("ts", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(rowToHistory);
    },
  });
}

/* ============== History logging (internal) ============== */

async function insertHistory(entry: Omit<HistoryEntry, "id" | "ts">) {
  const { error } = await supabase.from("cash_register_history").insert({
    action: entry.action,
    kind: entry.kind ?? null,
    summary: entry.summary,
  });
  if (error) throw error;
}

/* ============== Mutations ============== */

export function useAddCashTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tx: Transaction) => {
      const { error } = await supabase.from("cash_transactions").insert({
        id: tx.id,
        kind: tx.kind,
        currency: tx.currency,
        amount: tx.amount,
        name: tx.name ?? null,
        rate: tx.rate ?? null,
        expense_type: tx.expenseType ?? null,
        contact_tx_id: tx.contactTxId ?? null,
      });
      if (error) throw error;
      await insertHistory({ action: "add", kind: tx.kind, summary: `Добавлено — ${txLabel(tx)}` });
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
    onSettled: () => {
      qc.invalidateQueries({ queryKey: TX_KEY });
      qc.invalidateQueries({ queryKey: HISTORY_KEY });
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
    onSettled: () => {
      qc.invalidateQueries({ queryKey: TX_KEY });
      qc.invalidateQueries({ queryKey: HISTORY_KEY });
    },
  });
}

export function useDeleteCashTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (old: Transaction) => {
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
    onSettled: () => {
      qc.invalidateQueries({ queryKey: TX_KEY });
      qc.invalidateQueries({ queryKey: HISTORY_KEY });
    },
  });
}

export function useResetCashRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("cash_transactions")
        .delete()
        .not("id", "is", null);
      if (error) throw error;
      await insertHistory({ action: "reset", summary: "КАССА ПЕРЕЗАПУЩЕНА — все операции очищены" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TX_KEY });
      qc.invalidateQueries({ queryKey: HISTORY_KEY });
    },
  });
}

export function useNewDayCashRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (openings: Transaction[]) => {
      const { error: delErr } = await supabase
        .from("cash_transactions")
        .delete()
        .not("id", "is", null);
      if (delErr) throw delErr;
      if (openings.length > 0) {
        const { error: insErr } = await supabase.from("cash_transactions").insert(
          openings.map((o) => ({
            id: o.id,
            kind: o.kind,
            currency: o.currency,
            amount: o.amount,
            name: o.name ?? null,
          })),
        );
        if (insErr) throw insErr;
      }
      await insertHistory({
        action: "reset",
        summary: `НОВЫЙ ДЕНЬ — остатки перенесены (${openings.length} валют)`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TX_KEY });
      qc.invalidateQueries({ queryKey: HISTORY_KEY });
    },
  });
}

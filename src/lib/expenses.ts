import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { getCachedCashierName } from "@/lib/auth";
import { fetchAllRows } from "@/lib/supabase-paginate";

type ExpenseRow = Tables<"expenses">;

/** Фиксированный список категорий невозвратных расходов (еда, зарплаты,
 * конкретные люди типа «ага»/«апше», которым отдают деньги без ожидания
 * возврата). «other» — свободный текст в note, когда ни одна категория
 * не подходит. */
export const EXPENSE_CATEGORIES = [
  { code: "tamak", label: "Тамак" },
  { code: "aylyk", label: "Айлык" },
  { code: "aga", label: "Ага" },
  { code: "apshe", label: "Апше" },
  { code: "other", label: "Прочее" },
] as const;

export type ExpenseCategoryCode = (typeof EXPENSE_CATEGORIES)[number]["code"];

const CATEGORY_LABEL_BY_CODE = new Map<string, string>(
  EXPENSE_CATEGORIES.map((c) => [c.code, c.label]),
);
const CATEGORY_CODE_BY_LABEL = new Map<string, string>(
  EXPENSE_CATEGORIES.filter((c) => c.code !== "other").map((c) => [c.label, c.code]),
);

export function expenseCategoryLabel(code: string): string {
  return CATEGORY_LABEL_BY_CODE.get(code) ?? code;
}

export interface Expense {
  id: string;
  occurredAt: number;
  category: string;
  categoryLabel: string;
  note?: string;
  amountKzt: number;
  cashierName?: string;
  cashTransactionId?: string | null;
}

const EXPENSES_KEY = ["expenses"];

function rowToExpense(r: ExpenseRow): Expense {
  return {
    id: r.id,
    occurredAt: new Date(r.occurred_at).getTime(),
    category: r.category,
    categoryLabel: expenseCategoryLabel(r.category),
    note: r.note ?? undefined,
    amountKzt: Number(r.amount_kzt),
    cashierName: r.cashier_name ?? undefined,
    cashTransactionId: r.cash_transaction_id,
  };
}

/** Запись в журнал expenses (не удаляется при новом дне кассы) — зеркало recordFxPurchase. */
export async function recordExpense(input: {
  cashTransactionId?: string | null;
  occurredAt: string;
  category: string;
  note?: string | null;
  amountKzt: number;
}): Promise<string> {
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      cash_transaction_id: input.cashTransactionId ?? null,
      category: input.category,
      note: input.note?.trim() || null,
      amount_kzt: input.amountKzt,
      occurred_at: input.occurredAt,
      cashier_name: getCachedCashierName(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** По свободному тексту из карточки «Расходы» (freeMode) определяет
 * категорию: если текст совпадает с одной из фиксированных меток —
 * берём её код, иначе это «Прочее» с этим текстом в note. */
function resolveCategory(name: string | null | undefined): { category: string; note: string | null } {
  const trimmed = (name ?? "").trim();
  const code = CATEGORY_CODE_BY_LABEL.get(trimmed);
  if (code) return { category: code, note: null };
  return { category: "other", note: trimmed || null };
}

/** Транзакция кассы считается невозвратным расходом, если это «Расход»
 * без привязки к контакту (freeMode) и в тенге — деньги, потраченные в
 * другой валюте, в тенговый расчёт прибыли пока не включаем. */
function isTrackedExpenseTx(tx: { kind: string; expenseType?: string | null; currency: string }) {
  return tx.kind === "expense" && tx.expenseType === "regular" && tx.currency === "KZT";
}

/** Синхронизация расхода из кассы → журнал expenses (создание). */
export async function syncExpenseFromCashTx(tx: {
  id: string;
  kind: string;
  expenseType?: string | null;
  currency: string;
  amount: number;
  name?: string | null;
  ts: string | number;
}) {
  if (!isTrackedExpenseTx(tx)) return;
  const { data: existing } = await supabase
    .from("expenses")
    .select("id")
    .eq("cash_transaction_id", tx.id)
    .maybeSingle();
  if (existing) return;

  const { category, note } = resolveCategory(tx.name);
  await recordExpense({
    cashTransactionId: tx.id,
    occurredAt: typeof tx.ts === "number" ? new Date(tx.ts).toISOString() : tx.ts,
    category,
    note,
    amountKzt: Number(tx.amount),
  });
}

/** Обновление записи журнала по операции кассы. */
export async function syncExpenseUpdateFromCashTx(
  cashTxId: string,
  merged: {
    kind: string;
    expenseType?: string | null;
    currency: string;
    amount: number;
    name?: string | null;
    ts?: string | number;
  },
) {
  const { data: existing } = await supabase
    .from("expenses")
    .select("id")
    .eq("cash_transaction_id", cashTxId)
    .maybeSingle();

  if (!isTrackedExpenseTx(merged)) {
    if (existing) {
      const { error } = await supabase.from("expenses").delete().eq("id", existing.id);
      if (error) throw error;
    }
    return;
  }

  const { category, note } = resolveCategory(merged.name);
  const occurredAt =
    merged.ts !== undefined
      ? typeof merged.ts === "number"
        ? new Date(merged.ts).toISOString()
        : merged.ts
      : undefined;

  if (existing) {
    const patch: TablesUpdate<"expenses"> = {
      category,
      note,
      amount_kzt: Number(merged.amount),
      updated_at: new Date().toISOString(),
    };
    if (occurredAt) patch.occurred_at = occurredAt;
    const { error } = await supabase.from("expenses").update(patch).eq("id", existing.id);
    if (error) throw error;
    return;
  }

  await recordExpense({
    cashTransactionId: cashTxId,
    occurredAt: occurredAt ?? new Date().toISOString(),
    category,
    note,
    amountKzt: Number(merged.amount),
  });
}

/** Удаление записи журнала, связанной с операцией кассы. */
export async function syncExpenseDeleteFromCashTx(cashTxId: string) {
  const { error } = await supabase.from("expenses").delete().eq("cash_transaction_id", cashTxId);
  if (error) throw error;
}

export function useExpenses() {
  return useQuery({
    queryKey: EXPENSES_KEY,
    queryFn: async (): Promise<Expense[]> => {
      const rows = await fetchAllRows<ExpenseRow>((from, to) =>
        supabase
          .from("expenses")
          .select("*")
          .order("occurred_at", { ascending: false })
          .range(from, to),
      );
      return rows.map(rowToExpense);
    },
  });
}

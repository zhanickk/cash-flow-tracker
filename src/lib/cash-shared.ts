/** Shared types & helpers for the cash register, used both by the UI route
 * and by the Supabase-backed data layer (cash-register.ts). */

export type Currency = "USD" | "EUR" | "RUB" | "KGS" | "CNY" | "GOLD" | "KZT";

export const CURRENCIES: { code: Currency; label: string; short: string; symbol: string }[] = [
  { code: "USD", label: "Доллар (USD)", short: "USD", symbol: "$" },
  { code: "EUR", label: "Евро (EUR)", short: "EUR", symbol: "€" },
  { code: "RUB", label: "Рубль (RUB)", short: "RUB", symbol: "₽" },
  { code: "KGS", label: "Сом (KGS)", short: "KGS", symbol: "с" },
  { code: "CNY", label: "Юань (CNY)", short: "CNY", symbol: "¥" },
  { code: "GOLD", label: "Золото (гр)", short: "Gold", symbol: "Au" },
  { code: "KZT", label: "Тенге (KZT)", short: "KZT", symbol: "₸" },
];

export const FX_CURRENCIES = CURRENCIES.filter((c) => c.code !== "KZT");

export type TxKind = "opening" | "buy" | "sell" | "income" | "expense";

export interface Transaction {
  id: string;
  kind: TxKind;
  ts: number;
  name?: string;
  currency: Currency;
  amount: number;
  rate?: number;
  expenseType?: "regular" | "person";
  contactTxId?: string;
  /** Set when this row was created by the Excel-balance-import feature (for highlighting). */
  importTag?: string;
}

export interface HistoryEntry {
  id: string;
  ts: number;
  action: "add" | "edit" | "delete" | "reset";
  kind?: TxKind;
  summary: string;
}

export function fmt(n: number, frac = 2) {
  if (!isFinite(n)) return "0";
  const v = n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: frac,
  });
  return v.replace(/,/g, "_").replace(/\./g, ",").replace(/_/g, ".");
}

export function txDeltas(tx: Transaction): Partial<Record<Currency, number>> {
  switch (tx.kind) {
    case "opening":
      return { [tx.currency]: tx.amount };
    case "buy":
      return { KZT: -(tx.amount * (tx.rate || 0)), [tx.currency]: tx.amount };
    case "sell":
      return { KZT: tx.amount * (tx.rate || 0), [tx.currency]: -tx.amount };
    case "income":
      return { [tx.currency]: tx.amount };
    case "expense":
      return { [tx.currency]: -tx.amount };
  }
}

export function txLabel(tx: Transaction): string {
  const base = `${tx.name ? tx.name + " · " : ""}${fmt(tx.amount)} ${tx.currency}${tx.rate ? ` × ${tx.rate}` : ""}`;
  const k =
    tx.kind === "opening"
      ? "Остаток"
      : tx.kind === "buy"
        ? "Покупка"
        : tx.kind === "sell"
          ? "Продажа"
          : tx.kind === "income"
            ? "Приход"
            : tx.expenseType === "person"
              ? "Расход (кому/кто забрал)"
              : "Расход";
  return `${k}: ${base}`;
}

export function timeStr(ts: number) {
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

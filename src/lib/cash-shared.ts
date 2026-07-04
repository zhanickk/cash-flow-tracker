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
  cashierName?: string;
}

export function fmt(n: number, frac = 2) {
  if (!isFinite(n)) return "0";
  const v = n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: frac,
  });
  // Group thousands with a space and use a comma as the decimal separator —
  // matches the convention already used across the rest of the site (contacts
  // balances, journal entries, Excel exports all use ru-RU-style " "/"," ).
  return v.replace(/,/g, "_").replace(/\./g, ",").replace(/_/g, " ");
}

/**
 * Live-typing formatter for amount inputs: groups thousands with a space as
 * the user types (e.g. "10000" -> "10 000"), keeps a single comma as the
 * decimal separator. Used everywhere a person enters a monetary amount so
 * large numbers stay easy to read while typing.
 */
export function formatAmountInput(s: string): string {
  const raw = s.replace(/\s/g, "").replace(/[^\d,]/g, "");
  const firstComma = raw.indexOf(",");
  const intRaw = firstComma >= 0 ? raw.slice(0, firstComma) : raw;
  const fracRaw = firstComma >= 0 ? raw.slice(firstComma + 1).replace(/,/g, "") : "";
  const intNormalized = intRaw.replace(/^0+(?=\d)/, "");
  const groupedInt = (intNormalized || "0").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (firstComma >= 0) return `${groupedInt},${fracRaw}`;
  return groupedInt === "0" && intRaw === "" ? "" : groupedInt;
}

/** Parses a (possibly space-grouped, comma-decimal) amount input string into a number. */
export function parseAmountInput(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/\s/g, "").replace(/\./g, "").replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
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

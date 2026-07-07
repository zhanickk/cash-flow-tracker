import { CURRENCIES, type Currency } from "@/lib/cash-shared";

export type ContactCurrency = Currency;

export const CONTACT_CURRENCIES = CURRENCIES;

const CURRENCY_FLAG: Record<ContactCurrency, string> = {
  USD: "🇺🇸",
  EUR: "🇪🇺",
  RUB: "🇷🇺",
  KGS: "🇰🇬",
  CNY: "🇨🇳",
  GOLD: "🏅",
  KZT: "🇰🇿",
};

export function emptyBalances(): Record<ContactCurrency, number> {
  return Object.fromEntries(CONTACT_CURRENCIES.map((c) => [c.code, 0])) as Record<
    ContactCurrency,
    number
  >;
}

export function computeBalancesFromAmounts(
  entries: { currency: string; amount: number }[],
): Record<ContactCurrency, number> {
  const balances = emptyBalances();
  for (const e of entries) {
    const code = e.currency as ContactCurrency;
    if (code in balances) balances[code] += Number(e.amount);
  }
  return balances;
}

/** Currencies with a non-zero balance — visible as open accounts. */
export function openCurrencies(balances: Record<string, number>): ContactCurrency[] {
  return CONTACT_CURRENCIES.map((c) => c.code).filter((code) => (balances[code] ?? 0) !== 0);
}

/** Currencies that ever had operations (including zero balance now). */
export function currenciesWithHistory(
  txs: { currency: string }[],
): ContactCurrency[] {
  const set = new Set<ContactCurrency>();
  for (const t of txs) {
    const code = t.currency as ContactCurrency;
    if (CONTACT_CURRENCIES.some((c) => c.code === code)) set.add(code);
  }
  return [...set];
}

export function balanceTone(v: number) {
  if (v > 0) return "text-success";
  if (v < 0) return "text-danger";
  return "text-muted-foreground";
}

export function fmtContactBalance(currency: string, n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n);
  if (currency === "USD") return sign + "$" + abs.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (currency === "KZT") return sign + abs.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₸";
  const flag = CURRENCY_FLAG[currency as ContactCurrency] ?? "";
  return `${sign}${flag} ${abs.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${currency}`;
}

export function fmtContactBalancePlain(currency: string, n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n);
  if (currency === "USD") return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (currency === "KZT") return `${sign}${abs.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₸`;
  return `${sign}${abs.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${currency}`;
}

export function currencyLabel(code: ContactCurrency) {
  return CONTACT_CURRENCIES.find((c) => c.code === code)?.label ?? code;
}

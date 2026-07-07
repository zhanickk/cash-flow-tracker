import { HoverCardContent } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import {
  fmtAmount,
  fmtDateTime,
  fmtUsd,
  useContactLast5,
  type ContactWithBalance,
} from "@/lib/contacts";
import {
  balanceTone,
  currencyLabel,
  fmtContactBalance,
  type ContactCurrency,
} from "@/lib/contact-currencies";

function balanceGridClass(count: number) {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-2";
  if (count === 3) return "grid-cols-3";
  if (count === 4) return "grid-cols-2";
  return "grid-cols-3";
}

function balanceCardWidth(count: number) {
  if (count <= 2) return "w-80";
  if (count === 3) return "w-[26rem]";
  return "w-[28rem]";
}

function balanceAmountClass(count: number) {
  if (count >= 3) return "text-sm font-semibold leading-snug";
  return "text-lg font-semibold leading-tight";
}

function formatBalance(code: ContactCurrency, value: number) {
  if (code === "KZT") return fmtAmount(value) + " ₸";
  if (code === "USD") return fmtUsd(value);
  return fmtContactBalance(code, value);
}

export function ContactBalanceHoverCard({
  contactId,
  name,
  balances,
  activeCurrencies,
  kztBalance,
  usdBalance,
  txCount,
  lastActivityAt,
}: {
  contactId: string;
  name: string;
  balances?: ContactWithBalance["balances"];
  activeCurrencies?: ContactCurrency[];
  /** @deprecated pass balances */
  kztBalance?: number;
  usdBalance?: number;
  txCount?: number;
  lastActivityAt?: string | null;
}) {
  const { data: last5, isLoading } = useContactLast5(contactId);

  const resolvedBalances = balances ?? {
    KZT: kztBalance ?? 0,
    USD: usdBalance ?? 0,
    EUR: 0,
    RUB: 0,
    KGS: 0,
    CNY: 0,
    GOLD: 0,
  };
  const open =
    activeCurrencies ??
    (Object.entries(resolvedBalances)
      .filter(([, v]) => v !== 0)
      .map(([k]) => k) as ContactCurrency[]);

  return (
    <HoverCardContent className={cn("p-4", balanceCardWidth(open.length))}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="truncate text-base font-semibold leading-none">{name}</div>
        {(txCount !== undefined || lastActivityAt) && (
          <div className="shrink-0 text-xs leading-none text-muted-foreground">
            {txCount !== undefined && `${txCount} операц${txCount === 1 ? "ия" : "ий"}`}
            {lastActivityAt ? ` · ${new Date(lastActivityAt).toLocaleDateString("ru-RU")}` : ""}
          </div>
        )}
      </div>

      {open.length === 0 ? (
        <div className="mb-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          Нет открытых счетов
        </div>
      ) : (
        <div className={cn("mb-3 grid gap-2", balanceGridClass(open.length))}>
          {open.map((code) => {
            const value = resolvedBalances[code] ?? 0;
            const formatted = formatBalance(code, value);
            return (
              <div
                key={code}
                className="flex min-h-[4.25rem] min-w-0 flex-col justify-center rounded-lg bg-muted px-2.5 py-2"
              >
                <div className="mb-1 truncate text-[11px] font-medium text-muted-foreground">
                  {currencyLabel(code)}
                </div>
                <div
                  className={cn(
                    "truncate tabular-nums",
                    balanceAmountClass(open.length),
                    balanceTone(value),
                  )}
                  title={formatted}
                >
                  {formatted}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-border pt-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Последние операции</div>
        {isLoading && <div className="text-xs text-muted-foreground">Загрузка…</div>}
        {!isLoading && (last5?.length ?? 0) === 0 && (
          <div className="text-xs text-muted-foreground">Операций пока нет</div>
        )}
        <div className="flex flex-col gap-1.5">
          {(last5 ?? []).map((t) => (
            <div
              key={t.id}
              className={cn(
                "flex items-center justify-between gap-3 text-xs leading-none",
                t.source === "excel_import" && "-mx-1.5 rounded bg-success-soft px-1.5 py-1",
              )}
              title={t.source === "excel_import" ? "Импортировано из Excel" : undefined}
            >
              <span className="text-muted-foreground">{fmtDateTime(t.occurred_at)}</span>
              <span className={cn("font-medium tabular-nums", balanceTone(Number(t.amount)))}>
                {t.currency === "KZT"
                  ? fmtAmount(Number(t.amount)) + " ₸"
                  : t.currency === "USD"
                    ? fmtUsd(Number(t.amount))
                    : fmtContactBalance(t.currency, Number(t.amount))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </HoverCardContent>
  );
}

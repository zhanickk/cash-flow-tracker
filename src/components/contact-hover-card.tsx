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
  fmtContactBalance,
  type ContactCurrency,
} from "@/lib/contact-currencies";

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
    <HoverCardContent className="w-96 p-4">
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
        <div
          className={cn(
            "mb-3 grid gap-2",
            open.length === 1 ? "grid-cols-1" : open.length === 2 ? "grid-cols-2" : "grid-cols-2",
          )}
        >
          {open.map((code) => {
            const value = resolvedBalances[code] ?? 0;
            return (
              <div key={code} className="rounded-lg bg-muted p-3">
                <div className="mb-1 text-xs text-muted-foreground">{code}</div>
                <div
                  className={cn(
                    "text-lg font-semibold leading-tight tabular-nums",
                    balanceTone(value),
                  )}
                >
                  {code === "KZT"
                    ? fmtAmount(value) + " ₸"
                    : code === "USD"
                      ? fmtUsd(value)
                      : fmtContactBalance(code, value)}
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

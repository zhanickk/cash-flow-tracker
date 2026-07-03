import { HoverCardContent } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { fmtAmount, fmtDateTime, fmtUsd, useContactLast5 } from "@/lib/contacts";

function balanceTone(v: number) {
  if (v > 0) return "text-success";
  if (v < 0) return "text-danger";
  return "text-muted-foreground";
}

export function ContactBalanceHoverCard({
  contactId,
  name,
  kztBalance,
  usdBalance,
  txCount,
  lastActivityAt,
}: {
  contactId: string;
  name: string;
  kztBalance: number;
  usdBalance: number;
  txCount?: number;
  lastActivityAt?: string | null;
}) {
  const { data: last5, isLoading } = useContactLast5(contactId);

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

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted p-3">
          <div className="mb-1 text-xs text-muted-foreground">Тенге</div>
          <div className={cn("text-lg font-semibold leading-tight tabular-nums", balanceTone(kztBalance))}>
            {fmtAmount(kztBalance)} ₸
          </div>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <div className="mb-1 text-xs text-muted-foreground">USD</div>
          <div className={cn("text-lg font-semibold leading-tight tabular-nums", balanceTone(usdBalance))}>
            {fmtUsd(usdBalance)}
          </div>
        </div>
      </div>

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
                {t.currency === "KZT" ? fmtAmount(Number(t.amount)) + " ₸" : fmtUsd(Number(t.amount))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </HoverCardContent>
  );
}

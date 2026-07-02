import { HoverCardContent } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { fmtAmount, fmtUsd, useContactLast5 } from "@/lib/contacts";

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
  rate,
  txCount,
  lastActivityAt,
}: {
  contactId: string;
  name: string;
  kztBalance: number;
  usdBalance: number;
  rate: number;
  txCount?: number;
  lastActivityAt?: string | null;
}) {
  const { data: last5, isLoading } = useContactLast5(contactId);
  const combinedKzt = kztBalance + usdBalance * rate;

  return (
    <HoverCardContent className="w-72">
      <div className="mb-2 text-sm font-medium">{name}</div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div className="rounded-md bg-muted p-2">
          <div className="text-[11px] text-muted-foreground">Тенге</div>
          <div className={cn("text-sm font-semibold tabular-nums", balanceTone(kztBalance))}>
            {fmtAmount(kztBalance)} ₸
          </div>
        </div>
        <div className="rounded-md bg-muted p-2">
          <div className="text-[11px] text-muted-foreground">USD</div>
          <div className={cn("text-sm font-semibold tabular-nums", balanceTone(usdBalance))}>
            {fmtUsd(usdBalance)}
          </div>
        </div>
      </div>
      <div className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
        Итого в тенге по курсу {rate ? rate.toLocaleString("ru-RU") : "—"}:{" "}
        <span className={cn("font-medium", balanceTone(combinedKzt))}>
          {fmtAmount(combinedKzt)} ₸
        </span>
      </div>
      {(txCount !== undefined || lastActivityAt) && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          {txCount !== undefined && `${txCount} операц${txCount === 1 ? "ия" : "ий"}`}
          {lastActivityAt ? ` · ${new Date(lastActivityAt).toLocaleDateString("ru-RU")}` : ""}
        </div>
      )}
      <div className="mt-2 border-t border-border pt-2">
        <div className="mb-1 text-[11px] text-muted-foreground">Последние операции</div>
        {isLoading && <div className="text-[11px] text-muted-foreground">Загрузка…</div>}
        {!isLoading && (last5?.length ?? 0) === 0 && (
          <div className="text-[11px] text-muted-foreground">Операций пока нет</div>
        )}
        <div className="flex flex-col gap-0.5">
          {(last5 ?? []).map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-muted-foreground">
                {new Date(t.occurred_at).toLocaleDateString("ru-RU")}
              </span>
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

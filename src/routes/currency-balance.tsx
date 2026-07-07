import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmt, formatAmountInput, parseAmountInput } from "@/lib/cash-shared";
import { balanceTone, useCurrencyHoldings } from "@/lib/currency-balance";
import { toDateTimeLocalInput, useAddFxSale } from "@/lib/fx-sales";

export const Route = createFileRoute("/currency-balance")({
  head: () => ({
    meta: [{ title: "Баланс валют — Кассовый лист" }],
  }),
  component: CurrencyBalancePage,
});

function parseRate(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/\s/g, "").replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function CurrencyBalancePage() {
  const { data, isLoading } = useCurrencyHoldings();
  const addSale = useAddFxSale();

  const [expanded, setExpanded] = useState(false);
  const [saleWarning, setSaleWarning] = useState<string | null>(null);

  const [saleAmount, setSaleAmount] = useState("");
  const [saleRate, setSaleRate] = useState("");
  const [saleNote, setSaleNote] = useState("");
  const [saleAt, setSaleAt] = useState(toDateTimeLocalInput(Date.now()));

  const usdCard = data?.cards.find((c) => c.currencyCode === "USD");
  const totalSalynghanKzt = usdCard?.salynghanKztTotal ?? 0;

  const previewKzt = parseAmountInput(saleAmount) * parseRate(saleRate);

  function submitSale() {
    const a = parseAmountInput(saleAmount);
    const r = parseRate(saleRate);
    if (a <= 0 || r <= 0) return;
    addSale.mutate(
      {
        occurredAt: new Date(saleAt).toISOString(),
        currencyCode: "USD",
        foreignAmount: a,
        rate: r,
        note: saleNote.trim() || undefined,
      },
      {
        onSuccess: (res) => {
          setSaleAmount("");
          setSaleRate("");
          setSaleNote("");
          setSaleWarning(res?.warning ?? null);
        },
      },
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" asChild>
                <Link to="/">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <Wallet className="h-5 w-5 text-primary" />
              <div>
                <h1 className="text-lg font-semibold">Баланс USD</h1>
                <p className="text-xs text-muted-foreground">
                  Қарыз / Салынған · только долларовый счёт
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-1" asChild>
              <Link to="/contacts">
                <Users className="h-4 w-4" />
                Клиенты
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-3 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm text-muted-foreground">
                Держим в тенге (из Салынған, все продажи)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-success">
                {fmt(totalSalynghanKzt)} ₸
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm text-muted-foreground">USD: остаток котла</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.usdReplay ? (
                <div className="space-y-1 text-sm">
                  <div>
                    Қарыз:{" "}
                    <span className={cn("font-bold tabular-nums", balanceTone(data.usdReplay.karyzRemainder))}>
                      {fmt(data.usdReplay.karyzRemainder)} $
                    </span>
                  </div>
                  <div>
                    Салынған:{" "}
                    <span
                      className={cn("font-bold tabular-nums", balanceTone(data.usdReplay.salynghanRemainder))}
                    >
                      {fmt(data.usdReplay.salynghanRemainder)} $
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </CardContent>
          </Card>
        </div>

        {saleWarning && (
          <div className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
            {saleWarning}
          </div>
        )}

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Продажа USD (→ касса)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                type="datetime-local"
                value={saleAt}
                onChange={(e) => setSaleAt(e.target.value)}
              />
              <Input
                placeholder="Объём, $"
                value={saleAmount}
                onChange={(e) => setSaleAmount(formatAmountInput(e.target.value))}
              />
              <Input
                placeholder="Курс"
                value={saleRate}
                onChange={(e) => setSaleRate(formatAmountInput(e.target.value))}
              />
              <Input
                placeholder="Примечание"
                value={saleNote}
                onChange={(e) => setSaleNote(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {previewKzt > 0 && (
                <span className="text-sm tabular-nums">
                  = <strong>{fmt(previewKzt)} ₸</strong>
                </span>
              )}
              <Button
                className="gap-1 bg-success text-success-foreground hover:bg-success/90"
                onClick={submitSale}
                disabled={addSale.isPending}
              >
                <ArrowLeftRight className="h-4 w-4" />
                Продать USD
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Сначала списание из Қарыз, превышение — из Салынған (общий котёл).
            </p>
          </CardContent>
        </Card>

        {isLoading && <p className="text-center text-sm text-muted-foreground">Загрузка…</p>}
        {!isLoading && !usdCard && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Нет USD-операций. Импортируйте клиентов из Excel или добавьте операции в{" "}
              <Link to="/contacts" className="text-primary underline">
                карточках клиентов
              </Link>
              .
            </CardContent>
          </Card>
        )}

        {usdCard && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">USD — долларовый счёт</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-md bg-muted/60 p-2">
                  <div className="text-[11px] text-muted-foreground">Қарыз (нам должны)</div>
                  <div className="font-semibold tabular-nums">{fmt(usdCard.totalKaryz)} $</div>
                </div>
                <div className="rounded-md bg-muted/60 p-2">
                  <div className="text-[11px] text-muted-foreground">Салынған (мы должны)</div>
                  <div className="font-semibold tabular-nums">{fmt(usdCard.totalSalynghan)} $</div>
                </div>
                <div className="rounded-md bg-muted/60 p-2">
                  <div className="text-[11px] text-muted-foreground">Продано</div>
                  <div className="font-semibold tabular-nums">{fmt(usdCard.soldForeign)} $</div>
                </div>
                <div className="rounded-md border border-border p-2">
                  <div className="text-[11px] text-muted-foreground">Остаток Қарыз</div>
                  <div className={cn("font-bold tabular-nums", balanceTone(usdCard.karyzRemainder))}>
                    {fmt(usdCard.karyzRemainder)} $
                  </div>
                </div>
                <div className="rounded-md border border-border p-2">
                  <div className="text-[11px] text-muted-foreground">Остаток Салынған</div>
                  <div
                    className={cn("font-bold tabular-nums", balanceTone(usdCard.salynghanRemainder))}
                  >
                    {fmt(usdCard.salynghanRemainder)} $
                  </div>
                </div>
              </div>
              {usdCard.salynghanKztTotal > 0 && (
                <div className="rounded-md bg-success-soft px-3 py-2 text-sm">
                  <span className="text-muted-foreground">В тенге из Салынған: </span>
                  <span className="font-semibold tabular-nums text-success">
                    {fmt(usdCard.salynghanKztTotal)} ₸
                  </span>
                </div>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-full gap-1 text-xs"
                onClick={() => setExpanded((v) => !v)}
              >
                История продаж ({usdCard.sales.length})
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
              {expanded && (
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-xs">
                  {usdCard.sales.length === 0 && (
                    <li className="text-muted-foreground">Продаж пока нет</li>
                  )}
                  {usdCard.sales.map((s) => {
                    const d = new Date(s.occurredAt);
                    return (
                      <li key={s.id} className="space-y-0.5 border-b border-border/40 pb-1">
                        <div className="flex justify-between gap-2 tabular-nums">
                          <span className="text-muted-foreground">
                            {d.toLocaleDateString("ru-RU")}{" "}
                            {d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span>
                            {fmt(s.foreignAmount)} $ × {fmt(s.rate, 4)} ={" "}
                            <span className="font-medium text-success">{fmt(s.kztAmount)} ₸</span>
                          </span>
                        </div>
                        {s.allocationLabel && (
                          <div className="text-[10px] text-muted-foreground">{s.allocationLabel}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

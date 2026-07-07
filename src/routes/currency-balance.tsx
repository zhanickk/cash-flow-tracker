import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  Banknote,
  ChevronDown,
  ChevronUp,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fmt, formatAmountInput, parseAmountInput } from "@/lib/cash-shared";
import { balanceTone, useCurrencyHoldings } from "@/lib/currency-balance";
import { toDateTimeLocalInput, useAddFxSale, useFxCurrencies } from "@/lib/fx-sales";

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
  const { data: currencies = [] } = useFxCurrencies();
  const addSale = useAddFxSale();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [saleWarning, setSaleWarning] = useState<string | null>(null);

  const [saleCurrency, setSaleCurrency] = useState("USD");
  const [saleAmount, setSaleAmount] = useState("");
  const [saleRate, setSaleRate] = useState("");
  const [saleNote, setSaleNote] = useState("");
  const [saleAt, setSaleAt] = useState(toDateTimeLocalInput(Date.now()));

  const cards = data?.cards ?? [];
  const totalSalynghanKzt = useMemo(
    () => cards.reduce((s, c) => s + c.salynghanKztTotal, 0),
    [cards],
  );

  const previewKzt = parseAmountInput(saleAmount) * parseRate(saleRate);

  function submitSale() {
    const a = parseAmountInput(saleAmount);
    const r = parseRate(saleRate);
    if (a <= 0 || r <= 0) return;
    addSale.mutate(
      {
        occurredAt: new Date(saleAt).toISOString(),
        currencyCode: saleCurrency,
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
                <h1 className="text-lg font-semibold">Баланс валют</h1>
                <p className="text-xs text-muted-foreground">
                  Қарыз / Салынған из контактов · продажи из кассы
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1" asChild>
                <Link to="/contacts">
                  <Users className="h-4 w-4" />
                  Контакты
                </Link>
              </Button>
              <Button size="sm" variant="outline" className="gap-1" asChild>
                <Link to="/fx-risk">
                  <Banknote className="h-4 w-4" />
                  Риск (Салынған)
                </Link>
              </Button>
              <Button size="sm" variant="outline" className="gap-1" asChild>
                <Link to="/fx-sales">
                  <Banknote className="h-4 w-4" />
                  Отчёты
                </Link>
              </Button>
            </div>
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
            <CardTitle className="text-sm">Продажа (→ касса + отчёт)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <Input
                type="datetime-local"
                value={saleAt}
                onChange={(e) => setSaleAt(e.target.value)}
                className="lg:col-span-2"
              />
              <Select value={saleCurrency} onValueChange={setSaleCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Объём"
                value={saleAmount}
                onChange={(e) => setSaleAmount(formatAmountInput(e.target.value))}
              />
              <Input
                placeholder="Курс"
                value={saleRate}
                onChange={(e) => setSaleRate(formatAmountInput(e.target.value))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Примечание"
                value={saleNote}
                onChange={(e) => setSaleNote(e.target.value)}
                className="max-w-xs"
              />
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
                Продать
              </Button>
            </div>
            {saleCurrency === "USD" && (
              <p className="text-xs text-muted-foreground">
                USD: сначала списание из Қарыз, превышение — из Салынған (общий котёл).
              </p>
            )}
          </CardContent>
        </Card>

        {isLoading && <p className="text-center text-sm text-muted-foreground">Загрузка…</p>}
        {!isLoading && cards.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Нет операций в контактах. Добавьте Қарыз / Салынған в{" "}
              <Link to="/contacts" className="text-primary underline">
                карточках клиентов
              </Link>
              .
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {cards.map((card) => (
            <Card key={card.currencyCode}>
              <CardHeader className="py-3">
                <CardTitle className="text-base">{card.label}</CardTitle>
                <div className="text-xs text-muted-foreground">{card.currencyCode}</div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-muted/60 p-2">
                    <div className="text-[11px] text-muted-foreground">Қарыз (нам должны)</div>
                    <div className="font-semibold tabular-nums">{fmt(card.totalKaryz)}</div>
                  </div>
                  <div className="rounded-md bg-muted/60 p-2">
                    <div className="text-[11px] text-muted-foreground">Салынған (мы должны)</div>
                    <div className="font-semibold tabular-nums">{fmt(card.totalSalynghan)}</div>
                  </div>
                  <div className="rounded-md bg-muted/60 p-2">
                    <div className="text-[11px] text-muted-foreground">Продано</div>
                    <div className="font-semibold tabular-nums">{fmt(card.soldForeign)}</div>
                  </div>
                  {card.isUsd ? (
                    <>
                      <div className="rounded-md border border-border p-2">
                        <div className="text-[11px] text-muted-foreground">Остаток Қарыз</div>
                        <div className={cn("font-bold tabular-nums", balanceTone(card.karyzRemainder))}>
                          {fmt(card.karyzRemainder)}
                        </div>
                      </div>
                      <div className="rounded-md border border-border p-2">
                        <div className="text-[11px] text-muted-foreground">Остаток Салынған</div>
                        <div className={cn("font-bold tabular-nums", balanceTone(card.salynghanRemainder))}>
                          {fmt(card.salynghanRemainder)}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-md border-2 border-primary/30 bg-primary/5 p-2">
                      <div className="text-[11px] text-muted-foreground">Остаток</div>
                      <div className={cn("text-lg font-bold tabular-nums", balanceTone(card.balance))}>
                        {fmt(card.balance)}
                      </div>
                    </div>
                  )}
                </div>
                {card.isUsd && card.salynghanKztTotal > 0 && (
                  <div className="rounded-md bg-success-soft px-3 py-2 text-sm">
                    <span className="text-muted-foreground">В тенге из Салынған: </span>
                    <span className="font-semibold tabular-nums text-success">
                      {fmt(card.salynghanKztTotal)} ₸
                    </span>
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full gap-1 text-xs"
                  onClick={() =>
                    setExpanded((v) => (v === card.currencyCode ? null : card.currencyCode))
                  }
                >
                  История продаж ({card.sales.length})
                  {expanded === card.currencyCode ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </Button>
                {expanded === card.currencyCode && (
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-xs">
                    {card.sales.length === 0 && (
                      <li className="text-muted-foreground">Продаж пока нет</li>
                    )}
                    {card.sales.map((s) => {
                      const d = new Date(s.occurredAt);
                      return (
                        <li key={s.id} className="space-y-0.5 border-b border-border/40 pb-1">
                          <div className="flex justify-between gap-2 tabular-nums">
                            <span className="text-muted-foreground">
                              {d.toLocaleDateString("ru-RU")}{" "}
                              {d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span>
                              {fmt(s.foreignAmount)} × {fmt(s.rate, 4)} ={" "}
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
          ))}
        </div>
      </main>
    </div>
  );
}

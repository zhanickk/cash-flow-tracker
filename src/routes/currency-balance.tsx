import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Users,
  Wallet,
  Banknote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmt, formatAmountInput, parseAmountInput } from "@/lib/cash-shared";
import { balanceTone, useCurrencyHoldings } from "@/lib/currency-balance";
import type { PeopleMoneySpendDay } from "@/lib/fx-people-money-spend";
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

function PeopleMoneyDayDetail({ day }: { day: PeopleMoneySpendDay }) {
  const hasTx = day.buys.length > 0 || day.sells.length > 0;
  if (!hasTx) {
    return <p className="text-xs text-muted-foreground">Нет USD-покупок и продаж за этот день.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <div className="mb-1 text-[11px] font-medium text-muted-foreground">Покупки USD</div>
        <ul className="space-y-1 text-xs">
          {day.buys.length === 0 && <li className="text-muted-foreground">—</li>}
          {day.buys.map((b) => (
            <li key={b.id} className="flex justify-between gap-2 tabular-nums">
              <span className="text-muted-foreground">
                {new Date(b.occurredAt).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span>
                {fmt(b.foreignAmount)} $ × {fmt(b.rate, 4)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="mb-1 text-[11px] font-medium text-muted-foreground">Продажи USD</div>
        <ul className="space-y-1 text-xs">
          {day.sells.length === 0 && <li className="text-muted-foreground">—</li>}
          {day.sells.map((s) => (
            <li key={s.id} className="flex justify-between gap-2 tabular-nums">
              <span className="text-muted-foreground">
                {new Date(s.occurredAt).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span>
                {fmt(s.foreignAmount)} $ × {fmt(s.rate, 4)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PeopleMoneySpendSection({
  today,
  daysWithSpend,
  totalSpendKzt,
}: {
  today: PeopleMoneySpendDay;
  daysWithSpend: PeopleMoneySpendDay[];
  totalSpendKzt: number;
}) {
  const [expandedDay, setExpandedDay] = useState<string | null>(today.dateKey);
  const [historyOpen, setHistoryOpen] = useState(daysWithSpend.length > 0);

  return (
    <Card className="border-warning/30">
      <CardHeader className="py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Banknote className="h-4 w-4 text-warning" />
          Трата Жұрттың ақшасы
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Если за день продали USD больше, чем купили — превышение из резерва клиентов (Салынған),
          зафиксировано по среднему курсу продаж. Данные из кассы (Supabase).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Сегодня
          </div>
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <div className="text-[11px] text-muted-foreground">Куплено</div>
              <div className="font-semibold tabular-nums">{fmt(today.boughtUsd)} $</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Продано</div>
              <div className="font-semibold tabular-nums">{fmt(today.soldUsd)} $</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Из резерва</div>
              <div
                className={cn(
                  "font-bold tabular-nums",
                  today.excessUsd > 0 ? "text-warning" : "text-muted-foreground",
                )}
              >
                {fmt(today.excessUsd)} $
              </div>
            </div>
          </div>
          {today.excessUsd > 0 ? (
            <div className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-sm">
              <span className="text-muted-foreground">Зафиксировано: </span>
              <span className="font-semibold tabular-nums">
                {fmt(today.excessUsd)} $ × {fmt(today.avgSellRate, 4)} ={" "}
                <span className="text-warning">{fmt(today.spendKzt)} ₸</span>
              </span>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              0 — покупка USD за день не меньше продажи (или операций не было).
            </p>
          )}
          {(today.buys.length > 0 || today.sells.length > 0) && (
            <div className="mt-3 border-t border-border/60 pt-3">
              <PeopleMoneyDayDetail day={today} />
            </div>
          )}
        </div>

        {daysWithSpend.length > 0 && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="mb-2 h-8 w-full gap-1 text-xs"
              onClick={() => setHistoryOpen((v) => !v)}
            >
              История трат по дням ({daysWithSpend.length})
              {historyOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
            {historyOpen && (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[520px] text-xs">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium">Дата</th>
                      <th className="px-2 py-2 text-right font-medium">Куплено</th>
                      <th className="px-2 py-2 text-right font-medium">Продано</th>
                      <th className="px-2 py-2 text-right font-medium">Из резерва</th>
                      <th className="px-2 py-2 text-right font-medium">Ср. курс</th>
                      <th className="px-2 py-2 text-right font-medium">В тенге</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {daysWithSpend.map((day) => (
                      <Fragment key={day.dateKey}>
                        <tr
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() =>
                            setExpandedDay((v) => (v === day.dateKey ? null : day.dateKey))
                          }
                        >
                          <td className="px-2 py-2">{day.dateLabel}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmt(day.boughtUsd)} $</td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmt(day.soldUsd)} $</td>
                          <td className="px-2 py-2 text-right tabular-nums font-medium text-warning">
                            {fmt(day.excessUsd)} $
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmt(day.avgSellRate, 4)}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold">
                            {fmt(day.spendKzt)} ₸
                          </td>
                        </tr>
                        {expandedDay === day.dateKey && (
                          <tr>
                            <td colSpan={6} className="bg-muted/20 px-3 py-3">
                              <PeopleMoneyDayDetail day={day} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
                <div className="border-t border-border bg-muted/30 px-3 py-2 text-right text-xs">
                  <span className="text-muted-foreground">Итого зафиксировано: </span>
                  <span className="font-semibold tabular-nums">{fmt(totalSpendKzt)} ₸</span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
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
  const peopleMoney = data?.peopleMoneySpend;

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

        {!isLoading && peopleMoney && (
          <PeopleMoneySpendSection
            today={peopleMoney.today}
            daysWithSpend={peopleMoney.daysWithSpend}
            totalSpendKzt={peopleMoney.totalSpendKzt}
          />
        )}

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

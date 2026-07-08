import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  ChevronDown,
  ChevronUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/cash-shared";
import { useCurrencyHoldings } from "@/lib/currency-balance";
import type { PeopleMoneySpendDay } from "@/lib/fx-people-money-spend";

export const Route = createFileRoute("/currency-balance")({
  head: () => ({
    meta: [{ title: "Трата Жұрттың ақшасы — Кассовый лист" }],
  }),
  component: CurrencyBalancePage,
});

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

function MetricTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "warning" | "muted" | "default";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-2 text-2xl font-bold tabular-nums sm:text-3xl",
          accent === "warning" && "text-warning",
          accent === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function PeopleMoneySpendSection({
  today,
  daysWithSpend,
  totalSpendKzt,
  totalExcessUsd,
}: {
  today: PeopleMoneySpendDay;
  daysWithSpend: PeopleMoneySpendDay[];
  totalSpendKzt: number;
  totalExcessUsd: number;
}) {
  const [expandedDay, setExpandedDay] = useState<string | null>(today.dateKey);
  const [historyOpen, setHistoryOpen] = useState(true);

  const todayHasSpend = today.excessUsd > 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricTile
          label="Сегодня в тенге"
          value={todayHasSpend ? `${fmt(today.spendKzt)} ₸` : "0 ₸"}
          sub={
            todayHasSpend
              ? `${fmt(today.excessUsd)} $ × ${fmt(today.avgSellRate, 4)}`
              : "Покупка USD за день ≥ продажи"
          }
          accent={todayHasSpend ? "warning" : "muted"}
        />
        <MetricTile
          label="Всего зафиксировано"
          value={`${fmt(totalSpendKzt)} ₸`}
          sub={`${fmt(totalExcessUsd)} $ из резерва клиентов`}
          accent={totalSpendKzt > 0 ? "warning" : "muted"}
        />
      </div>

      <Card className="border-2 border-warning/40 shadow-md">
        <CardHeader className="border-b border-border/60 bg-warning-soft/30 pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Banknote className="h-5 w-5 text-warning" />
            Сегодня
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Если за день продали USD больше, чем купили — превышение считается тратой из резерва
            (Салынған), по среднему курсу продаж. Данные из кассы.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground">Куплено USD</div>
              <div className="mt-1 text-xl font-bold tabular-nums">{fmt(today.boughtUsd)} $</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground">Продано USD</div>
              <div className="mt-1 text-xl font-bold tabular-nums">{fmt(today.soldUsd)} $</div>
            </div>
            <div
              className={cn(
                "rounded-lg p-3",
                todayHasSpend ? "bg-warning-soft" : "bg-muted/50",
              )}
            >
              <div className="text-xs text-muted-foreground">Из резерва (трата)</div>
              <div
                className={cn(
                  "mt-1 text-xl font-bold tabular-nums",
                  todayHasSpend ? "text-warning" : "text-muted-foreground",
                )}
              >
                {fmt(today.excessUsd)} $
              </div>
            </div>
          </div>

          {todayHasSpend && (
            <div className="rounded-xl border border-warning/30 bg-warning-soft/50 px-4 py-3 text-center">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Зафиксировано в тенге
              </div>
              <div className="mt-1 text-3xl font-bold tabular-nums text-warning sm:text-4xl">
                {fmt(today.spendKzt)} ₸
              </div>
              <div className="mt-1 text-sm tabular-nums text-muted-foreground">
                {fmt(today.excessUsd)} $ × {fmt(today.avgSellRate, 4)}
              </div>
            </div>
          )}

          {(today.buys.length > 0 || today.sells.length > 0) && (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">Операции за сегодня</div>
              <PeopleMoneyDayDetail day={today} />
            </div>
          )}
        </CardContent>
      </Card>

      {daysWithSpend.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">История по дням</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={() => setHistoryOpen((v) => !v)}
              >
                {daysWithSpend.length} {daysWithSpend.length === 1 ? "день" : "дней"}
                {historyOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            </div>
          </CardHeader>
          {historyOpen && (
            <CardContent className="p-0 pt-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-medium">Дата</th>
                      <th className="px-3 py-2.5 text-right font-medium">Куплено</th>
                      <th className="px-3 py-2.5 text-right font-medium">Продано</th>
                      <th className="px-3 py-2.5 text-right font-medium">Из резерва</th>
                      <th className="px-3 py-2.5 text-right font-medium">Ср. курс</th>
                      <th className="px-3 py-2.5 text-right font-medium">В тенге</th>
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
                          <td className="px-3 py-2.5 font-medium">{day.dateLabel}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{fmt(day.boughtUsd)} $</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{fmt(day.soldUsd)} $</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-warning">
                            {fmt(day.excessUsd)} $
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{fmt(day.avgSellRate, 4)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-bold">
                            {fmt(day.spendKzt)} ₸
                          </td>
                        </tr>
                        {expandedDay === day.dateKey && (
                          <tr>
                            <td colSpan={6} className="bg-muted/20 px-4 py-3">
                              <PeopleMoneyDayDetail day={day} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border bg-muted/30 px-4 py-3 text-right">
                <span className="text-sm text-muted-foreground">Итого зафиксировано: </span>
                <span className="text-lg font-bold tabular-nums text-warning">{fmt(totalSpendKzt)} ₸</span>
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

function CurrencyBalancePage() {
  const { data, isLoading } = useCurrencyHoldings();
  const peopleMoney = data?.peopleMoneySpend;

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-4xl px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" asChild>
                <Link to="/">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <Banknote className="h-5 w-5 text-warning" />
              <div>
                <h1 className="text-lg font-semibold">Трата Жұрттың ақшасы</h1>
                <p className="text-xs text-muted-foreground">
                  USD: продажа сверх покупки за день → резерв клиентов в тенге
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

      <main className="mx-auto max-w-4xl space-y-4 px-3 py-4">
        {isLoading && (
          <p className="py-16 text-center text-sm text-muted-foreground">Загрузка…</p>
        )}

        {!isLoading && peopleMoney && (
          <PeopleMoneySpendSection
            today={peopleMoney.today}
            daysWithSpend={peopleMoney.daysWithSpend}
            totalSpendKzt={peopleMoney.totalSpendKzt}
            totalExcessUsd={peopleMoney.totalExcessUsd}
          />
        )}

        {!isLoading && !peopleMoney && (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Нет данных по USD-операциям в кассе.
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

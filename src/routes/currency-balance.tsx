import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/cash-shared";
import { CURRENCIES } from "@/lib/cash-shared";
import { useCurrencyHoldings } from "@/lib/currency-balance";
import type { PeopleMoneySpendDay, PeopleMoneySpendReport } from "@/lib/fx-people-money-spend";

export const Route = createFileRoute("/currency-balance")({
  head: () => ({
    meta: [{ title: "Трата Жұрттың ақшасы — Кассовый лист" }],
  }),
  component: CurrencyBalancePage,
});

function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

function currencyLabel(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.label ?? code;
}

function PeopleMoneyDayDetail({ day }: { day: PeopleMoneySpendDay }) {
  const sym = currencySymbol(day.currency);
  const hasTx = day.buys.length > 0 || day.sells.length > 0;
  if (!hasTx) {
    return (
      <p className="text-xs text-muted-foreground">
        Нет операций {day.currency} за этот день.
      </p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <div className="mb-1 text-[11px] font-medium text-muted-foreground">
          Покупки {day.currency}
        </div>
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
                {fmt(b.foreignAmount)} {sym} × {fmt(b.rate, 4)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="mb-1 text-[11px] font-medium text-muted-foreground">
          Продажи {day.currency}
        </div>
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
                {fmt(s.foreignAmount)} {sym} × {fmt(s.rate, 4)}
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
  accent?: "warning" | "info" | "muted" | "default";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-2 text-2xl font-bold tabular-nums sm:text-3xl",
          accent === "warning" && "text-warning",
          accent === "info" && "text-primary",
          accent === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Метка + акцент для избытка дня в зависимости от направления. */
function directionMeta(day: PeopleMoneySpendDay) {
  if (day.direction === "reserve_spend") {
    return {
      chipLabel: "Из резерва (трата)",
      cardLabel: "Из резерва (трата)",
      fixedLabel: "Зафиксировано в тенге (из резерва)",
      hint: "Продали больше, чем купили — избыток продан из клиентского резерва (Салынған), по среднему курсу продаж.",
      accent: "warning" as const,
      Icon: TrendingDown,
    };
  }
  if (day.direction === "excess_buy") {
    return {
      chipLabel: "Излишек-закуп",
      cardLabel: "Излишек-закуп (остаток)",
      fixedLabel: "Тенге, потраченные на остаток",
      hint: "Купили больше, чем продали — остаток осел у нас, тенге на него уже потрачены, по среднему курсу покупок.",
      accent: "info" as const,
      Icon: TrendingUp,
    };
  }
  return {
    chipLabel: "Баланс",
    cardLabel: "Баланс",
    fixedLabel: "",
    hint: "Куплено и продано поровну.",
    accent: "muted" as const,
    Icon: Banknote,
  };
}

function PeopleMoneySpendSection({ report }: { report: PeopleMoneySpendReport }) {
  const { today, daysWithSpend, currency } = report;
  const [expandedDay, setExpandedDay] = useState<string | null>(today.dateKey);
  const [historyOpen, setHistoryOpen] = useState(true);

  const todayMeta = directionMeta(today);
  const todayHasSpend = today.direction !== "balanced";
  const sym = currencySymbol(currency);

  const netTotalKzt = report.totalSpendKzt - report.totalExcessBuyKzt;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile
          label="Сегодня в тенге"
          value={todayHasSpend ? `${fmt(today.spendKzt)} ₸` : "0 ₸"}
          sub={
            todayHasSpend
              ? `${todayMeta.chipLabel}: ${fmt(today.excessAmt)} ${sym} × ${fmt(today.avgRate, 4)}`
              : "Покупка и продажа за день равны"
          }
          accent={todayHasSpend ? todayMeta.accent : "muted"}
        />
        <MetricTile
          label="Всего из резерва"
          value={`${fmt(report.totalSpendKzt)} ₸`}
          sub={`${fmt(report.totalExcessUsd)} ${sym} продано сверх покупки`}
          accent={report.totalSpendKzt > 0 ? "warning" : "muted"}
        />
        <MetricTile
          label="Всего излишек-закуп"
          value={`${fmt(report.totalExcessBuyKzt)} ₸`}
          sub={`${fmt(report.totalExcessBuyAmt)} ${sym} куплено сверх продажи`}
          accent={report.totalExcessBuyKzt > 0 ? "info" : "muted"}
        />
      </div>

      <Card
        className={cn(
          "border-2 shadow-md",
          todayMeta.accent === "warning" && "border-warning/40",
          todayMeta.accent === "info" && "border-primary/30",
          todayMeta.accent === "muted" && "border-border",
        )}
      >
        <CardHeader
          className={cn(
            "border-b border-border/60 pb-4",
            todayMeta.accent === "warning" && "bg-warning-soft/30",
            todayMeta.accent === "info" && "bg-primary/5",
          )}
        >
          <CardTitle className="flex items-center gap-2 text-lg">
            <todayMeta.Icon
              className={cn(
                "h-5 w-5",
                todayMeta.accent === "warning" && "text-warning",
                todayMeta.accent === "info" && "text-primary",
              )}
            />
            Сегодня — {currencyLabel(currency)}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{todayMeta.hint} Данные из кассы.</p>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground">Куплено {currency}</div>
              <div className="mt-1 text-xl font-bold tabular-nums">
                {fmt(today.boughtAmt)} {sym}
              </div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground">Продано {currency}</div>
              <div className="mt-1 text-xl font-bold tabular-nums">
                {fmt(today.soldAmt)} {sym}
              </div>
            </div>
            <div
              className={cn(
                "rounded-lg p-3",
                todayHasSpend && todayMeta.accent === "warning" && "bg-warning-soft",
                todayHasSpend && todayMeta.accent === "info" && "bg-primary/10",
                !todayHasSpend && "bg-muted/50",
              )}
            >
              <div className="text-xs text-muted-foreground">{todayMeta.cardLabel}</div>
              <div
                className={cn(
                  "mt-1 text-xl font-bold tabular-nums",
                  todayHasSpend && todayMeta.accent === "warning" && "text-warning",
                  todayHasSpend && todayMeta.accent === "info" && "text-primary",
                  !todayHasSpend && "text-muted-foreground",
                )}
              >
                {fmt(today.excessAmt)} {sym}
              </div>
            </div>
          </div>

          {todayHasSpend && (
            <div
              className={cn(
                "rounded-xl border px-4 py-3 text-center",
                todayMeta.accent === "warning" && "border-warning/30 bg-warning-soft/50",
                todayMeta.accent === "info" && "border-primary/30 bg-primary/5",
              )}
            >
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {todayMeta.fixedLabel}
              </div>
              <div
                className={cn(
                  "mt-1 text-3xl font-bold tabular-nums sm:text-4xl",
                  todayMeta.accent === "warning" && "text-warning",
                  todayMeta.accent === "info" && "text-primary",
                )}
              >
                {fmt(today.spendKzt)} ₸
              </div>
              <div className="mt-1 text-sm tabular-nums text-muted-foreground">
                {fmt(today.excessAmt)} {sym} × {fmt(today.avgRate, 4)}
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
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-medium">Дата</th>
                      <th className="px-3 py-2.5 text-right font-medium">Куплено</th>
                      <th className="px-3 py-2.5 text-right font-medium">Продано</th>
                      <th className="px-3 py-2.5 text-left font-medium">Направление</th>
                      <th className="px-3 py-2.5 text-right font-medium">Избыток</th>
                      <th className="px-3 py-2.5 text-right font-medium">Ср. курс</th>
                      <th className="px-3 py-2.5 text-right font-medium">В тенге</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {daysWithSpend.map((day) => {
                      const meta = directionMeta(day);
                      return (
                        <Fragment key={day.dateKey}>
                          <tr
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() =>
                              setExpandedDay((v) => (v === day.dateKey ? null : day.dateKey))
                            }
                          >
                            <td className="px-3 py-2.5 font-medium">{day.dateLabel}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {fmt(day.boughtAmt)} {sym}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {fmt(day.soldAmt)} {sym}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                  meta.accent === "warning" && "bg-warning-soft text-warning",
                                  meta.accent === "info" && "bg-primary/10 text-primary",
                                )}
                              >
                                {meta.chipLabel}
                              </span>
                            </td>
                            <td
                              className={cn(
                                "px-3 py-2.5 text-right tabular-nums font-semibold",
                                meta.accent === "warning" && "text-warning",
                                meta.accent === "info" && "text-primary",
                              )}
                            >
                              {fmt(day.excessAmt)} {sym}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{fmt(day.avgRate, 4)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-bold">
                              {fmt(day.spendKzt)} ₸
                            </td>
                          </tr>
                          {expandedDay === day.dateKey && (
                            <tr>
                              <td colSpan={7} className="bg-muted/20 px-4 py-3">
                                <PeopleMoneyDayDetail day={day} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-border bg-muted/30 px-4 py-3 text-right">
                <span>
                  <span className="text-sm text-muted-foreground">Из резерва: </span>
                  <span className="text-lg font-bold tabular-nums text-warning">
                    {fmt(report.totalSpendKzt)} ₸
                  </span>
                </span>
                <span>
                  <span className="text-sm text-muted-foreground">Излишек-закуп: </span>
                  <span className="text-lg font-bold tabular-nums text-primary">
                    {fmt(report.totalExcessBuyKzt)} ₸
                  </span>
                </span>
                <span>
                  <span className="text-sm text-muted-foreground">Разница: </span>
                  <span className="text-lg font-bold tabular-nums">{fmt(netTotalKzt)} ₸</span>
                </span>
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
  const byCurrency = data?.peopleMoneySpendByCurrency ?? {};
  const codes = Object.keys(byCurrency).sort((a, b) => {
    // USD — самая активная валюта, всегда первая вкладка; дальше по алфавиту.
    // (тенге как отдельной вкладки тут нет и быть не может — тенге это то, В ЧЁМ
    // считается результат для любой валюты, а не сама торгуемая валюта)
    const priority = (c: string) => (c === "USD" ? 0 : 1);
    const p = priority(a) - priority(b);
    return p !== 0 ? p : a.localeCompare(b);
  });
  const [activeCurrency, setActiveCurrency] = useState<string | null>(null);
  const selected = activeCurrency && byCurrency[activeCurrency] ? activeCurrency : codes[0];

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
                  Продажа сверх покупки → резерв клиентов; покупка сверх продажи → излишек-закуп
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-1" asChild>
              <Link to="/contacts">
                <Wallet className="h-4 w-4" />
                Валютные счета
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-3 py-4">
        {isLoading && (
          <p className="py-16 text-center text-sm text-muted-foreground">Загрузка…</p>
        )}

        {!isLoading && codes.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2">
              {codes.map((code) => {
                const r = byCurrency[code];
                const hasSpendToday = r.today.direction !== "balanced";
                return (
                  <Button
                    key={code}
                    size="sm"
                    variant={code === selected ? "default" : "outline"}
                    className="gap-1"
                    onClick={() => setActiveCurrency(code)}
                  >
                    {currencyLabel(code)}
                    {hasSpendToday && (
                      <span
                        className={cn(
                          "ml-1 h-1.5 w-1.5 rounded-full",
                          r.today.direction === "reserve_spend" ? "bg-warning" : "bg-primary",
                        )}
                      />
                    )}
                  </Button>
                );
              })}
            </div>
            {selected && byCurrency[selected] && (
              <PeopleMoneySpendSection report={byCurrency[selected]} />
            )}
          </>
        )}

        {!isLoading && codes.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Нет данных по операциям с валютой в кассе.
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

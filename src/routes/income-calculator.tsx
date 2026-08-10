import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/cash-shared";
import {
  applyPeriodPreset,
  defaultFilters,
  filtersToPeriodTs,
  type FxSalesFilters,
  useFxCurrencies,
  useFxSales,
} from "@/lib/fx-sales";
import { periodLabelFromFilters } from "@/lib/fx-sales-report";
import { useFxPurchases } from "@/lib/fx-purchases";
import { buildIncomeSummary } from "@/lib/income-calculator";

export const Route = createFileRoute("/income-calculator")({
  head: () => ({
    meta: [{ title: "Калькулятор дохода — Кассовый лист" }],
  }),
  component: IncomeCalculatorPage,
});

function quickPeriodTs(period: "day" | "week" | "month" | "year") {
  return filtersToPeriodTs({ period, dateFrom: "", dateTo: "", currencies: [] });
}

function QuickTile({
  label,
  marginKzt,
  active,
  onClick,
}: {
  label: string;
  marginKzt: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border p-4 text-left shadow-sm transition-colors",
        active ? "border-primary bg-accent" : "border-border bg-card hover:border-primary/50",
      )}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 text-xl font-bold tabular-nums sm:text-2xl",
          marginKzt > 0 && "text-success",
          marginKzt < 0 && "text-danger",
        )}
      >
        {fmt(marginKzt)} ₸
      </div>
    </button>
  );
}

function IncomeCalculatorPage() {
  const { data: purchases = [], isLoading: purchasesLoading } = useFxPurchases();
  const { data: sales = [], isLoading: salesLoading } = useFxSales();
  const { data: currencies = [] } = useFxCurrencies();
  const isLoading = purchasesLoading || salesLoading;

  const [filters, setFilters] = useState<FxSalesFilters>(() => ({ ...defaultFilters(), period: "day" }));

  const dayTs = useMemo(() => quickPeriodTs("day"), []);
  const weekTs = useMemo(() => quickPeriodTs("week"), []);
  const monthTs = useMemo(() => quickPeriodTs("month"), []);
  const yearTs = useMemo(() => quickPeriodTs("year"), []);

  const dayIncome = useMemo(
    () => buildIncomeSummary(purchases, sales, currencies, dayTs.fromTs, dayTs.toTs),
    [purchases, sales, currencies, dayTs],
  );
  const weekIncome = useMemo(
    () => buildIncomeSummary(purchases, sales, currencies, weekTs.fromTs, weekTs.toTs),
    [purchases, sales, currencies, weekTs],
  );
  const monthIncome = useMemo(
    () => buildIncomeSummary(purchases, sales, currencies, monthTs.fromTs, monthTs.toTs),
    [purchases, sales, currencies, monthTs],
  );
  const yearIncome = useMemo(
    () => buildIncomeSummary(purchases, sales, currencies, yearTs.fromTs, yearTs.toTs),
    [purchases, sales, currencies, yearTs],
  );

  const customTs = useMemo(() => filtersToPeriodTs(filters), [filters]);
  const customCurrencies = filters.currencies ?? [];
  const filteredCurrencies = useMemo(
    () => currencies.filter((c) => customCurrencies.length === 0 || customCurrencies.includes(c.code)),
    [currencies, customCurrencies],
  );
  const customIncome = useMemo(() => {
    const full = buildIncomeSummary(purchases, sales, currencies, customTs.fromTs, customTs.toTs);
    if (customCurrencies.length === 0) return full;
    return {
      ...full,
      byCurrency: full.byCurrency.filter((r) => customCurrencies.includes(r.currencyCode)),
      totalMarginKzt: full.byCurrency
        .filter((r) => customCurrencies.includes(r.currencyCode))
        .reduce((s, r) => s + r.marginKzt, 0),
    };
  }, [purchases, sales, currencies, customTs, customCurrencies]);

  function setPeriod(period: FxSalesFilters["period"]) {
    if (period === "custom" || period === "all") {
      setFilters((f) => ({ ...f, period }));
      return;
    }
    const range = applyPeriodPreset(period);
    setFilters((f) => ({ ...f, period, ...range }));
  }

  function toggleCurrency(code: string) {
    setFilters((f) => {
      const set = new Set(f.currencies ?? []);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      return { ...f, currencies: [...set] };
    });
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-3 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <Calculator className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-lg font-semibold">Калькулятор дохода</h1>
              <p className="text-xs text-muted-foreground">
                Доход по средневзвешенной себестоимости, по всем валютам
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-3 py-4">
        <div className="flex items-start gap-2 rounded-md border border-accent bg-accent/40 p-3 text-xs text-accent-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Доход считается по методу средневзвешенной себестоимости: каждая продажа сравнивается
            со средним курсом покупки всей истории до неё, а не только за выбранный период — так
            доход не «теряется», если купили в одном периоде, а продали в другом. Журнал покупок
            ведётся с 10.08.2026 — для продаж того, что могло быть куплено раньше этой даты,
            себестоимость может быть занижена (доход завышен), пока не накопится история.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickTile
            label="Сегодня"
            marginKzt={dayIncome.totalMarginKzt}
            active={filters.period === "day"}
            onClick={() => setPeriod("day")}
          />
          <QuickTile
            label="Неделя"
            marginKzt={weekIncome.totalMarginKzt}
            active={filters.period === "week"}
            onClick={() => setPeriod("week")}
          />
          <QuickTile
            label="Месяц"
            marginKzt={monthIncome.totalMarginKzt}
            active={filters.period === "month"}
            onClick={() => setPeriod("month")}
          />
          <QuickTile
            label="Год"
            marginKzt={yearIncome.totalMarginKzt}
            active={filters.period === "year"}
            onClick={() => setPeriod("year")}
          />
        </div>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Период и валюты</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "Всё время"],
                  ["day", "День"],
                  ["week", "Неделя"],
                  ["month", "Месяц"],
                  ["year", "Год"],
                  ["custom", "Диапазон"],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  size="sm"
                  variant={filters.period === id ? "default" : "outline"}
                  onClick={() => setPeriod(id)}
                >
                  {label}
                </Button>
              ))}
            </div>
            {filters.period === "custom" && (
              <div className="flex flex-wrap gap-2">
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                />
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                />
              </div>
            )}
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Валюты</div>
              <div className="flex flex-wrap gap-1">
                {currencies.map((c) => {
                  const active = customCurrencies.length === 0 || customCurrencies.includes(c.code);
                  return (
                    <Button
                      key={c.code}
                      size="sm"
                      variant={active ? "secondary" : "outline"}
                      className={cn("h-7 text-xs", !active && "opacity-50")}
                      onClick={() => toggleCurrency(c.code)}
                    >
                      {c.code}
                    </Button>
                  );
                })}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setFilters((f) => ({ ...f, currencies: [] }))}
                >
                  Все
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
            <CardTitle className="text-sm">Общий доход · {periodLabelFromFilters(filters)}</CardTitle>
            <div
              className={cn(
                "text-lg font-bold tabular-nums",
                customIncome.totalMarginKzt > 0 && "text-success",
                customIncome.totalMarginKzt < 0 && "text-danger",
              )}
            >
              {fmt(customIncome.totalMarginKzt)} ₸
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Загрузка…</p>
            ) : customIncome.byCurrency.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Нет продаж за этот период</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2">Валюта</th>
                      <th className="px-3 py-2">Продано</th>
                      <th className="px-3 py-2">Курс продажи</th>
                      <th className="px-3 py-2">Себестоимость</th>
                      <th className="px-3 py-2">Ср. курс себестоимости</th>
                      <th className="px-3 py-2">Доход</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customIncome.byCurrency.map((row) => (
                      <tr key={row.currencyCode} className="border-b border-border/60">
                        <td className="px-3 py-2 font-medium">{row.label}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {fmt(row.soldAmount)}
                          <div className="text-xs text-muted-foreground">{fmt(row.soldKzt)} ₸</div>
                        </td>
                        <td className="px-3 py-2 tabular-nums">{fmt(row.avgSellRate, 4)}</td>
                        <td className="px-3 py-2 tabular-nums">{fmt(row.costOfSoldKzt)} ₸</td>
                        <td className="px-3 py-2 tabular-nums">{fmt(row.avgCostRate, 4)}</td>
                        <td
                          className={cn(
                            "px-3 py-2 tabular-nums font-semibold",
                            row.marginKzt > 0 && "text-success",
                            row.marginKzt < 0 && "text-danger",
                          )}
                        >
                          {fmt(row.marginKzt)} ₸
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

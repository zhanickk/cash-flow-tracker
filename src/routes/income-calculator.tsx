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
import { useExpenses } from "@/lib/expenses";
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
  amountKzt,
  active,
  onClick,
}: {
  label: string;
  amountKzt: number;
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
          amountKzt > 0 && "text-success",
          amountKzt < 0 && "text-danger",
        )}
      >
        {fmt(amountKzt)} ₸
      </div>
    </button>
  );
}

function IncomeCalculatorPage() {
  const { data: purchases = [], isLoading: purchasesLoading } = useFxPurchases();
  const { data: sales = [], isLoading: salesLoading } = useFxSales();
  const { data: expenses = [], isLoading: expensesLoading } = useExpenses();
  const { data: currencies = [] } = useFxCurrencies();
  const isLoading = purchasesLoading || salesLoading || expensesLoading;

  const [filters, setFilters] = useState<FxSalesFilters>(() => ({ ...defaultFilters(), period: "day" }));

  const dayTs = useMemo(() => quickPeriodTs("day"), []);
  const weekTs = useMemo(() => quickPeriodTs("week"), []);
  const monthTs = useMemo(() => quickPeriodTs("month"), []);
  const yearTs = useMemo(() => quickPeriodTs("year"), []);

  const dayIncome = useMemo(
    () => buildIncomeSummary(purchases, sales, currencies, dayTs.fromTs, dayTs.toTs, expenses),
    [purchases, sales, currencies, dayTs, expenses],
  );
  const weekIncome = useMemo(
    () => buildIncomeSummary(purchases, sales, currencies, weekTs.fromTs, weekTs.toTs, expenses),
    [purchases, sales, currencies, weekTs, expenses],
  );
  const monthIncome = useMemo(
    () => buildIncomeSummary(purchases, sales, currencies, monthTs.fromTs, monthTs.toTs, expenses),
    [purchases, sales, currencies, monthTs, expenses],
  );
  const yearIncome = useMemo(
    () => buildIncomeSummary(purchases, sales, currencies, yearTs.fromTs, yearTs.toTs, expenses),
    [purchases, sales, currencies, yearTs, expenses],
  );

  const customTs = useMemo(() => filtersToPeriodTs(filters), [filters]);
  const customCurrencies = filters.currencies ?? [];
  const filteredCurrencies = useMemo(
    () => currencies.filter((c) => customCurrencies.length === 0 || customCurrencies.includes(c.code)),
    [currencies, customCurrencies],
  );
  const customIncome = useMemo(() => {
    const full = buildIncomeSummary(purchases, sales, currencies, customTs.fromTs, customTs.toTs, expenses);
    // Расходы не привязаны к валюте (всегда в тенге, категория) — фильтр по
    // валюте влияет только на доход от купли/продажи, не на расходы.
    if (customCurrencies.length === 0) return full;
    const byCurrency = full.byCurrency.filter((r) => customCurrencies.includes(r.currencyCode));
    const totalMarginKzt = byCurrency.reduce((s, r) => s + r.marginKzt, 0);
    return {
      ...full,
      byCurrency,
      totalMarginKzt,
      netProfitKzt: totalMarginKzt - full.totalExpensesKzt,
    };
  }, [purchases, sales, currencies, customTs, customCurrencies, expenses]);

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
            ведётся с 10.08.2026 — если для продажи нет данных о покупке (валюта продана раньше,
            чем куплена по журналу), доход по такой продаже считается нулевым, а не полной суммой
            продажи, пока не накопится история покупок. Чистая прибыль = доход от купли/продажи
            валют минус невозвратные расходы (Тамак/Айлык/Ага/Апше/Прочее из карточки «Расходы»,
            всегда в тенге).
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickTile
            label="Сегодня · чистая прибыль"
            amountKzt={dayIncome.netProfitKzt}
            active={filters.period === "day"}
            onClick={() => setPeriod("day")}
          />
          <QuickTile
            label="Неделя · чистая прибыль"
            amountKzt={weekIncome.netProfitKzt}
            active={filters.period === "week"}
            onClick={() => setPeriod("week")}
          />
          <QuickTile
            label="Месяц · чистая прибыль"
            amountKzt={monthIncome.netProfitKzt}
            active={filters.period === "month"}
            onClick={() => setPeriod("month")}
          />
          <QuickTile
            label="Год · чистая прибыль"
            amountKzt={yearIncome.netProfitKzt}
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
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Итог · {periodLabelFromFilters(filters)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">Доход (купля/продажа валют)</div>
                <div className="mt-1 text-lg font-bold tabular-nums">
                  {fmt(customIncome.totalMarginKzt)} ₸
                </div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">Расходы (невозвратные)</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-danger">
                  −{fmt(customIncome.totalExpensesKzt)} ₸
                </div>
              </div>
              <div className="rounded-md border border-primary/40 bg-accent/40 p-3">
                <div className="text-xs text-muted-foreground">Чистая прибыль</div>
                <div
                  className={cn(
                    "mt-1 text-lg font-bold tabular-nums",
                    customIncome.netProfitKzt > 0 && "text-success",
                    customIncome.netProfitKzt < 0 && "text-danger",
                  )}
                >
                  {fmt(customIncome.netProfitKzt)} ₸
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Доход по валютам · {periodLabelFromFilters(filters)}</CardTitle>
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

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">
              Расходы по категориям · {periodLabelFromFilters(filters)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Загрузка…</p>
            ) : customIncome.expensesByCategory.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                Нет невозвратных расходов за этот период
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2">Категория</th>
                      <th className="px-3 py-2">Операций</th>
                      <th className="px-3 py-2">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customIncome.expensesByCategory.map((row) => (
                      <tr key={row.category} className="border-b border-border/60">
                        <td className="px-3 py-2 font-medium">{row.label}</td>
                        <td className="px-3 py-2 tabular-nums">{row.count}</td>
                        <td className="px-3 py-2 tabular-nums font-semibold text-danger">
                          {fmt(row.amountKzt)} ₸
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

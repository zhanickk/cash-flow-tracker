import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowLeftRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/cash-shared";
import { downloadExcelBuffer, saveExcelToDirectory } from "@/lib/daily-report";
import {
  applyPeriodPreset,
  defaultFilters,
  filterFxSales,
  type FxSalesFilters,
  useFxCurrencies,
  useFxSales,
} from "@/lib/fx-sales";
import { periodLabelFromFilters } from "@/lib/fx-sales-report";
import { useFxPurchases } from "@/lib/fx-purchases";
import {
  buildFxTradeSummary,
  buildFxTradesReportWorkbook,
  fxTradesReportFileBaseName,
} from "@/lib/fx-trades-report";

export const Route = createFileRoute("/fx-trades")({
  head: () => ({
    meta: [{ title: "Купли/продажи по валютам — Кассовый лист" }],
  }),
  component: FxTradesPage,
});

function FxTradesPage() {
  const { data: purchases = [], isLoading: purchasesLoading } = useFxPurchases();
  const { data: sales = [], isLoading: salesLoading } = useFxSales();
  const { data: currencies = [] } = useFxCurrencies();
  const isLoading = purchasesLoading || salesLoading;

  const [filters, setFilters] = useState<FxSalesFilters>(() => defaultFilters());
  const [exportBusy, setExportBusy] = useState(false);

  const filteredPurchases = useMemo(() => filterFxSales(purchases, filters), [purchases, filters]);
  const filteredSales = useMemo(() => filterFxSales(sales, filters), [sales, filters]);

  const summary = useMemo(
    () => buildFxTradeSummary(filteredPurchases, filteredSales, currencies),
    [filteredPurchases, filteredSales, currencies],
  );

  const totals = useMemo(
    () =>
      summary.reduce(
        (acc, r) => ({
          boughtKzt: acc.boughtKzt + r.boughtKzt,
          soldKzt: acc.soldKzt + r.soldKzt,
          marginKzt: acc.marginKzt + r.marginKzt,
          remainderValueKzt: acc.remainderValueKzt + r.remainderValueKzt,
        }),
        { boughtKzt: 0, soldKzt: 0, marginKzt: 0, remainderValueKzt: 0 },
      ),
    [summary],
  );

  const selectedCurrencyCodes = filters.currencies ?? [];

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

  async function handleExport() {
    setExportBusy(true);
    try {
      const buffer = await buildFxTradesReportWorkbook({
        summary,
        periodLabel: periodLabelFromFilters(filters),
      });
      const baseName = fxTradesReportFileBaseName();
      await saveExcelToDirectory(buffer, baseName);
      downloadExcelBuffer(buffer, baseName);
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-3 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <ArrowLeftRight className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-lg font-semibold">Купли/продажи по валютам</h1>
              <p className="text-xs text-muted-foreground">
                Купили X за Y ₸ / продали X за Y ₸ · остаток по среднему курсу покупки · не сбрасывается при новом дне
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={handleExport}
            disabled={exportBusy || summary.length === 0}
          >
            <Download className="h-4 w-4" />
            Excel
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-3 py-4">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Фильтры</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "Всё время"],
                  ["day", "День"],
                  ["week", "Неделя"],
                  ["month", "Месяц"],
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
                  const active =
                    selectedCurrencyCodes.length === 0 || selectedCurrencyCodes.includes(c.code);
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-xs text-muted-foreground">Куплено всего</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold tabular-nums">{fmt(totals.boughtKzt)} ₸</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-xs text-muted-foreground">Продано всего</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold tabular-nums">{fmt(totals.soldKzt)} ₸</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-xs text-muted-foreground">Остаток (по курсу покупки)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold tabular-nums">{fmt(totals.remainderValueKzt)} ₸</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-xs text-muted-foreground">Прибыль (совпавший объём)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold tabular-nums text-success">
                {fmt(totals.marginKzt)} ₸
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">По валютам · {periodLabelFromFilters(filters)}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Загрузка…</p>
            ) : summary.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Нет данных за этот период</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2">Валюта</th>
                      <th className="px-3 py-2">Куплено</th>
                      <th className="px-3 py-2">Курс покупки</th>
                      <th className="px-3 py-2">Продано</th>
                      <th className="px-3 py-2">Курс продажи</th>
                      <th className="px-3 py-2">Остаток</th>
                      <th className="px-3 py-2">Стоимость остатка</th>
                      <th className="px-3 py-2">Прибыль</th>
                      <th className="px-3 py-2">Ср. прибыль/ед.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((row) => (
                      <tr key={row.currencyCode} className="border-b border-border/60">
                        <td className="px-3 py-2 font-medium">{row.label}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {fmt(row.boughtAmount)}
                          <div className="text-xs text-muted-foreground">
                            {fmt(row.boughtKzt)} ₸
                          </div>
                        </td>
                        <td className="px-3 py-2 tabular-nums">{fmt(row.avgBuyRate, 4)}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {fmt(row.soldAmount)}
                          <div className="text-xs text-muted-foreground">{fmt(row.soldKzt)} ₸</div>
                        </td>
                        <td className="px-3 py-2 tabular-nums">{fmt(row.avgSellRate, 4)}</td>
                        <td
                          className={cn(
                            "px-3 py-2 tabular-nums font-medium",
                            row.remainderAmount > 0 && "text-primary",
                            row.remainderAmount < 0 && "text-danger",
                          )}
                        >
                          {fmt(row.remainderAmount)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{fmt(row.remainderValueKzt)} ₸</td>
                        <td className="px-3 py-2 tabular-nums font-semibold text-success">
                          {fmt(row.marginKzt)} ₸
                        </td>
                        <td className="px-3 py-2 tabular-nums">{fmt(row.avgProfitPerUnit, 4)} ₸</td>
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

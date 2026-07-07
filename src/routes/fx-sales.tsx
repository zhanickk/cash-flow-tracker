import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  Download,
  Filter,
  FolderOpen,
  Pencil,
  Plus,
  Printer,
  Trash2,
  X,
  Check,
  Wallet,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { fmt, formatAmountInput, parseAmountInput } from "@/lib/cash-shared";
import { downloadExcelBuffer, saveExcelToDirectory } from "@/lib/daily-report";
import {
  aggregateByCurrency,
  aggregateByDay,
  applyPeriodPreset,
  defaultFilters,
  filterFxSales,
  type FxSale,
  type FxSalesFilters,
  type SourceFilter,
  toDateTimeLocalInput,
  useAddFxCurrency,
  useAddFxSale,
  useDeleteFxSale,
  useFxCurrencies,
  useFxReportContacts,
  useFxSales,
  useUpdateFxSale,
} from "@/lib/fx-sales";
import {
  buildFxSalesReportWorkbook,
  fxSalesReportFileBaseName,
  periodLabelFromFilters,
} from "@/lib/fx-sales-report";
import { heldInKztSummary, useCurrencyHoldings } from "@/lib/currency-balance";
import { buildClientFxReport } from "@/lib/fx-client-report";
import {
  findRateOverride,
  useFxRateOverrides,
  useSaveFxRateOverride,
} from "@/lib/fx-rate-overrides";
import { balanceTone } from "@/lib/currency-balance";
import { TrendingUp } from "lucide-react";

export const Route = createFileRoute("/fx-sales")({
  head: () => ({
    meta: [{ title: "Продажа валют — Кассовый лист" }],
  }),
  component: FxSalesPage,
});

function parseRate(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/\s/g, "").replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function FxSalesPage() {
  const { data: sales = [], isLoading } = useFxSales();
  const { data: currencies = [] } = useFxCurrencies();
  const { data: holdingsData } = useCurrencyHoldings();
  const { data: reportContacts } = useFxReportContacts();
  const { data: rateOverrides = [] } = useFxRateOverrides();
  const saveRateOverride = useSaveFxRateOverride();
  const addSale = useAddFxSale();
  const updateSale = useUpdateFxSale();
  const deleteSale = useDeleteFxSale();
  const addCurrency = useAddFxCurrency();

  const [filters, setFilters] = useState<FxSalesFilters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);

  const [currencyCode, setCurrencyCode] = useState("USD");
  const [occurredAt, setOccurredAt] = useState(toDateTimeLocalInput(Date.now()));
  const [foreignAmount, setForeignAmount] = useState("");
  const [rate, setRate] = useState("");
  const [note, setNote] = useState("");

  const [editSale, setEditSale] = useState<FxSale | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newSymbol, setNewSymbol] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  const [saleWarning, setSaleWarning] = useState<string | null>(null);
  const [rateEditCode, setRateEditCode] = useState<string | null>(null);
  const [overrideRateInput, setOverrideRateInput] = useState("");

  const currencyLabels = useMemo(
    () => new Map(currencies.map((c) => [c.code, c.label])),
    [currencies],
  );

  const filtered = useMemo(() => filterFxSales(sales, filters), [sales, filters]);

  const rateOverrideMap = useMemo(() => {
    const map = new Map<string, number>();
    if (filters.period === "all") return map;
    let dateFrom = filters.dateFrom;
    let dateTo = filters.dateTo;
    if (filters.period !== "custom") {
      const r = applyPeriodPreset(filters.period);
      dateFrom = r.dateFrom;
      dateTo = r.dateTo;
    }
    if (!dateFrom || !dateTo) return map;
    for (const c of currencies) {
      const o = findRateOverride(rateOverrides, c.code, dateFrom, dateTo);
      if (o != null) map.set(c.code, o);
    }
    return map;
  }, [rateOverrides, filters, currencies]);

  const summary = useMemo(
    () => aggregateByCurrency(filtered, currencies, rateOverrideMap),
    [filtered, currencies, rateOverrideMap],
  );
  const daily = useMemo(() => aggregateByDay(filtered), [filtered]);
  const totalKzt = useMemo(() => summary.reduce((s, r) => s + r.kztTotal, 0), [summary]);
  const clientRows = useMemo(() => {
    if (!reportContacts) return [];
    return buildClientFxReport(reportContacts.contacts, reportContacts.txs, {
      contactId: filters.contactId || undefined,
      currencies: filters.currencies.length ? filters.currencies : undefined,
    });
  }, [reportContacts, filters.contactId, filters.currencies]);

  const heldInKzt = useMemo(
    () => heldInKztSummary(filtered, currencies),
    [filtered, currencies],
  );

  const potRemainders = useMemo(
    () =>
      (holdingsData?.cards ?? []).map((c) => ({
        currency: c.label,
        karyz: c.karyzRemainder,
        salynghan: c.salynghanRemainder,
      })),
    [holdingsData],
  );

  const previewKzt = useMemo(() => {
    const a = parseAmountInput(foreignAmount);
    const r = parseRate(rate);
    return a > 0 && r > 0 ? a * r : 0;
  }, [foreignAmount, rate]);

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
      const set = new Set(f.currencies);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      return { ...f, currencies: [...set] };
    });
  }

  function resetForm() {
    setOccurredAt(toDateTimeLocalInput(Date.now()));
    setForeignAmount("");
    setRate("");
    setNote("");
  }

  function submitSale() {
    const a = parseAmountInput(foreignAmount);
    const r = parseRate(rate);
    if (a <= 0 || r <= 0) return;
    addSale.mutate(
      {
        occurredAt: new Date(occurredAt).toISOString(),
        currencyCode,
        foreignAmount: a,
        rate: r,
        note: note.trim() || undefined,
      },
      {
        onSuccess: (res) => {
          resetForm();
          setSaleWarning(res?.warning ?? null);
        },
      },
    );
  }

  function saveRateOverrideForCurrency(code: string) {
    const rateVal = parseRate(overrideRateInput);
    if (rateVal <= 0) return;
    let dateFrom = filters.dateFrom;
    let dateTo = filters.dateTo;
    if (filters.period !== "custom" && filters.period !== "all") {
      const r = applyPeriodPreset(filters.period);
      dateFrom = r.dateFrom;
      dateTo = r.dateTo;
    }
    if (!dateFrom || !dateTo) return;
    saveRateOverride.mutate(
      {
        currencyCode: code,
        periodStart: dateFrom,
        periodEnd: dateTo,
        overrideRate: rateVal,
      },
      { onSuccess: () => setRateEditCode(null) },
    );
  }

  async function handleExport() {
    setExportBusy(true);
    try {
      const buffer = await buildFxSalesReportWorkbook({
        sales: filtered,
        summary,
        daily,
        periodLabel: periodLabelFromFilters(filters),
        currencyLabels,
        heldInKzt,
        potRemainders,
        clientRows,
      });
      const baseName = fxSalesReportFileBaseName();
      await saveExcelToDirectory(buffer, baseName);
      downloadExcelBuffer(buffer, baseName);
    } finally {
      setExportBusy(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="min-h-screen bg-background pb-16 print:bg-white">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-3 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <Banknote className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Продажа валют за тенге</h1>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Данные синхронизированы с кассой (раздел «Продажа валюты за тенге»)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1" asChild>
              <Link to="/currency-balance">
                <Wallet className="h-4 w-4" />
                Баланс валют
              </Link>
            </Button>
            <Button size="sm" variant="outline" className="gap-1" asChild>
              <Link to="/fx-risk">
                <TrendingUp className="h-4 w-4" />
                Риск
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => setShowFilters((v) => !v)}
            >
              <Filter className="h-4 w-4" />
              Фильтры
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={handlePrint}
              disabled={filtered.length === 0}
            >
              <Printer className="h-4 w-4" />
              PDF / Печать
            </Button>
            <Button
              size="sm"
              className="gap-1"
              onClick={handleExport}
              disabled={exportBusy || filtered.length === 0}
            >
              {exportBusy ? (
                <FolderOpen className="h-4 w-4 animate-pulse" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Excel
            </Button>
          </div>
        </div>
      </header>

      <main ref={printRef} className="mx-auto max-w-6xl space-y-4 px-3 py-4">
        {showFilters && (
          <Card className="print:hidden">
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
                <div className="grid gap-2 sm:grid-cols-2">
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
                <div className="mb-1.5 text-xs text-muted-foreground">Валюты</div>
                <div className="flex flex-wrap gap-1.5">
                  {currencies.map((c) => {
                    const active =
                      filters.currencies.length === 0 || filters.currencies.includes(c.code);
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
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setCurrencyOpen(true)}
                  >
                    <Plus className="h-3 w-3" />
                    Валюта
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Input
                  placeholder="Сумма ₸ от"
                  value={filters.kztMin}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, kztMin: formatAmountInput(e.target.value) }))
                  }
                />
                <Input
                  placeholder="Сумма ₸ до"
                  value={filters.kztMax}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, kztMax: formatAmountInput(e.target.value) }))
                  }
                />
                <Input
                  placeholder="Курс от"
                  value={filters.rateMin}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, rateMin: formatAmountInput(e.target.value) }))
                  }
                />
                <Input
                  placeholder="Курс до"
                  value={filters.rateMax}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, rateMax: formatAmountInput(e.target.value) }))
                  }
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">Источник (USD)</div>
                  <Select
                    value={filters.source}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, source: v as SourceFilter }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все</SelectItem>
                      <SelectItem value="karyz">Только Қарыз</SelectItem>
                      <SelectItem value="salynghan">Только Салынған</SelectItem>
                      <SelectItem value="mixed">Смешанные</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">Клиент (отчёт)</div>
                  <Select
                    value={filters.contactId || "__all__"}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, contactId: v === "__all__" ? "" : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Все клиенты" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Все клиенты</SelectItem>
                      {(reportContacts?.contacts ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {saleWarning && (
          <div className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm print:hidden">
            {saleWarning}
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader className="py-3">
              <CardTitle className="text-sm text-muted-foreground">Итого за период</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-success">
                {fmt(totalKzt)} ₸
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {filtered.length} операц. · {periodLabelFromFilters(filters)}
              </div>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Сводка по валютам</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {summary.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Нет данных</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2">Валюта</th>
                      <th className="px-3 py-2">Объём</th>
                      <th className="px-3 py-2">₸</th>
                      <th className="px-3 py-2">Ср.взв.</th>
                      <th className="px-3 py-2">Курс итог</th>
                      <th className="px-3 py-2">Оп.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((row) => (
                      <tr key={row.currencyCode} className="border-b border-border/60">
                        <td className="px-3 py-2 font-medium">{row.label}</td>
                        <td className="px-3 py-2 tabular-nums">{fmt(row.foreignTotal)}</td>
                        <td className="px-3 py-2 tabular-nums">{fmt(row.kztTotal)} ₸</td>
                        <td className="px-3 py-2 tabular-nums">{fmt(row.weightedRate, 4)}</td>
                        <td className="px-3 py-2 tabular-nums">
                          <button
                            type="button"
                            className={cn(
                              "underline-offset-2 hover:underline print:no-underline",
                              row.effectiveRate !== row.weightedRate && "font-semibold text-primary",
                            )}
                            onClick={() => {
                              setRateEditCode(row.currencyCode);
                              setOverrideRateInput(String(row.effectiveRate).replace(".", ","));
                            }}
                          >
                            {fmt(row.effectiveRate, 4)}
                          </button>
                        </td>
                        <td className="px-3 py-2 tabular-nums">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {heldInKzt.length > 0 && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Держим в тенге (за период)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2">Валюта</th>
                    <th className="px-3 py-2">Продано (валюта)</th>
                    <th className="px-3 py-2">Сумма ₸</th>
                    <th className="px-3 py-2">Оп.</th>
                  </tr>
                </thead>
                <tbody>
                  {heldInKzt.map((row) => (
                    <tr key={row.currencyCode} className="border-b border-border/60">
                      <td className="px-3 py-2 font-medium">{row.label}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(row.foreignTotal)}</td>
                      <td className="px-3 py-2 tabular-nums text-success">{fmt(row.kztTotal)} ₸</td>
                      <td className="px-3 py-2 tabular-nums">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {potRemainders.length > 0 && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Остатки котла (Қарыз / Салынған)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2">Валюта</th>
                    <th className="px-3 py-2">Остаток Қарыз</th>
                    <th className="px-3 py-2">Остаток Салынған</th>
                  </tr>
                </thead>
                <tbody>
                  {potRemainders.map((p) => (
                    <tr key={p.currency} className="border-b border-border/60">
                      <td className="px-3 py-2 font-medium">{p.currency}</td>
                      <td className={cn("px-3 py-2 tabular-nums", balanceTone(p.karyz))}>
                        {fmt(p.karyz)}
                      </td>
                      <td className={cn("px-3 py-2 tabular-nums", balanceTone(p.salynghan))}>
                        {fmt(p.salynghan)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {clientRows.length > 0 && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">
                По клиентам{filters.contactId ? "" : " (все)"}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2">Клиент</th>
                    <th className="px-3 py-2">Вал.</th>
                    <th className="px-3 py-2">Қарыз</th>
                    <th className="px-3 py-2">Салынған</th>
                    <th className="px-3 py-2">Баланс</th>
                  </tr>
                </thead>
                <tbody>
                  {clientRows.map((row) => (
                    <tr key={`${row.contactId}-${row.currency}`} className="border-b border-border/60">
                      <td className="px-3 py-2">
                        <Link
                          to="/contacts/$contactId"
                          params={{ contactId: row.contactId }}
                          className="text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{row.currency}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(row.karyzTotal)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(row.salynghanTotal)}</td>
                      <td className={cn("px-3 py-2 tabular-nums", balanceTone(row.balance))}>
                        {fmt(row.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {daily.length > 1 && (
          <Card className="print:break-inside-avoid">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Динамика продаж по дням (₸)</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{ kzt: { label: "Тенге", color: "hsl(var(--primary))" } }}
                className="h-56 w-full"
              >
                <BarChart data={daily}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={56} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="kztTotal" fill="var(--color-kzt)" radius={4} name="kzt" />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        <Card className="print:hidden">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Новая операция продажи</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <Input
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="lg:col-span-2"
              />
              <Select value={currencyCode} onValueChange={setCurrencyCode}>
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
                placeholder="Объём в валюте"
                value={foreignAmount}
                onChange={(e) => setForeignAmount(formatAmountInput(e.target.value))}
              />
              <Input
                placeholder="Курс"
                value={rate}
                onChange={(e) => setRate(formatAmountInput(e.target.value))}
              />
              <Input
                placeholder="Примечание"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="lg:col-span-2"
              />
            </div>
            {previewKzt > 0 && (
              <div className="rounded-md bg-muted px-3 py-2 text-sm">
                Сумма в тенге:{" "}
                <span className="font-semibold tabular-nums">{fmt(previewKzt)} ₸</span>
              </div>
            )}
            <Button
              className="gap-1 bg-success text-success-foreground hover:bg-success/90"
              onClick={submitSale}
              disabled={addSale.isPending}
            >
              <Plus className="h-4 w-4" />
              Добавить продажу
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">
              Операции ({filtered.length}
              {filtered.length !== sales.length ? ` из ${sales.length}` : ""})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Загрузка…</p>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Операций не найдено</p>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((s) => (
                  <SaleRow
                    key={s.id}
                    sale={s}
                    label={currencyLabels.get(s.currencyCode) ?? s.currencyCode}
                    onEdit={() => setEditSale(s)}
                    onDelete={() => deleteSale.mutate(s)}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>

      {editSale && (
        <EditSaleDialog
          sale={editSale}
          currencies={currencies}
          open={!!editSale}
          onOpenChange={(v) => !v && setEditSale(null)}
          onSave={(patch) => {
            updateSale.mutate(
              { id: editSale.id, old: editSale, patch },
              { onSuccess: () => setEditSale(null) },
            );
          }}
        />
      )}

      <Dialog open={currencyOpen} onOpenChange={setCurrencyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая валюта</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              placeholder="Код (USD, AED…)"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            />
            <Input
              placeholder="Название"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <Input
              placeholder="Символ (опционально)"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={!newCode.trim() || !newLabel.trim() || addCurrency.isPending}
              onClick={() => {
                addCurrency.mutate(
                  { code: newCode, label: newLabel, symbol: newSymbol || undefined },
                  {
                    onSuccess: (code) => {
                      setCurrencyCode(code);
                      setCurrencyOpen(false);
                      setNewCode("");
                      setNewLabel("");
                      setNewSymbol("");
                    },
                  },
                );
              }}
            >
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {rateEditCode && (
        <Dialog open={!!rateEditCode} onOpenChange={(v) => !v && setRateEditCode(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Курс итог за период — {rateEditCode}</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              Средневзвешенный курс считается автоматически. Здесь можно задать ручную корректировку
              для отчёта за выбранный период.
            </p>
            <Input
              placeholder="Курс"
              value={overrideRateInput}
              onChange={(e) => setOverrideRateInput(formatAmountInput(e.target.value))}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setRateEditCode(null)}>
                Отмена
              </Button>
              <Button onClick={() => saveRateOverrideForCurrency(rateEditCode)}>Сохранить</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          main, main * { visibility: visible; }
          main { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function SaleRow({
  sale,
  label,
  onEdit,
  onDelete,
}: {
  sale: FxSale;
  label: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const d = new Date(sale.occurredAt);
  return (
    <li className="group flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
      <span className="w-28 shrink-0 tabular-nums text-xs text-muted-foreground">
        {d.toLocaleDateString("ru-RU")} {d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{label}</span>
      <span className="min-w-0 flex-1 tabular-nums">
        {fmt(sale.foreignAmount)} × {fmt(sale.rate, 4)} ={" "}
        <span className="font-semibold text-success">{fmt(sale.kztAmount)} ₸</span>
      </span>
      {sale.note && (
        <span className="max-w-[200px] truncate text-xs text-muted-foreground">{sale.note}</span>
      )}
      {sale.allocationLabel && (
        <span className="w-full text-[10px] text-muted-foreground">{sale.allocationLabel}</span>
      )}
      <div className="ml-auto flex gap-1 opacity-60 group-hover:opacity-100 print:hidden">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-danger">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить операцию?</AlertDialogTitle>
              <AlertDialogDescription>
                {fmt(sale.foreignAmount)} {sale.currencyCode} → {fmt(sale.kztAmount)} ₸
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Удалить</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

function EditSaleDialog({
  sale,
  currencies,
  open,
  onOpenChange,
  onSave,
}: {
  sale: FxSale;
  currencies: { code: string; label: string }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (patch: {
    occurredAt: string;
    currencyCode: string;
    foreignAmount: number;
    rate: number;
    note: string | null;
  }) => void;
}) {
  const [occurredAt, setOccurredAt] = useState(toDateTimeLocalInput(sale.occurredAt));
  const [currencyCode, setCurrencyCode] = useState(sale.currencyCode);
  const [foreignAmount, setForeignAmount] = useState(String(sale.foreignAmount).replace(".", ","));
  const [rate, setRate] = useState(String(sale.rate).replace(".", ","));
  const [note, setNote] = useState(sale.note ?? "");

  const preview =
    parseAmountInput(foreignAmount) * parseRate(rate.replace(",", "."));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Редактировать продажу</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          <Select value={currencyCode} onValueChange={setCurrencyCode}>
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
            value={foreignAmount}
            onChange={(e) => setForeignAmount(formatAmountInput(e.target.value))}
          />
          <Input
            placeholder="Курс"
            value={rate}
            onChange={(e) => setRate(formatAmountInput(e.target.value))}
          />
          <Input placeholder="Примечание" value={note} onChange={(e) => setNote(e.target.value)} />
          {preview > 0 && (
            <p className="text-sm text-muted-foreground">
              Итого: <span className="font-semibold text-foreground">{fmt(preview)} ₸</span>
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
          <Button
            className="gap-1 bg-success text-success-foreground"
            onClick={() =>
              onSave({
                occurredAt: new Date(occurredAt).toISOString(),
                currencyCode,
                foreignAmount: parseAmountInput(foreignAmount),
                rate: parseRate(rate),
                note: note.trim() || null,
              })
            }
          >
            <Check className="h-4 w-4" />
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

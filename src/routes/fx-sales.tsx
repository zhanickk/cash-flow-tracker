import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  Download,
  Pencil,
  Plus,
  Trash2,
  X,
  Check,
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
import { cn } from "@/lib/utils";
import { fmt, formatAmountInput, parseAmountInput } from "@/lib/cash-shared";
import { downloadExcelBuffer, saveExcelToDirectory } from "@/lib/daily-report";
import {
  aggregateByCurrency,
  applyPeriodPreset,
  defaultFilters,
  filterFxSales,
  type FxSale,
  type FxSalesFilters,
  toDateTimeLocalInput,
  useAddFxCurrency,
  useAddFxSale,
  useDeleteFxSale,
  useFxCurrencies,
  useFxSales,
  useUpdateFxSale,
} from "@/lib/fx-sales";
import {
  buildFxSalesReportWorkbook,
  fxSalesReportFileBaseName,
  periodLabelFromFilters,
} from "@/lib/fx-sales-report";

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
  const addSale = useAddFxSale();
  const updateSale = useUpdateFxSale();
  const deleteSale = useDeleteFxSale();
  const addCurrency = useAddFxCurrency();

  const [filters, setFilters] = useState<FxSalesFilters>(() => defaultFilters());
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

  const currencyLabels = useMemo(
    () => new Map(currencies.map((c) => [c.code, c.label])),
    [currencies],
  );

  const filtered = useMemo(() => filterFxSales(sales, filters), [sales, filters]);
  const summary = useMemo(
    () => aggregateByCurrency(filtered, currencies),
    [filtered, currencies],
  );
  const totalKzt = useMemo(() => summary.reduce((s, r) => s + r.kztTotal, 0), [summary]);

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
        onSuccess: () => {
          setForeignAmount("");
          setRate("");
          setNote("");
        },
      },
    );
  }

  async function handleExport() {
    setExportBusy(true);
    try {
      const buffer = await buildFxSalesReportWorkbook({
        sales: filtered,
        summary,
        periodLabel: periodLabelFromFilters(filters),
        currencyLabels,
      });
      const baseName = fxSalesReportFileBaseName();
      await saveExcelToDirectory(buffer, baseName);
      downloadExcelBuffer(buffer, baseName);
    } finally {
      setExportBusy(false);
    }
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
            <Banknote className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-lg font-semibold">Продажа валют</h1>
              <p className="text-xs text-muted-foreground">
                Журнал продаж · синхрон с кассой · не сбрасывается при новом дне
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={handleExport}
            disabled={exportBusy || filtered.length === 0}
          >
            <Download className="h-4 w-4" />
            Excel
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-3 py-4">
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
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm text-muted-foreground">Общая сумма продаж</CardTitle>
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
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">По валютам</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {summary.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Нет данных</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2">Валюта</th>
                      <th className="px-3 py-2">Продано</th>
                      <th className="px-3 py-2">Курс</th>
                      <th className="px-3 py-2">₸</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((row) => (
                      <tr key={row.currencyCode} className="border-b border-border/60">
                        <td className="px-3 py-2 font-medium">{row.label}</td>
                        <td className="px-3 py-2 tabular-nums">{fmt(row.foreignTotal)}</td>
                        <td className="px-3 py-2 tabular-nums">{fmt(row.weightedRate, 4)}</td>
                        <td className="px-3 py-2 tabular-nums font-semibold text-success">
                          {fmt(row.kztTotal)} ₸
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Новая продажа (→ касса + журнал)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
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
                placeholder="Объём"
                value={foreignAmount}
                onChange={(e) => setForeignAmount(formatAmountInput(e.target.value))}
              />
              <Input
                placeholder="Курс"
                value={rate}
                onChange={(e) => setRate(formatAmountInput(e.target.value))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Примечание"
                value={note}
                onChange={(e) => setNote(e.target.value)}
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
                <Plus className="h-4 w-4" />
                Добавить
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">
              Операции ({filtered.length}
              {filtered.length !== sales.length ? ` из ${sales.length}` : ""})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Изменения в кассе (продажа) синхронизируются сюда автоматически. Редактирование
              здесь меняет только журнал, не кассу.
            </p>
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
              placeholder="Код (USD, EUR…)"
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
        {d.toLocaleDateString("ru-RU")}{" "}
        {d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{label}</span>
      <span className="min-w-0 flex-1 tabular-nums">
        {fmt(sale.foreignAmount)} × {fmt(sale.rate, 4)} ={" "}
        <span className="font-semibold text-success">{fmt(sale.kztAmount)} ₸</span>
      </span>
      {sale.note && (
        <span className="max-w-[200px] truncate text-xs text-muted-foreground">{sale.note}</span>
      )}
      <div className="ml-auto flex gap-1 opacity-60 group-hover:opacity-100">
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
              <AlertDialogTitle>Удалить из журнала?</AlertDialogTitle>
              <AlertDialogDescription>
                Запись будет удалена только из этого модуля. Касса и контакты не изменятся.
                <br />
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

  const preview = parseAmountInput(foreignAmount) * parseRate(rate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Редактировать (только журнал)</DialogTitle>
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

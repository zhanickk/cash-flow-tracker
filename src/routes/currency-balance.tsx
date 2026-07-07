import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  Banknote,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fmt, formatAmountInput, parseAmountInput } from "@/lib/cash-shared";
import {
  balanceTone,
  type CurrencyHoldingCard,
  useCurrencyHoldings,
  useSaveCurrencyHolding,
} from "@/lib/currency-balance";
import {
  toDateTimeLocalInput,
  useAddFxSale,
  useFxCurrencies,
} from "@/lib/fx-sales";

export const Route = createFileRoute("/currency-balance")({
  head: () => ({
    meta: [{ title: "Баланс чужих валют — Кассовый лист" }],
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
  const saveHolding = useSaveCurrencyHolding();
  const addSale = useAddFxSale();

  const [setupOpen, setSetupOpen] = useState(false);
  const [editCard, setEditCard] = useState<CurrencyHoldingCard | null>(null);
  const [newCode, setNewCode] = useState("USD");
  const [expanded, setExpanded] = useState<string | null>(null);

  const [saleCurrency, setSaleCurrency] = useState("USD");
  const [saleAmount, setSaleAmount] = useState("");
  const [saleRate, setSaleRate] = useState("");
  const [saleNote, setSaleNote] = useState("");
  const [saleAt, setSaleAt] = useState(toDateTimeLocalInput(Date.now()));

  const cards = data?.cards ?? [];
  const totalKztAllTime = useMemo(
    () => cards.reduce((s, c) => s + c.soldKztTotal, 0),
    [cards],
  );
  const totalBalanceForeign = useMemo(
    () => cards.reduce((s, c) => s + Math.max(0, c.balance), 0),
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
        onSuccess: () => {
          setSaleAmount("");
          setSaleRate("");
          setSaleNote("");
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
                <h1 className="text-lg font-semibold">Баланс чужих валют</h1>
                <p className="text-xs text-muted-foreground">
                  Продажи синхронизированы с кассой · Остаток = Получено − Долг − Продано
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1" asChild>
                <Link to="/fx-sales">
                  <Banknote className="h-4 w-4" />
                  Отчёты по продажам
                </Link>
              </Button>
              <Button size="sm" className="gap-1" onClick={() => setSetupOpen(true)}>
                <Plus className="h-4 w-4" />
                Карточка валюты
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-3 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm text-muted-foreground">Держим в тенге (все продажи)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-success">{fmt(totalKztAllTime)} ₸</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm text-muted-foreground">Незакрытый остаток (суммарно)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold tabular-nums", balanceTone(totalBalanceForeign))}>
                {fmt(totalBalanceForeign)} <span className="text-sm font-normal text-muted-foreground">ед.</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">По всем валютам, в единицах валюты</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Быстрая продажа (→ касса + отчёт)</CardTitle>
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
          </CardContent>
        </Card>

        {isLoading && <p className="text-center text-sm text-muted-foreground">Загрузка…</p>}
        {!isLoading && cards.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Нет карточек валют. Нажмите «Карточка валюты», укажите сколько получено и долг.
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {cards.map((card) => (
            <Card key={card.currencyCode}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 py-3">
                <div>
                  <CardTitle className="text-base">{card.label}</CardTitle>
                  <div className="text-xs text-muted-foreground">{card.currencyCode}</div>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditCard(card)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-muted/60 p-2">
                    <div className="text-[11px] text-muted-foreground">Всего получено</div>
                    <div className="font-semibold tabular-nums">{fmt(card.totalReceived)}</div>
                  </div>
                  <div className="rounded-md bg-muted/60 p-2">
                    <div className="text-[11px] text-muted-foreground">Долг</div>
                    <div className="font-semibold tabular-nums text-danger">{fmt(card.debtAmount)}</div>
                  </div>
                  <div className="rounded-md bg-muted/60 p-2">
                    <div className="text-[11px] text-muted-foreground">Продано</div>
                    <div className="font-semibold tabular-nums">{fmt(card.soldForeign)}</div>
                  </div>
                  <div className="rounded-md border-2 border-primary/30 bg-primary/5 p-2">
                    <div className="text-[11px] text-muted-foreground">Остаток</div>
                    <div className={cn("text-lg font-bold tabular-nums", balanceTone(card.balance))}>
                      {fmt(card.balance)}
                    </div>
                  </div>
                </div>
                <div className="rounded-md bg-success-soft px-3 py-2 text-sm">
                  <span className="text-muted-foreground">В тенге от продаж: </span>
                  <span className="font-semibold tabular-nums text-success">{fmt(card.soldKztTotal)} ₸</span>
                </div>
                {card.note && <p className="text-xs text-muted-foreground">{card.note}</p>}

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
                        <li key={s.id} className="flex justify-between gap-2 tabular-nums">
                          <span className="text-muted-foreground">
                            {d.toLocaleDateString("ru-RU")}{" "}
                            {d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span>
                            {fmt(s.foreignAmount)} × {fmt(s.rate, 4)} ={" "}
                            <span className="font-medium text-success">{fmt(s.kztAmount)} ₸</span>
                          </span>
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

      <HoldingDialog
        key="setup"
        open={setupOpen}
        onOpenChange={setSetupOpen}
        title="Новая карточка валюты"
        currencyCode={newCode}
        onCurrencyChange={setNewCode}
        currencies={currencies}
        totalReceived=""
        debtAmount=""
        note=""
        onSave={(v) => {
          saveHolding.mutate(v, { onSuccess: () => setSetupOpen(false) });
        }}
        allowCurrencyPick
      />

      {editCard && (
        <HoldingDialog
          key={editCard.currencyCode}
          open={!!editCard}
          onOpenChange={(v) => !v && setEditCard(null)}
          title={`Карточка: ${editCard.label}`}
          currencyCode={editCard.currencyCode}
          currencies={currencies}
          totalReceived={String(editCard.totalReceived).replace(".", ",")}
          debtAmount={String(editCard.debtAmount).replace(".", ",")}
          note={editCard.note ?? ""}
          onSave={(v) => {
            saveHolding.mutate(v, { onSuccess: () => setEditCard(null) });
          }}
        />
      )}
    </div>
  );
}

function HoldingDialog({
  open,
  onOpenChange,
  title,
  currencyCode,
  onCurrencyChange,
  currencies,
  totalReceived: initialReceived,
  debtAmount: initialDebt,
  note: initialNote,
  onSave,
  allowCurrencyPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  currencyCode: string;
  onCurrencyChange?: (v: string) => void;
  currencies: { code: string; label: string }[];
  totalReceived: string;
  debtAmount: string;
  note: string;
  onSave: (v: {
    currencyCode: string;
    totalReceived: number;
    debtAmount: number;
    note?: string;
  }) => void;
  allowCurrencyPick?: boolean;
}) {
  const [received, setReceived] = useState(initialReceived);
  const [debt, setDebt] = useState(initialDebt);
  const [note, setNote] = useState(initialNote);

  useEffect(() => {
    if (open) {
      setReceived(initialReceived);
      setDebt(initialDebt);
      setNote(initialNote);
    }
  }, [open, initialReceived, initialDebt, initialNote]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {allowCurrencyPick && onCurrencyChange && (
            <Select value={currencyCode} onValueChange={onCurrencyChange}>
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
          )}
          <Input
            placeholder="Всего получено (в валюте)"
            value={received}
            onChange={(e) => setReceived(formatAmountInput(e.target.value))}
          />
          <Input
            placeholder="Сумма долга (в валюте)"
            value={debt}
            onChange={(e) => setDebt(formatAmountInput(e.target.value))}
          />
          <Input placeholder="Примечание" value={note} onChange={(e) => setNote(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Продажи подтягиваются из кассы автоматически. Остаток пересчитается после сохранения.
          </p>
        </div>
        <DialogFooter>
          <Button
            onClick={() =>
              onSave({
                currencyCode,
                totalReceived: parseAmountInput(received),
                debtAmount: parseAmountInput(debt),
                note: note.trim() || undefined,
              })
            }
          >
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

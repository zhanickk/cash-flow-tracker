import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CURRENCIES, formatAmountInput, parseAmountInput, type Currency } from "@/lib/cash-shared";
import { ArrowLeft, ArrowLeftRight, ArrowRight, ChevronDown, Minus, Plus } from "lucide-react";
import {
  fmtAmount,
  fmtDateTime,
  fmtUsd,
  useAddContactConversion,
  useAddContactTransaction,
  useContactConversions,
  useContactDetail,
  useDeleteContactConversion,
  useDeleteContactTransaction,
} from "@/lib/contacts";
import { Trash2 } from "lucide-react";
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
import { buttonVariants } from "@/components/ui/button";
import { balanceTone, fmtContactBalance, currencyLabel } from "@/lib/contact-currencies";

const OPS_PREVIEW = 10;

export const Route = createFileRoute("/contacts/$contactId")({
  head: () => ({
    meta: [{ title: "Контакт — Кассовый лист" }],
  }),
  component: ContactDetailPage,
});

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function fmtTxAmount(currency: string, amount: number) {
  if (currency === "KZT") return fmtAmount(amount) + " ₸";
  if (currency === "USD") return fmtUsd(amount);
  return fmtContactBalance(currency, amount);
}

function ContactDetailPage() {
  const { contactId } = Route.useParams();
  const { data, isLoading } = useContactDetail(contactId);
  const addTx = useAddContactTransaction();
  const deleteTx = useDeleteContactTransaction();
  const { data: conversions = [] } = useContactConversions(contactId);
  const addConversion = useAddContactConversion();
  const deleteConversion = useDeleteContactConversion();

  const [currency, setCurrency] = useState<Currency>("KZT");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [showAllOps, setShowAllOps] = useState(false);

  const [fromCurrency, setFromCurrency] = useState<"KZT" | "USD">("KZT");
  const [convAmount, setConvAmount] = useState("");
  const [convRate, setConvRate] = useState("");
  const [convConfirmOpen, setConvConfirmOpen] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background p-4">
        <p className="text-center text-sm text-muted-foreground">Загрузка…</p>
      </div>
    );
  }

  const { contact, transactions, balances, activeCurrencies } = data;

  const visibleOps = showAllOps ? transactions : transactions.slice(0, OPS_PREVIEW);
  const hiddenOpsCount = Math.max(0, transactions.length - OPS_PREVIEW);

  const submit = () => {
    const raw = parseAmountInput(amount);
    if (!raw) return;
    const n = direction === "in" ? Math.abs(raw) : -Math.abs(raw);
    addTx.mutate({ contactId: contact.id, currency, amount: n, note: note.trim() || undefined });
    setAmount("");
    setNote("");
  };

  const toCurrency: "KZT" | "USD" = fromCurrency === "KZT" ? "USD" : "KZT";
  const convAmountNum = parseAmountInput(convAmount);
  const convRateNum = parseAmountInput(convRate);
  const convValid = convAmountNum > 0 && convRateNum > 0;
  const convToAmount = convValid
    ? fromCurrency === "USD"
      ? convAmountNum * convRateNum
      : convAmountNum / convRateNum
    : 0;
  const fmtSide = (cur: "KZT" | "USD", n: number) =>
    !isFinite(n)
      ? "—"
      : cur === "KZT"
        ? `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₸`
        : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

  const submitConversion = () => {
    if (!convValid) return;
    addConversion.mutate({
      contactId: contact.id,
      fromCurrency,
      toCurrency,
      fromAmount: convAmountNum,
      toAmount: convToAmount,
      rate: convRateNum,
    });
    setConvConfirmOpen(false);
    setConvAmount("");
    setConvRate("");
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-3 py-3">
          <Link to="/contacts" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {initials(contact.name)}
          </div>
          <div className="text-lg font-semibold">{contact.name}</div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-3 py-4">
        {activeCurrencies.length === 0 ? (
          <div className="mb-3 rounded-lg border border-dashed border-border bg-card p-4 text-center text-sm text-muted-foreground">
            Нет открытых счетов — добавьте операцию в любой валюте
          </div>
        ) : (
          <div
            className={cn(
              "mb-3 grid gap-2",
              activeCurrencies.length === 1
                ? "grid-cols-1"
                : activeCurrencies.length === 2
                  ? "grid-cols-2"
                  : "grid-cols-2 sm:grid-cols-3",
            )}
          >
            {activeCurrencies.map((code) => {
              const value = balances[code] ?? 0;
              return (
                <div key={code} className="rounded-lg border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">{currencyLabel(code)}</div>
                  <div className={cn("text-xl font-semibold tabular-nums", balanceTone(value))}>
                    {fmtContactBalance(code, value)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mb-4 rounded-lg border-2 border-convert/40 bg-convert-soft p-3">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-convert">
            <ArrowLeftRight className="h-4 w-4" />
            Конвертация (KZT ↔ USD)
          </div>
          <div className="mb-2 flex items-center gap-2">
            <div className="flex-1 rounded-md border border-input bg-card px-3 py-2 text-sm">
              <div className="text-[11px] text-muted-foreground">Из</div>
              <div className="font-medium">{fromCurrency === "KZT" ? "Тенге" : "USD"}</div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0 bg-card"
              onClick={() => setFromCurrency(toCurrency)}
            >
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
            <div className="flex-1 rounded-md border border-input bg-card px-3 py-2 text-sm">
              <div className="text-[11px] text-muted-foreground">В</div>
              <div className="font-medium">{toCurrency === "KZT" ? "Тенге" : "USD"}</div>
            </div>
          </div>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1 text-[11px] text-muted-foreground">
                Сумма ({fromCurrency === "KZT" ? "₸" : "$"})
              </div>
              <Input
                className="bg-card"
                value={convAmount}
                onChange={(e) => setConvAmount(formatAmountInput(e.target.value))}
                placeholder="0"
              />
            </div>
            <div>
              <div className="mb-1 text-[11px] text-muted-foreground">Курс (₸ за $1)</div>
              <Input
                className="bg-card"
                value={convRate}
                onChange={(e) => setConvRate(formatAmountInput(e.target.value))}
                placeholder="0"
              />
            </div>
          </div>
          <div className="mb-2 flex items-center justify-center gap-2 rounded-lg bg-card px-3 py-2 text-sm">
            <span className="font-medium tabular-nums">
              {convAmountNum > 0 ? fmtSide(fromCurrency, convAmountNum) : "—"}
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium tabular-nums">
              {convValid ? fmtSide(toCurrency, convToAmount) : "—"}
            </span>
          </div>
          <Button
            disabled={!convValid}
            onClick={() => setConvConfirmOpen(true)}
            className="w-full gap-1 bg-convert text-convert-foreground hover:bg-convert/90"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Конвертировать
          </Button>

          <AlertDialog open={convConfirmOpen} onOpenChange={setConvConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Подтвердить конвертацию?</AlertDialogTitle>
                <AlertDialogDescription>
                  {contact.name}: {convValid ? fmtSide(fromCurrency, convAmountNum) : "—"} →{" "}
                  {convValid ? fmtSide(toCurrency, convToAmount) : "—"}
                  {convValid ? ` по курсу ${convRateNum.toLocaleString("ru-RU")}` : ""}. Счёт «
                  {fromCurrency === "KZT" ? "Тенге" : "USD"}» уменьшится, счёт «
                  {toCurrency === "KZT" ? "Тенге" : "USD"}» увеличится.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction onClick={submitConversion}>Конвертировать</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="mb-4 rounded-lg border border-border bg-card p-3">
          <div className="mb-2 text-sm font-medium">Новая операция</div>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDirection("in")}
              className={cn(
                "gap-1.5 border-2",
                direction === "in"
                  ? "border-success bg-success text-success-foreground hover:bg-success/90"
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              <Plus className="h-4 w-4" />
              Внёс
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDirection("out")}
              className={cn(
                "gap-1.5 border-2",
                direction === "out"
                  ? "border-danger bg-danger text-danger-foreground hover:bg-danger/90"
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              <Minus className="h-4 w-4" />
              Забрал
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[0.8fr_1.4fr_1.2fr_auto]">
            <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Сумма"
              inputMode="decimal"
              className="min-w-0"
              value={amount}
              onChange={(e) => setAmount(formatAmountInput(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <Input
              placeholder="Комментарий"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <Button
              onClick={submit}
              className={cn(
                "gap-1",
                direction === "in"
                  ? "bg-success text-success-foreground hover:bg-success/90"
                  : "bg-danger text-danger-foreground hover:bg-danger/90",
              )}
            >
              {direction === "in" ? (
                <Plus className="h-4 w-4" />
              ) : (
                <Minus className="h-4 w-4" />
              )}
              Добавить
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {direction === "in"
              ? "Внёс — открывает или пополняет счёт в выбранной валюте"
              : "Забрал — уменьшает счёт; при нуле счёт закрывается, операция остаётся в истории"}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">
            Операции
            {transactions.length > 0 && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                ({transactions.length})
              </span>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {transactions.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">Операций пока нет</p>
          )}
          {visibleOps.map((t) => (
            <div
              key={t.id}
              className={cn(
                "group flex items-center justify-between gap-3 px-3 py-2",
                t.source === "excel_import" && "bg-success-soft",
              )}
              title={t.source === "excel_import" ? "Сверка из Excel" : undefined}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{fmtDateTime(t.occurred_at)}</span>
                  <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium">
                    {t.currency}
                  </span>
                  {t.source === "excel_import" && (
                    <span className="rounded bg-success px-1 py-0.5 text-[9px] font-semibold uppercase text-success-foreground">
                      Excel
                    </span>
                  )}
                </div>
                {t.note && <div className="truncate text-xs text-muted-foreground">{t.note}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div
                  className={cn(
                    "text-sm font-medium tabular-nums",
                    balanceTone(Number(t.amount)),
                  )}
                >
                  {fmtTxAmount(t.currency, Number(t.amount))}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-danger opacity-60 hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Удалить операцию?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {fmtDateTime(t.occurred_at)} · {fmtTxAmount(t.currency, Number(t.amount))}
                        {t.note ? ` · ${t.note}` : ""}. Действие необратимо.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteTx.mutate(t.id)}
                        className={buttonVariants({ variant: "destructive" })}
                      >
                        Удалить
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
        {!showAllOps && hiddenOpsCount > 0 && (
          <Button
            variant="outline"
            className="mt-2 w-full gap-2"
            onClick={() => setShowAllOps(true)}
          >
            <ChevronDown className="h-4 w-4" />
            Просмотреть все операции (+{hiddenOpsCount})
          </Button>
        )}
        {showAllOps && transactions.length > OPS_PREVIEW && (
          <Button
            variant="ghost"
            className="mt-2 w-full text-xs text-muted-foreground"
            onClick={() => setShowAllOps(false)}
          >
            Свернуть
          </Button>
        )}

        <div className="mt-4 text-sm font-medium">История конвертаций</div>
        <div className="mt-2 flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {conversions.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">Конвертаций пока нет</p>
          )}
          {conversions.map((cv) => (
            <div key={cv.id} className="group flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0 text-xs text-muted-foreground">{fmtDateTime(cv.created_at)}</div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="tabular-nums">
                    {cv.from_currency === "KZT"
                      ? `${Number(cv.from_amount).toLocaleString("ru-RU")} ₸`
                      : `$${Number(cv.from_amount).toLocaleString("en-US")}`}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium tabular-nums">
                    {cv.to_currency === "KZT"
                      ? `${Number(cv.to_amount).toLocaleString("ru-RU")} ₸`
                      : `$${Number(cv.to_amount).toLocaleString("en-US")}`}
                  </span>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-danger opacity-60 hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Удалить конвертацию?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {fmtDateTime(cv.created_at)} ·{" "}
                        {cv.from_currency === "KZT"
                          ? `${Number(cv.from_amount).toLocaleString("ru-RU")} ₸`
                          : `$${Number(cv.from_amount).toLocaleString("en-US")}`}{" "}
                        →{" "}
                        {cv.to_currency === "KZT"
                          ? `${Number(cv.to_amount).toLocaleString("ru-RU")} ₸`
                          : `$${Number(cv.to_amount).toLocaleString("en-US")}`}
                        . Обе связанные проводки будут удалены, баланс пересчитается. Действие
                        необратимо.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteConversion.mutate(cv.id)}
                        className={buttonVariants({ variant: "destructive" })}
                      >
                        Удалить
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, History, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fmt, txLabel, type Transaction } from "@/lib/cash-shared";
import { useArchivedDays, useCashTransactions } from "@/lib/cash-register";
import {
  BuyCard,
  ExpenseCategoryCard,
  ExpensePersonCard,
  IncomeCard,
  OpeningCard,
  SellCard,
} from "@/routes/index";
import { useContactsWithBalances } from "@/lib/contacts";
import { CURRENCIES, type Currency } from "@/lib/cash-shared";
import { supabase } from "@/integrations/supabase/client";
import { useMoneySpendLog } from "@/lib/people-money-spend-log";
import { formatDateKeyRu, useSessionDate } from "@/lib/session-date";
import {
  applyChain,
  currentChain,
  logPastDayEdit,
  previewChain,
  type DayIncome,
} from "@/lib/past-day-recalc";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/archive")({
  head: () => ({ meta: [{ title: "Архив смен — Кассовый лист" }] }),
  component: ArchivePage,
});

const EDIT_PIN = "0000";

/** Правка операции прошлой смены. Перед сохранением показывается, что именно
 * меняется и как это сдвинет доход последующих дней. */
interface PendingEdit {
  tx: Transaction;
  kind: "update" | "delete" | "insert";
  patch?: Partial<Transaction>;
}

function ArchivePage() {
  const qc = useQueryClient();
  const { data: days = [] } = useArchivedDays();
  const { data: currentDate } = useSessionDate();
  const { data: log = [] } = useMoneySpendLog();

  const [openDate, setOpenDate] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  const [pending, setPending] = useState<PendingEdit | null>(null);
  const [preview, setPreview] = useState<{ before: Record<string, number>; after: DayIncome[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: dayTxs = [] } = useCashTransactions(openDate ?? undefined);
  const { data: contacts = [] } = useContactsWithBalances();
  const contactMap = useMemo(() => {
    const m = new Map<string, (typeof contacts)[number]>();
    for (const c of contacts) m.set(c.name.trim().toLowerCase(), c);
    return m;
  }, [contacts]);

  const byKind = (kind: Transaction["kind"]) => dayTxs.filter((t) => t.kind === kind);

  /** Остатки того дня — та же арифметика, что в кассе. */
  const dayTotals = useMemo(() => {
    const t: Record<Currency, number> = { KZT: 0, USD: 0, EUR: 0, GBP: 0, RUB: 0, KGS: 0, CNY: 0, GOLD: 0 };
    for (const tx of dayTxs) {
      const r = tx.rate || 0;
      if (tx.kind === "opening" || tx.kind === "income") t[tx.currency] += tx.amount;
      else if (tx.kind === "expense") t[tx.currency] -= tx.amount;
      else if (tx.kind === "buy") { t[tx.currency] += tx.amount; t.KZT -= tx.amount * r; }
      else if (tx.kind === "sell") { t[tx.currency] -= tx.amount; t.KZT += tx.amount * r; }
    }
    return t;
  }, [dayTxs]);

  /** В архиве всё меняется только через подтверждение: модули кассы вызывают
   * эти обработчики, а те не пишут сразу, а готовят предпросмотр. */
  function guard(): boolean {
    if (!editMode) {
      setPinOpen(true);
      return false;
    }
    return true;
  }

  async function addTx(tx: Omit<Transaction, "id" | "ts"> & { id?: string }) {
    if (!guard() || !openDate) return;
    await stageEdit({
      tx: { ...tx, id: tx.id ?? crypto.randomUUID(), ts: Date.parse(`${openDate}T12:00:00`) } as Transaction,
      kind: "insert",
    });
  }

  async function updateTx(id: string, patch: Partial<Transaction>) {
    if (!guard()) return;
    const tx = dayTxs.find((t) => t.id === id);
    if (!tx) return;
    await stageEdit({ tx, kind: "update", patch: patch as PendingEdit["patch"] });
  }

  async function deleteTx(id: string) {
    if (!guard()) return;
    const tx = dayTxs.find((t) => t.id === id);
    if (!tx) return;
    await stageEdit({ tx, kind: "delete" });
  }

  // Архив — только закрытые смены: текущую правят на главной странице.
  const archivedDays = useMemo(
    () => days.filter((d) => d !== currentDate),
    [days, currentDate],
  );

  const incomeByDate = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of log) {
      if (!e.businessDate) continue;
      m[e.businessDate] = (m[e.businessDate] ?? 0) + e.incomeKzt;
    }
    return m;
  }, [log]);

  function tryUnlock() {
    if (pin !== EDIT_PIN) {
      setPinError("Неверный PIN");
      return;
    }
    setEditMode(true);
    setPinOpen(false);
    setPin("");
    setPinError("");
  }

  /** Готовит правку: считает цепочку до и после, ничего пока не записывая. */
  async function stageEdit(edit: PendingEdit) {
    if (!openDate) return;
    setBusy(true);
    try {
      const before = await currentChain(openDate);
      // Считаем «как станет» на копии: временно применяем правку, снимаем
      // прогноз и сразу откатываем — записываем только после подтверждения.
      await applyTxChange(edit);
      const after = await previewChain(openDate);
      await revertTxChange(edit);
      setPending(edit);
      setPreview({ before, after });
    } finally {
      setBusy(false);
    }
  }

  async function applyTxChange(edit: PendingEdit) {
    if (edit.kind === "insert") {
      await supabase.from("cash_transactions").insert({
        id: edit.tx.id,
        kind: edit.tx.kind,
        currency: edit.tx.currency,
        amount: edit.tx.amount,
        rate: edit.tx.rate ?? null,
        name: edit.tx.name ?? null,
        expense_type: edit.tx.expenseType ?? null,
        business_date: openDate,
        ts: new Date(edit.tx.ts).toISOString(),
      });
    } else if (edit.kind === "delete") {
      await supabase.from("cash_transactions").delete().eq("id", edit.tx.id);
    } else if (edit.patch) {
      await supabase
        .from("cash_transactions")
        .update({
          amount: edit.patch.amount ?? edit.tx.amount,
          rate: edit.patch.rate ?? edit.tx.rate ?? null,
          name: edit.patch.name ?? edit.tx.name ?? null,
        })
        .eq("id", edit.tx.id);
    }
  }

  async function revertTxChange(edit: PendingEdit) {
    if (edit.kind === "insert") {
      await supabase.from("cash_transactions").delete().eq("id", edit.tx.id);
    } else if (edit.kind === "delete") {
      await supabase.from("cash_transactions").insert({
        id: edit.tx.id,
        kind: edit.tx.kind,
        currency: edit.tx.currency,
        amount: edit.tx.amount,
        rate: edit.tx.rate ?? null,
        name: edit.tx.name ?? null,
        expense_type: edit.tx.expenseType ?? null,
        business_date: openDate,
        ts: new Date(edit.tx.ts).toISOString(),
      });
    } else {
      await supabase
        .from("cash_transactions")
        .update({
          amount: edit.tx.amount,
          rate: edit.tx.rate ?? null,
          name: edit.tx.name ?? null,
        })
        .eq("id", edit.tx.id);
    }
  }

  async function confirmEdit() {
    if (!pending || !openDate || !preview) return;
    setBusy(true);
    try {
      await applyTxChange(pending);
      const chain = await previewChain(openDate);
      await applyChain(openDate, chain);
      await logPastDayEdit({
        businessDate: openDate,
        action: pending.kind,
        summary:
          pending.kind === "delete"
            ? `Удалена операция: ${txLabel(pending.tx)}`
            : pending.kind === "insert"
              ? `Добавлена операция: ${txLabel(pending.tx)}`
              : `Изменена операция: ${txLabel(pending.tx)}`,
        before: pending.tx,
        after: pending.kind === "delete" ? null : { ...pending.tx, ...pending.patch },
      });
      await qc.invalidateQueries();
      setPending(null);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <History className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Архив смен</h1>
            <p className="text-xs text-muted-foreground">
              Закрытые дни. Текущая смена правится на главной.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-3 py-4">
        {!openDate ? (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Смены</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {archivedDays.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  Архив пока пуст. Смены попадают сюда после «Новый день».
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {archivedDays.map((d) => (
                    <li key={d}>
                      <button
                        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted"
                        onClick={() => setOpenDate(d)}
                      >
                        <span className="text-sm font-medium">{formatDateKeyRu(d)}</span>
                        <span className="text-sm tabular-nums text-muted-foreground">
                          доход {fmt(incomeByDate[d] ?? 0)} ₸
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {editMode && (
              <div className="flex items-center gap-2 rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Режим правки прошлого дня. Каждое изменение потребует подтверждения и
                пересчитает доход последующих смен.
              </div>
            )}
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-2 py-3">
                <CardTitle className="text-sm">{formatDateKeyRu(openDate)}</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setOpenDate(null); setEditMode(false); }}>
                    К списку
                  </Button>
                  {!editMode && (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setPinOpen(true)}>
                      <Lock className="h-3.5 w-3.5" />
                      Править
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                  {CURRENCIES.filter((c) => dayTotals[c.code] !== 0).map((c) => (
                    <div key={c.code} className="rounded-md border border-border p-2 text-center">
                      <div className="text-xs text-muted-foreground">{c.short}</div>
                      <div className={cn(
                        "text-sm font-bold tabular-nums",
                        dayTotals[c.code] < 0 && "text-danger",
                      )}>
                        {fmt(dayTotals[c.code])}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Та же раскладка, что на главной: остаток во всю ширину, ниже
                покупка и продажа, приход и выдача, расходы по категориям. */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <OpeningCard txs={byKind("opening")} onAdd={addTx} onUpdate={updateTx} onDelete={deleteTx} />
              </div>
              <BuyCard txs={byKind("buy")} onAdd={addTx} onUpdate={updateTx} onDelete={deleteTx} />
              <SellCard txs={byKind("sell")} onAdd={addTx} onUpdate={updateTx} onDelete={deleteTx} />
              <IncomeCard
                txs={byKind("income")}
                onAdd={addTx}
                onUpdate={updateTx}
                onDelete={deleteTx}
                contacts={contacts}
                contactMap={contactMap}
              />
              <ExpensePersonCard
                txs={dayTxs.filter((t) => t.kind === "expense" && t.expenseType === "person")}
                onAdd={addTx}
                onUpdate={updateTx}
                onDelete={deleteTx}
                contacts={contacts}
                contactMap={contactMap}
              />
              <div className="lg:col-span-2">
                <ExpenseCategoryCard
                  txs={dayTxs.filter((t) => t.kind === "expense" && t.expenseType !== "person")}
                  onAdd={addTx}
                  onUpdate={updateTx}
                  onDelete={deleteTx}
                />
              </div>
            </div>
          </>
        )}
      </main>

      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Правка прошлой смены</DialogTitle>
            <DialogDescription>
              Изменения в закрытом дне пересчитают доход всех следующих смен. PIN: 0000
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinError(""); }}
            className="text-center text-2xl tracking-[0.5em]"
            autoFocus
          />
          {pinError && <div className="text-sm text-danger">{pinError}</div>}
          <DialogFooter>
            <Button onClick={tryUnlock}>Открыть на правку</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmEditDialog
        pending={pending}
        preview={preview}
        busy={busy}
        onCancel={() => { setPending(null); setPreview(null); }}
        onConfirm={confirmEdit}
      />
    </div>
  );
}

/** Шаг подтверждения: сама операция «было → станет» и то, как сдвинется доход
 * каждой затронутой смены. Без него правка прошлого дня меняла бы цифры
 * нескольких смен вслепую. */
function ConfirmEditDialog({
  pending,
  preview,
  busy,
  onCancel,
  onConfirm,
}: {
  pending: PendingEdit | null;
  preview: { before: Record<string, number>; after: DayIncome[] } | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!pending || !preview) return null;
  const after = { ...pending.tx, ...(pending.patch ?? {}) } as Transaction;
  const changed = preview.after.filter(
    (d) => Math.abs((preview.before[d.businessDate] ?? 0) - d.incomeKzt) > 0.5,
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Подтвердите изменение</DialogTitle>
          <DialogDescription>
            {pending.kind === "delete"
              ? "Операция будет удалена из закрытой смены."
              : pending.kind === "insert"
                ? "В закрытую смену будет добавлена операция."
                : "Операция в закрытой смене будет изменена."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-md border border-border p-3 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Было</span>
            <span className="text-right">
              {pending.kind === "insert" ? "— операции не было —" : txLabel(pending.tx)}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Станет</span>
            <span className={cn("text-right font-medium", pending.kind === "delete" && "text-danger")}>
              {pending.kind === "delete" ? "— удалена —" : txLabel(after)}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">
            {changed.length > 0 ? "Доход этих смен изменится:" : "Доход смен не меняется"}
          </div>
          {changed.map((d) => {
            const was = preview.before[d.businessDate] ?? 0;
            const diff = d.incomeKzt - was;
            return (
              <div key={d.businessDate} className="flex justify-between gap-3 text-sm">
                <span>{formatDateKeyRu(d.businessDate)}</span>
                <span className="tabular-nums">
                  {fmt(was)} → <b>{fmt(d.incomeKzt)}</b>{" "}
                  <span className={diff >= 0 ? "text-success" : "text-danger"}>
                    ({diff >= 0 ? "+" : ""}
                    {fmt(diff)})
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? "Применяем…" : "Да, изменить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

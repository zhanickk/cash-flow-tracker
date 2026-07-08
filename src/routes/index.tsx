import { createFileRoute, Link } from "@tanstack/react-router";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Wallet,
  ShoppingCart,
  Banknote,
  HandCoins,
  ArrowDownCircle,
  Calculator,
  Pencil,
  Trash2,
  History,
  RotateCcw,
  Check,
  X,
  Plus,
  Minus,
  FileSpreadsheet,
  Sunrise,
  Download,
  FolderOpen,
  Users,
  Link2,
  Link2Off,
  ExternalLink,
} from "lucide-react";
import {
  buildDailyReport,
  buildReportWorkbook,
  downloadExcelBuffer,
  pickReportsDirectory,
  saveExcelToDirectory,
  todayDateKey,
  type DailyReportData,
} from "@/lib/daily-report";
import { buildSummaryReportWorkbook, summaryReportFileBaseName } from "@/lib/summary-report";
import { useSession, useCurrentCashier, useLogout } from "@/lib/auth";
import { CashierManagementDialog } from "@/components/cashier-management-dialog";
import { LogOut } from "lucide-react";
import { HoverCard, HoverCardTrigger } from "@/components/ui/hover-card";
import { ContactBalanceHoverCard } from "@/components/contact-hover-card";
import {
  findOrCreateContactByName,
  useAddContactTransaction,
  useContactsWithBalances,
  useDeleteContactTransaction,
  useUpdateContactTransaction,
  type ContactWithBalance,
} from "@/lib/contacts";
import {
  cashContactNote,
  contactSyncPayload,
  isCashContactLinkedTx,
  resolveContactTxId,
} from "@/lib/cash-contact-sync";
import {
  type Currency,
  CURRENCIES,
  FX_CURRENCIES,
  type TxKind,
  type Transaction,
  type HistoryEntry,
  fmt,
  txDeltas,
  txLabel,
  timeStr,
} from "@/lib/cash-shared";
import {
  useCashTransactions,
  useCashHistory,
  useAddCashTransaction,
  useUpdateCashTransaction,
  useDeleteCashTransaction,
  useResetCashRegister,
  useNewDayCashRegister,
} from "@/lib/cash-register";

function parseAmount(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/\s/g, "").replace(/\./g, "").replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseRate(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/\s/g, "").replace(/,/g, ".");
  const parts = cleaned.split(".");
  let normalized = cleaned;
  if (parts.length > 2) normalized = parts.slice(0, -1).join("") + "." + parts.at(-1);
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

function formatInputValue(s: string): string {
  const raw = s.replace(/\s/g, "").replace(/[^\d,]/g, "");
  const firstComma = raw.indexOf(",");
  const intRaw = firstComma >= 0 ? raw.slice(0, firstComma) : raw;
  const fracRaw = firstComma >= 0 ? raw.slice(firstComma + 1).replace(/,/g, "") : "";
  const intNormalized = intRaw.replace(/^0+(?=\d)/, "");
  const groupedInt = (intNormalized || "0").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (firstComma >= 0) return `${groupedInt},${fracRaw}`;
  return groupedInt === "0" && intRaw === "" ? "" : groupedInt;
}

/** Currency specific masks for FX rates. */
function formatRateInput(s: string, currency: Currency): string {
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  if (currency === "GOLD" || currency === "KZT") return digits;
  const minInt = currency === "CNY" ? 2 : currency === "RUB" || currency === "KGS" ? 1 : 3;
  const fracMax = 4;
  if (digits.length <= minInt) return digits;
  const fracLen = Math.min(fracMax, digits.length - minInt);
  const intPart = digits.slice(0, digits.length - fracLen);
  const fracPart = digits.slice(-fracLen);
  return `${intPart}.${fracPart}`;
}

function rateToDigits(rate: number, currency: Currency): string {
  if (currency === "GOLD" || currency === "KZT") return String(Math.round(rate));
  const [intPart = "0", fracPart = ""] = rate.toString().split(".");
  const frac = fracPart.replace(/\D/g, "");
  const maxInt = currency === "CNY" ? 2 : currency === "RUB" || currency === "KGS" ? 1 : 3;
  return intPart.slice(0, maxInt) + frac.slice(0, 4);
}

function ratePlaceholder(currency: Currency): string {
  if (currency === "GOLD") return "470";
  if (currency === "RUB" || currency === "KGS") return "4.0000";
  if (currency === "CNY") return "47.0000";
  if (currency === "USD" || currency === "EUR") return "470.0000";
  return "Курс";
}

const CURRENCY_FLAG: Record<Currency, string> = {
  USD: "🇺🇸",
  EUR: "🇪🇺",
  RUB: "🇷🇺",
  KGS: "🇰🇬",
  CNY: "🇨🇳",
  GOLD: "🏅",
  KZT: "🇰🇿",
};

function handleEnterKey(e: React.KeyboardEvent, next?: () => void, submit?: () => void) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  if (next) next();
  else if (submit) submit();
}

function onCurrencyChange(
  next: Currency,
  setCurrency: (c: Currency) => void,
  setRate: (fn: (prev: string) => string) => void,
) {
  setCurrency(next);
  setRate((prev) => {
    const d = prev.replace(/\D/g, "");
    return d ? formatRateInput(d, next) : "";
  });
}

function todayStr() {
  return new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const REPORT_DONE_KEY = "cash-register-report-done-v1";
const RESET_PIN = "0000";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Кассовый лист — Обмен валют" },
      {
        name: "description",
        content:
          "Кассовый лист обменного пункта: остаток, покупка, продажа, приход, расход по 6 валютам.",
      },
    ],
  }),
  component: Index,
});


/* ============== Main ============== */

function Index() {
  const { data: transactions = [] } = useCashTransactions();
  const { data: history = [] } = useCashHistory();
  const addCashTx = useAddCashTransaction();
  const updateCashTx = useUpdateCashTransaction();
  const deleteCashTx = useDeleteCashTransaction();
  const resetCashRegister = useResetCashRegister();
  const newDayCashRegister = useNewDayCashRegister();

  const [showHistory, setShowHistory] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportData, setReportData] = useState<DailyReportData | null>(null);
  const [reportExcel, setReportExcel] = useState<ArrayBuffer | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportDoneToday, setReportDoneToday] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = localStorage.getItem(REPORT_DONE_KEY);
      return raw ? JSON.parse(raw).date === todayDateKey() : false;
    } catch {
      return false;
    }
  });
  const [newDayOpen, setNewDayOpen] = useState(false);
  const [newDayPin, setNewDayPin] = useState("");
  const [newDayPinError, setNewDayPinError] = useState("");
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const { session } = useSession();
  const { data: currentCashier } = useCurrentCashier(session?.user?.id);
  const cashierName = currentCashier?.name;
  const logout = useLogout();

  const { data: contactsWithBalances = [] } = useContactsWithBalances();
  const addContactTx = useAddContactTransaction();
  const deleteContactTx = useDeleteContactTransaction();
  const updateContactTx = useUpdateContactTransaction();
  const contactMap = useMemo(() => {
    const m = new Map<string, ContactWithBalance>();
    for (const c of contactsWithBalances) m.set(c.name.trim().toLowerCase(), c);
    return m;
  }, [contactsWithBalances]);

  const totals = useMemo(() => {
    const t: Record<Currency, number> = { KZT: 0, USD: 0, EUR: 0, RUB: 0, KGS: 0, CNY: 0, GOLD: 0 };
    for (const tx of transactions) {
      const d = txDeltas(tx);
      for (const [k, v] of Object.entries(d)) t[k as Currency] += v || 0;
    }
    return t;
  }, [transactions]);

  const peopleBalance = useMemo(() => {
    const map = new Map<
      string,
      { name: string; inKzt: number; outKzt: number; netKzt: number; txCount: number }
    >();
    for (const tx of transactions) {
      const person = tx.name?.trim();
      if (!person) continue;
      const isIn = tx.kind === "income" && tx.expenseType !== "regular";
      const isOut = tx.kind === "expense" && tx.expenseType === "person";
      if (!isIn && !isOut) continue;
      const valueKzt = tx.currency === "KZT" ? tx.amount : 0;
      const prev = map.get(person) ?? { name: person, inKzt: 0, outKzt: 0, netKzt: 0, txCount: 0 };
      const next = {
        ...prev,
        inKzt: prev.inKzt + (isIn ? valueKzt : 0),
        outKzt: prev.outKzt + (isOut ? valueKzt : 0),
        netKzt: prev.netKzt + (isIn ? valueKzt : isOut ? -valueKzt : 0),
        txCount: prev.txCount + 1,
      };
      map.set(person, next);
    }
    return [...map.values()].sort((a, b) => Math.abs(b.netKzt) - Math.abs(a.netKzt));
  }, [transactions]);

  function addTx(tx: Omit<Transaction, "id" | "ts"> & { id?: string }) {
    const full: Transaction = { ...tx, id: tx.id ?? crypto.randomUUID(), ts: Date.now() };
    addCashTx.mutate(full);
  }

  async function addContactLinkedTx(tx: Omit<Transaction, "id" | "ts"> & { id?: string }) {
    const localId = tx.id ?? crypto.randomUUID();
    const full: Transaction = { ...tx, id: localId, ts: Date.now() };
    await addCashTx.mutateAsync(full);
    if (!isCashContactLinkedTx(full)) return;

    try {
      const contactId = await findOrCreateContactByName(full.name!.trim());
      const note = cashContactNote(full)!;
      const { amount, currency } = contactSyncPayload(full, {});
      const row = await addContactTx.mutateAsync({ contactId, currency, amount, note });
      await updateCashTx.mutateAsync({
        id: localId,
        patch: { contactTxId: row.id },
        old: full,
      });
    } catch {
      // касса сохранена; синхронизацию с контактом можно повторить при редактировании
    }
  }

  async function syncContactFromCashEdit(old: Transaction, patch: Partial<Transaction>) {
    if (!isCashContactLinkedTx(old)) return;

    const contactName = (patch.name ?? old.name)?.trim();
    if (!contactName) return;

    const contactId = await findOrCreateContactByName(contactName);
    let contactTxId = await resolveContactTxId(old, contactId);
    const { amount, currency } = contactSyncPayload(old, patch);

    if (contactTxId) {
      await updateContactTx.mutateAsync({ id: contactTxId, contactId, amount, currency });
    } else {
      const note = cashContactNote(old)!;
      const row = await addContactTx.mutateAsync({ contactId, currency, amount, note });
      contactTxId = row.id;
    }

    if (!old.contactTxId && contactTxId) {
      await updateCashTx.mutateAsync({
        id: old.id,
        patch: { contactTxId },
        old: { ...old, ...patch },
      });
    }
  }

  async function updateTx(id: string, patch: Partial<Transaction>) {
    const old = transactions.find((t) => t.id === id);
    if (!old) return;
    await updateCashTx.mutateAsync({ id, patch, old });

    try {
      await syncContactFromCashEdit(old, patch);
    } catch {
      // касса обновлена; синхронизацию с контактом можно повторить вручную
    }
  }

  async function deleteTx(id: string) {
    const old = transactions.find((t) => t.id === id);
    if (!old) return;
    await deleteCashTx.mutateAsync(old);

    if (!isCashContactLinkedTx(old)) return;

    const contactName = old.name?.trim();
    if (!contactName) return;

    try {
      const contactId = await findOrCreateContactByName(contactName);
      const contactTxId = await resolveContactTxId(old, contactId);
      if (contactTxId) {
        await deleteContactTx.mutateAsync(contactTxId);
      }
    } catch {
      // касса удалена; связанную операцию контакта можно удалить вручную
    }
  }

  function markReportDone() {
    localStorage.setItem(REPORT_DONE_KEY, JSON.stringify({ date: todayDateKey(), at: Date.now() }));
    setReportDoneToday(true);
  }

  async function openDailyReport() {
    setReportBusy(true);
    try {
      const data = buildDailyReport(transactions, totals);
      const buffer = await buildReportWorkbook(data);
      setReportData(data);
      setReportExcel(buffer);
      setReportOpen(true);
      markReportDone();
    } finally {
      setReportBusy(false);
    }
  }

  async function handleDownloadReport() {
    if (!reportExcel || !reportData) return;
    setReportBusy(true);
    try {
      await saveExcelToDirectory(reportExcel, reportData.fileBaseName);
      downloadExcelBuffer(reportExcel, reportData.fileBaseName);
    } finally {
      setReportBusy(false);
    }
  }

  async function handleDownloadSummary() {
    setSummaryBusy(true);
    try {
      const rows = contactsWithBalances
        .filter((c) => c.kztBalance !== 0 || c.usdBalance !== 0)
        .map((c) => ({ name: c.name, kztBalance: c.kztBalance, usdBalance: c.usdBalance }));
      const buffer = await buildSummaryReportWorkbook(rows, totals);
      const baseName = summaryReportFileBaseName();
      await saveExcelToDirectory(buffer, baseName);
      downloadExcelBuffer(buffer, baseName);
    } finally {
      setSummaryBusy(false);
    }
  }

  function tryNewDay() {
    if (!reportDoneToday) {
      setNewDayPinError("Сначала сформируйте дневной отчёт за сегодня");
      return;
    }
    if (newDayPin !== RESET_PIN) {
      setNewDayPinError("Неверный PIN");
      return;
    }
    const now = Date.now();
    const openings: Transaction[] = CURRENCIES.filter((c) => totals[c.code] !== 0).map((c) => ({
      id: crypto.randomUUID(),
      kind: "opening" as const,
      ts: now,
      currency: c.code,
      amount: totals[c.code],
    }));
    newDayCashRegister.mutate(openings);
    localStorage.removeItem(REPORT_DONE_KEY);
    setReportDoneToday(false);
    setNewDayOpen(false);
    setNewDayPin("");
    setNewDayPinError("");
  }

  function tryReset() {
    if (pin !== RESET_PIN) {
      setPinError("Неверный PIN");
      return;
    }
    resetCashRegister.mutate();
    setResetOpen(false);
    setPin("");
    setPinError("");
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* SECTION 1 — Sticky summary bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold tracking-wide text-primary">Dimak</div>
            <div className="text-center text-xs font-medium capitalize text-muted-foreground sm:text-sm">
              {todayStr()}
            </div>
            <div className="flex items-center gap-1">
              {cashierName && (
                <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
                  {cashierName}
                </span>
              )}
              <CashierManagementDialog />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline">Выйти</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Выйти из системы?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Придётся заново войти по логину и паролю, чтобы продолжить работу с кассой.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={() => logout.mutate()}>Выйти</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {FX_CURRENCIES.map((c) => (
              <BalancePill key={c.code} code={c.code} label={c.short} value={totals[c.code]} />
            ))}
            <div
              className={cn(
                "rounded-lg border-2 px-4 py-2 text-base font-bold tabular-nums shadow-sm sm:text-lg",
                totals.KZT >= 0
                  ? "border-success/50 bg-success-soft text-foreground"
                  : "border-danger/50 bg-danger-soft text-foreground",
              )}
            >
              <span className="mr-2 text-muted-foreground">KZT</span>
              {fmt(totals.KZT)} ₸
            </div>
          </div>
        </div>
      </header>

      {/* SECTION 2 — Main grid */}
      <main className="mx-auto grid max-w-7xl gap-4 p-3 sm:p-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <OpeningCard
            txs={transactions.filter((t) => t.kind === "opening")}
            onAdd={addTx}
            onUpdate={updateTx}
            onDelete={deleteTx}
          />
        </div>
        <BuyCard
          txs={transactions.filter((t) => t.kind === "buy")}
          onAdd={addTx}
          onUpdate={updateTx}
          onDelete={deleteTx}
        />
        <SellCard
          txs={transactions.filter((t) => t.kind === "sell")}
          onAdd={addTx}
          onUpdate={updateTx}
          onDelete={deleteTx}
        />
        <IncomeCard
          txs={transactions.filter((t) => t.kind === "income")}
          onAdd={addContactLinkedTx}
          onUpdate={updateTx}
          onDelete={deleteTx}
          contacts={contactsWithBalances}
          contactMap={contactMap}
        />
        <ExpenseCombinedCard
          txs={transactions.filter((t) => t.kind === "expense")}
          onAdd={addContactLinkedTx}
          onUpdate={updateTx}
          onDelete={deleteTx}
          contacts={contactsWithBalances}
          contactMap={contactMap}
        />

        {/* History */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-5 w-5 text-primary" />
                Журнал изменений ({history.length})
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="gap-1" asChild>
                  <Link to="/journal">
                    <ExternalLink className="h-4 w-4" />
                    На всю страницу
                  </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowHistory((v) => !v)}>
                  {showHistory ? "Скрыть" : "Показать"}
                </Button>
              </div>
            </CardHeader>
            {showHistory && (
              <CardContent>
                {history.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Журнал пуст
                  </div>
                ) : (
                  <ScrollArea className="h-64 rounded-md border border-border bg-muted/40">
                    <ul className="divide-y divide-border">
                      {[...history].reverse().map((h) => (
                        <li key={h.id} className="flex items-start gap-3 px-3 py-2 text-xs">
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {timeStr(h.ts)}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                              h.action === "add" && "bg-success-soft text-success",
                              h.action === "delete" && "bg-danger-soft text-danger",
                              h.action === "edit" && "bg-accent text-accent-foreground",
                              h.action === "reset" && "bg-destructive text-destructive-foreground",
                            )}
                          >
                            {h.action === "add"
                              ? "ДОБ"
                              : h.action === "delete"
                                ? "УДАЛ"
                                : h.action === "edit"
                                  ? "ИЗМ"
                                  : "СБРОС"}
                          </span>
                          <span className="text-foreground">{h.summary}</span>
                          {h.cashierName && (
                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                              {h.cashierName}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </CardContent>
            )}
          </Card>
        </div>

        {/* Day end actions */}
        <div className="grid gap-2 lg:col-span-2 sm:grid-cols-3">
          <Button
            size="lg"
            className="gap-2"
            onClick={openDailyReport}
            disabled={reportBusy || transactions.length === 0}
          >
            <FileSpreadsheet className="h-5 w-5" />
            {reportBusy ? "Формируем…" : "Дневной отчёт"}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="gap-2"
            disabled={!reportDoneToday}
            title={
              reportDoneToday
                ? "Перенести остатки на новый день"
                : "Сначала сформируйте дневной отчёт"
            }
            onClick={() => {
              setNewDayPin("");
              setNewDayPinError("");
              setNewDayOpen(true);
            }}
          >
            <Sunrise className="h-5 w-5" />
            Новый день
          </Button>
          <Button
            variant="destructive"
            size="lg"
            className="gap-2"
            onClick={() => {
              setPin("");
              setPinError("");
              setResetOpen(true);
            }}
          >
            <RotateCcw className="h-5 w-5" />
            Перезапустить кассу
          </Button>
        </div>
        <div className="grid gap-2 lg:col-span-2 sm:grid-cols-2">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => setPeopleOpen(true)}
            disabled={peopleBalance.length === 0}
          >
            <Users className="h-4 w-4" />
            Лица на балансе (сегодня)
          </Button>
          <Button variant="outline" className="w-full gap-2" asChild>
            <Link to="/contacts-full">
              <Users className="h-4 w-4" />
              Контакты (полная база)
            </Link>
          </Button>
          <Button variant="outline" className="w-full gap-2" asChild>
            <Link to="/contacts">
              <Wallet className="h-4 w-4" />
              Валютные счета
            </Link>
          </Button>
          <Button variant="outline" className="w-full gap-2 sm:col-span-2" asChild>
            <Link to="/fx-sales">
              <Banknote className="h-4 w-4" />
              Продажа валют (учёт и отчёты)
            </Link>
          </Button>
          <Button variant="outline" className="w-full gap-2 sm:col-span-2" asChild>
            <Link to="/currency-balance">
              <Wallet className="h-4 w-4" />
              Трата Жұрттың ақшасы
            </Link>
          </Button>
        </div>
        <div className="lg:col-span-2">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handleDownloadSummary}
            disabled={summaryBusy}
          >
            <FileSpreadsheet className="h-4 w-4" />
            {summaryBusy ? "Формируем…" : "Скачать сводку (контакты + касса)"}
          </Button>
        </div>
        {!reportDoneToday && transactions.length > 0 && (
          <p className="text-center text-xs text-muted-foreground lg:col-span-2">
            «Новый день» доступен после формирования дневного отчёта
          </p>
        )}
      </main>

      {/* Fixed bottom MR bar (KZT memory result) */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calculator className="h-4 w-4 text-primary" />
            <span className="hidden sm:inline">MR — Итог по KZT (M+ / M−):</span>
            <span className="sm:hidden">MR KZT:</span>
          </div>
          <div
            className={cn(
              "rounded-md px-3 py-1 text-base font-bold tabular-nums",
              totals.KZT >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
            )}
          >
            {fmt(totals.KZT)} ₸
          </div>
        </div>
      </div>

      <DailyReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        data={reportData}
        busy={reportBusy}
        onDownload={handleDownloadReport}
        onPickFolder={pickReportsDirectory}
      />

      <Dialog open={peopleOpen} onOpenChange={setPeopleOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Лица на балансе</DialogTitle>
            <DialogDescription>Свод по людям: вносили и забирали деньги</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] rounded-md border border-border">
            <ul className="divide-y divide-border">
              {peopleBalance.map((p) => (
                <li
                  key={p.name}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 text-xs"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="tabular-nums text-success">+{fmt(p.inKzt)} ₸</span>
                  <span className="tabular-nums text-danger">-{fmt(p.outKzt)} ₸</span>
                  <span
                    className={cn(
                      "tabular-nums font-semibold",
                      p.netKzt >= 0 ? "text-success" : "text-danger",
                    )}
                  >
                    {fmt(p.netKzt)} ₸
                  </span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={newDayOpen} onOpenChange={setNewDayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый день</DialogTitle>
            <DialogDescription>
              Текущие остатки станут «Остаток на начало дня». Операции дня будут очищены. Доступно
              только после дневного отчёта. PIN: 0000
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="••••"
            value={newDayPin}
            onChange={(e) => {
              setNewDayPin(e.target.value.replace(/\D/g, "").slice(0, 4));
              setNewDayPinError("");
            }}
            onKeyDown={(e) => handleEnterKey(e, undefined, tryNewDay)}
            className="text-center text-2xl tracking-[0.5em]"
            autoFocus
          />
          {newDayPinError && <div className="text-sm text-danger">{newDayPinError}</div>}
          <div className="rounded-md border border-border bg-muted/50 p-3 text-xs">
            <div className="mb-1 font-medium">Остатки перейдут в новый день:</div>
            <div className="flex flex-wrap gap-2">
              {CURRENCIES.filter((c) => totals[c.code] !== 0).map((c) => (
                <span key={c.code} className="tabular-nums">
                  {c.short}: {fmt(totals[c.code])}
                </span>
              ))}
              {CURRENCIES.every((c) => totals[c.code] === 0) && (
                <span className="text-muted-foreground">Все остатки нулевые</span>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDayOpen(false)}>
              Отмена
            </Button>
            <Button onClick={tryNewDay}>Открыть новый день</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset PIN dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Подтверждение перезапуска</DialogTitle>
            <DialogDescription>
              Введите 4-значный PIN для очистки кассы. Журнал изменений будет сохранён.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="••••"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
              setPinError("");
            }}
            onKeyDown={(e) => handleEnterKey(e, undefined, tryReset)}
            className="text-center text-2xl tracking-[0.5em]"
            autoFocus
          />
          {pinError && <div className="text-sm text-danger">{pinError}</div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={tryReset}>
              Перезапустить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============== Report dialog ============== */

function DailyReportDialog({
  open,
  onOpenChange,
  data,
  busy,
  onDownload,
  onPickFolder,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: DailyReportData | null;
  busy: boolean;
  onDownload: () => void;
  onPickFolder: () => Promise<FileSystemDirectoryHandle | null>;
}) {
  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            {data.fileBaseName}
          </DialogTitle>
          <DialogDescription>{data.dateTitle}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-success/30 bg-success-soft p-3">
                <div className="text-xs text-muted-foreground">Маржа обмена (KZT)</div>
                <div className="text-lg font-bold tabular-nums text-success">
                  {fmt(data.totalFxMarginKzt)} ₸
                </div>
              </div>
              <div
                className={cn(
                  "rounded-lg border p-3",
                  data.netProfitKzt >= 0
                    ? "border-success/30 bg-success-soft"
                    : "border-danger/30 bg-danger-soft",
                )}
              >
                <div className="text-xs text-muted-foreground">Чистая прибыль (KZT)</div>
                <div
                  className={cn(
                    "text-lg font-bold tabular-nums",
                    data.netProfitKzt >= 0 ? "text-success" : "text-danger",
                  )}
                >
                  {fmt(data.netProfitKzt)} ₸
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  маржа + приход (без контакта) − обычные расходы KZT
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
              <div className="rounded-md bg-success-soft p-2">
                <div className="text-muted-foreground">Приход в прибыли</div>
                <div className="font-semibold tabular-nums text-success">
                  {fmt(data.regularIncomeKzt)}
                </div>
              </div>
              <div className="rounded-md bg-muted/60 p-2">
                <div className="text-muted-foreground">Приход от контактов (инфо)</div>
                <div className="font-semibold tabular-nums text-muted-foreground">
                  {fmt(data.personIncomeKzt)}
                </div>
              </div>
              <div className="rounded-md bg-muted/60 p-2">
                <div className="text-muted-foreground">Расходы KZT</div>
                <div className="font-semibold tabular-nums text-danger">
                  {fmt(data.regularExpenseKzt)}
                </div>
              </div>
              <div className="rounded-md bg-muted/60 p-2">
                <div className="text-muted-foreground">Выдачи KZT (инфо)</div>
                <div className="font-semibold tabular-nums">{fmt(data.personExpenseKzt)}</div>
              </div>
            </div>

            {data.fxRows.some((r) => r.boughtAmount > 0 || r.soldAmount > 0) && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">Купля / продажа</h4>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-accent">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Вал.</th>
                        <th className="px-2 py-1.5 text-right">Куплено</th>
                        <th className="px-2 py-1.5 text-right">Продано</th>
                        <th className="px-2 py-1.5 text-right">Маржа ₸</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.fxRows
                        .filter((r) => r.boughtAmount > 0 || r.soldAmount > 0)
                        .map((r) => (
                          <tr key={r.currency} className="border-t border-border">
                            <td className="px-2 py-1 font-medium">{r.currency}</td>
                            <td className="px-2 py-1 text-right tabular-nums">
                              {fmt(r.boughtAmount)} @ {r.avgBuyRate ? fmt(r.avgBuyRate, 3) : "—"}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums">
                              {fmt(r.soldAmount)} @ {r.avgSellRate ? fmt(r.avgSellRate, 3) : "—"}
                            </td>
                            <td
                              className={cn(
                                "px-2 py-1 text-right font-semibold tabular-nums",
                                r.marginKzt >= 0 ? "text-success" : "text-danger",
                              )}
                            >
                              {fmt(r.marginKzt)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <h4 className="mb-2 text-sm font-semibold">Операции ({data.rows.length})</h4>
              <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="px-2 py-1 text-left">Время</th>
                      <th className="px-2 py-1 text-left">Тип</th>
                      <th className="px-2 py-1 text-right">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, i) => (
                      <tr key={i} className="border-b border-border/60">
                        <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">
                          {row.time.split(",")[1]?.trim() ?? row.time}
                        </td>
                        <td className="px-2 py-1">{row.kind}</td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {fmt(row.amount)} {row.currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Кто забрал / кому отдали</h4>
              <div className="rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-accent">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Имя</th>
                      <th className="px-2 py-1.5 text-right">Сумма</th>
                      <th className="px-2 py-1.5 text-right">Валюта</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows
                      .filter((r) => r.kind === "Выдача (кому/забрал)")
                      .map((r, i) => (
                        <tr key={`${r.name}-${i}`} className="border-t border-border">
                          <td className="px-2 py-1">{r.name}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmt(r.amount)}</td>
                          <td className="px-2 py-1 text-right">{r.currency}</td>
                        </tr>
                      ))}
                    {data.rows.every((r) => r.kind !== "Выдача (кому/забрал)") && (
                      <tr>
                        <td colSpan={3} className="px-2 py-2 text-center text-muted-foreground">
                          Нет выдач людям
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Лица на балансе (суммарно, KZT)</h4>
              <div className="rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-accent">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Имя</th>
                      <th className="px-2 py-1.5 text-right">Внесли</th>
                      <th className="px-2 py-1.5 text-right">Забрали</th>
                      <th className="px-2 py-1.5 text-right">Баланс</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.peopleBalance.map((p) => (
                      <tr key={p.name} className="border-t border-border">
                        <td className="px-2 py-1">{p.name}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-success">
                          +{fmt(p.inKzt)}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-danger">
                          -{fmt(p.outKzt)}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-1 text-right tabular-nums font-semibold",
                            p.netKzt >= 0 ? "text-success" : "text-danger",
                          )}
                        >
                          {fmt(p.netKzt)}
                        </td>
                      </tr>
                    ))}
                    {data.peopleBalance.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-2 py-2 text-center text-muted-foreground">
                          Пока нет данных по людям
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border px-4 py-3 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => onPickFolder()}
          >
            <FolderOpen className="h-4 w-4" />
            Папка для отчётов
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Закрыть
            </Button>
            <Button type="button" className="gap-1" disabled={busy} onClick={onDownload}>
              <Download className="h-4 w-4" />
              {busy ? "Сохраняем…" : "Скачать Excel"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============== Small Components ============== */

function BalancePill({ code, label, value }: { code: Currency; label: string; value: number }) {
  return (
    <div
      className={cn(
        "rounded-md border bg-card px-3 py-1.5 text-sm transition",
        value > 0 && "border-success/30",
        value < 0 && "border-danger/30",
        value === 0 && "border-border",
      )}
    >
      <span className="mr-1.5 text-xs font-semibold text-muted-foreground">
        {CURRENCY_FLAG[code]} {label}
      </span>
      <span
        className={cn(
          "font-semibold tabular-nums",
          value > 0 && "text-success",
          value < 0 && "text-danger",
          value === 0 && "text-foreground",
        )}
      >
        {fmt(value)}
      </span>
    </div>
  );
}

const FlowInput = forwardRef<
  HTMLInputElement,
  React.ComponentProps<typeof Input> & {
    onEnterNext?: () => void;
    onEnterSubmit?: () => void;
  }
>(function FlowInput({ onEnterNext, onEnterSubmit, onKeyDown, ...props }, ref) {
  return (
    <Input
      ref={ref}
      {...props}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        handleEnterKey(e, onEnterNext, onEnterSubmit);
      }}
    />
  );
});

function CurrencySelect({
  value,
  onChange,
  exclude,
  triggerRef,
  onEnterNext,
}: {
  value: Currency;
  onChange: (c: Currency) => void;
  exclude?: Currency[];
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  onEnterNext?: () => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Currency)}>
      <SelectTrigger ref={triggerRef} onKeyDown={(e) => handleEnterKey(e, onEnterNext)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CURRENCIES.filter((c) => !exclude?.includes(c.code)).map((c) => (
          <SelectItem key={c.code} value={c.code}>
            {CURRENCY_FLAG[c.code]} {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const AmountInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    className?: string;
    onEnterNext?: () => void;
    onEnterSubmit?: () => void;
  }
>(function AmountInput(
  { value, onChange, placeholder, className, onEnterNext, onEnterSubmit },
  ref,
) {
  return (
    <Input
      ref={ref}
      inputMode="decimal"
      value={value}
      placeholder={placeholder ?? "0"}
      onChange={(e) => onChange(formatInputValue(e.target.value))}
      onKeyDown={(e) => handleEnterKey(e, onEnterNext, onEnterSubmit)}
      className={cn("tabular-nums", className)}
    />
  );
});

const RateInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (v: string) => void;
    currency: Currency;
    className?: string;
    onEnterNext?: () => void;
    onEnterSubmit?: () => void;
  }
>(function RateInput({ value, onChange, currency, className, onEnterNext, onEnterSubmit }, ref) {
  return (
    <Input
      ref={ref}
      inputMode="numeric"
      value={value}
      placeholder={ratePlaceholder(currency)}
      onChange={(e) => onChange(formatRateInput(e.target.value, currency))}
      onKeyDown={(e) => handleEnterKey(e, onEnterNext, onEnterSubmit)}
      className={cn("tabular-nums", className)}
    />
  );
});

function SectionCard({
  title,
  icon: Icon,
  tone,
  badge,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "success" | "danger" | "primary";
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        className={cn(
          "border-b border-border py-3",
          tone === "success" && "bg-success-soft",
          tone === "danger" && "bg-danger-soft",
          tone === "primary" && "bg-accent",
        )}
      >
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Icon
              className={cn(
                "h-5 w-5",
                tone === "success" && "text-success",
                tone === "danger" && "text-danger",
                tone === "primary" && "text-primary",
              )}
            />
            {title}
          </span>
          {badge && (
            <span className="rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {badge}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-3 sm:p-4">{children}</CardContent>
    </Card>
  );
}

/* ============== Tx Row (with edit + delete) ============== */

interface RowProps {
  tx: Transaction;
  onUpdate: (id: string, patch: Partial<Transaction>) => void | Promise<void>;
  onDelete: (id: string) => void;
  withRate?: boolean;
  withName?: boolean;
  lockName?: boolean;
  excludeKzt?: boolean;
  contactMap?: Map<string, ContactWithBalance>;
}

function TxRow({ tx, onUpdate, onDelete, withRate, withName, lockName, excludeKzt, contactMap }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tx.name ?? "");
  const [currency, setCurrency] = useState<Currency>(tx.currency);
  const [amount, setAmount] = useState(fmt(tx.amount));
  const [rate, setRate] = useState(
    tx.rate ? formatRateInput(rateToDigits(tx.rate, tx.currency), tx.currency) : "",
  );
  const nameRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);

  const isPlus = ["opening", "income", "sell"].includes(tx.kind);

  const save = () => {
    const a = parseAmount(amount);
    const r = parseRate(rate);
    if (a <= 0) return;
    if (withRate && r <= 0) return;
    void onUpdate(tx.id, {
      name: withName && !lockName ? name.trim() || undefined : tx.name,
      currency,
      amount: a,
      rate: withRate ? r : undefined,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="space-y-2 bg-accent/40 px-3 py-2">
        {withName && lockName && tx.name && (
          <div className="rounded-md border border-border bg-muted/50 px-2 py-1.5 text-xs font-medium text-foreground">
            {tx.name}
          </div>
        )}
        {withName && !lockName && (
          <FlowInput
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Имя"
            className="h-8 text-xs"
            onEnterNext={() => currencyRef.current?.focus()}
          />
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <AmountInput
            ref={amountRef}
            value={amount}
            onChange={setAmount}
            placeholder="Сумма"
            className="h-9"
            onEnterNext={() => currencyRef.current?.focus()}
          />
          <CurrencySelect
            value={currency}
            onChange={(c) => onCurrencyChange(c, setCurrency, setRate)}
            exclude={excludeKzt ? ["KZT"] : []}
            triggerRef={currencyRef}
            onEnterNext={withRate ? () => rateRef.current?.focus() : save}
          />
          {withRate && (
            <RateInput
              ref={rateRef}
              value={rate}
              onChange={setRate}
              currency={currency}
              className="h-9"
              onEnterSubmit={save}
            />
          )}
          <div className="flex gap-1">
            <Button
              size="sm"
              onClick={save}
              className="flex-1 gap-1 bg-success text-success-foreground hover:bg-success/90"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "group flex items-center justify-between gap-2 px-3 py-2 text-xs transition hover:bg-accent/40",
        isPlus ? "border-l-2 border-l-success/60" : "border-l-2 border-l-danger/60",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={cn(
            "shrink-0 rounded p-0.5",
            isPlus ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
          )}
        >
          {isPlus ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{timeStr(tx.ts)}</span>
        <span className="truncate text-foreground">
          {tx.name && tx.expenseType === "person" && contactMap?.get(tx.name.trim().toLowerCase()) ? (
            (() => {
              const c = contactMap.get(tx.name!.trim().toLowerCase())!;
              return (
                <HoverCard openDelay={150} closeDelay={80}>
                  <HoverCardTrigger asChild>
                    <Link
                      to="/contacts/$contactId"
                      params={{ contactId: c.id }}
                      className="font-medium text-primary underline decoration-1 underline-offset-2 hover:text-primary/80"
                    >
                      {tx.name}
                    </Link>
                  </HoverCardTrigger>
                  <ContactBalanceHoverCard
                    contactId={c.id}
                    name={c.name}
                    balances={c.balances}
                    activeCurrencies={c.activeCurrencies}
                    txCount={c.txCount}
                    lastActivityAt={c.lastActivityAt}
                  />
                </HoverCard>
              );
            })()
          ) : (
            tx.name && <span className="font-medium">{tx.name}</span>
          )}
          {tx.name && " · "}
          <span className="tabular-nums">
            {fmt(tx.amount)} {CURRENCY_FLAG[tx.currency]} {tx.currency}
          </span>
          {tx.rate ? <span className="text-muted-foreground"> × {tx.rate}</span> : null}
        </span>
      </div>
      <div className="flex shrink-0 gap-1 opacity-60 transition group-hover:opacity-100">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-danger hover:text-danger">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить операцию?</AlertDialogTitle>
              <AlertDialogDescription>
                {txLabel(tx)}
                {tx.expenseType === "person"
                  ? " — запись также будет удалена из истории контакта."
                  : ""}{" "}
                Действие необратимо.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(tx.id)}
                className={buttonVariants({ variant: "destructive" })}
              >
                Удалить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

function TxList({ txs, ...props }: { txs: Transaction[] } & Omit<RowProps, "tx">) {
  if (txs.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        Записей пока нет
      </div>
    );
  }
  return (
    <ScrollArea className="h-80 rounded-md border border-border bg-muted/30">
      <ul className="divide-y divide-border">
        {[...txs].reverse().map((t) => (
          <TxRow key={t.id} tx={t} {...props} />
        ))}
      </ul>
    </ScrollArea>
  );
}

/* ============== Quadrants ============== */

interface AddProps {
  txs: Transaction[];
  onAdd: (tx: Omit<Transaction, "id" | "ts"> & { id?: string }) => void;
  onUpdate: (id: string, patch: Partial<Transaction>) => void;
  onDelete: (id: string) => void;
}

function OpeningCard({ txs, onAdd, onUpdate, onDelete }: AddProps) {
  const [currency, setCurrency] = useState<Currency>("KZT");
  const [amount, setAmount] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const submit = () => {
    const a = parseAmount(amount);
    if (a <= 0) return;
    onAdd({ kind: "opening", currency, amount: a });
    setAmount("");
    amountRef.current?.focus();
  };
  return (
    <SectionCard title="Остаток на начало дня" icon={Wallet} tone="primary" badge={`${txs.length}`}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <AmountInput
          ref={amountRef}
          value={amount}
          onChange={setAmount}
          placeholder="Сумма"
          onEnterNext={() => currencyRef.current?.focus()}
        />
        <CurrencySelect
          value={currency}
          onChange={setCurrency}
          triggerRef={currencyRef}
          onEnterNext={submit}
        />
        <Button
          onClick={submit}
          className="gap-1 bg-success text-success-foreground hover:bg-success/90"
        >
          <Plus className="h-4 w-4" /> Добавить
        </Button>
      </div>
      <TxList txs={txs} onUpdate={onUpdate} onDelete={onDelete} withName />
    </SectionCard>
  );
}

function BuyCard({ txs, onAdd, onUpdate, onDelete }: AddProps) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  const a = parseAmount(amount),
    r = parseRate(rate);
  const kzt = a * r;
  const submit = () => {
    if (a <= 0 || r <= 0) return;
    onAdd({ kind: "buy", currency, amount: a, rate: r });
    setAmount("");
    setRate("");
    amountRef.current?.focus();
  };
  return (
    <SectionCard
      title="Покупка валюты за тенге"
      icon={ShoppingCart}
      tone="danger"
      badge={`${txs.length}`}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <AmountInput
          ref={amountRef}
          value={amount}
          onChange={setAmount}
          placeholder="Сумма валюты"
          onEnterNext={() => currencyRef.current?.focus()}
        />
        <CurrencySelect
          value={currency}
          onChange={(c) => onCurrencyChange(c, setCurrency, setRate)}
          exclude={["KZT"]}
          triggerRef={currencyRef}
          onEnterNext={() => rateRef.current?.focus()}
        />
        <RateInput
          ref={rateRef}
          value={rate}
          onChange={setRate}
          currency={currency}
          onEnterSubmit={submit}
        />
        <Button onClick={submit} variant="destructive" className="gap-1">
          <Minus className="h-4 w-4" /> M−
        </Button>
      </div>
      {kzt > 0 && (
        <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Спишется с KZT:{" "}
          <span className="font-semibold tabular-nums text-foreground">{fmt(kzt)} ₸</span>
        </div>
      )}
      <TxList txs={txs} onUpdate={onUpdate} onDelete={onDelete} withRate excludeKzt />
    </SectionCard>
  );
}

function SellCard({ txs, onAdd, onUpdate, onDelete }: AddProps) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  const a = parseAmount(amount),
    r = parseRate(rate);
  const kzt = a * r;
  const submit = () => {
    if (a <= 0 || r <= 0) return;
    onAdd({ kind: "sell", currency, amount: a, rate: r });
    setAmount("");
    setRate("");
    amountRef.current?.focus();
  };
  return (
    <SectionCard
      title="Продажа валюты за тенге"
      icon={Banknote}
      tone="success"
      badge={`${txs.length}`}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <AmountInput
          ref={amountRef}
          value={amount}
          onChange={setAmount}
          placeholder="Сумма валюты"
          onEnterNext={() => currencyRef.current?.focus()}
        />
        <CurrencySelect
          value={currency}
          onChange={(c) => onCurrencyChange(c, setCurrency, setRate)}
          exclude={["KZT"]}
          triggerRef={currencyRef}
          onEnterNext={() => rateRef.current?.focus()}
        />
        <RateInput
          ref={rateRef}
          value={rate}
          onChange={setRate}
          currency={currency}
          onEnterSubmit={submit}
        />
        <Button
          onClick={submit}
          className="gap-1 bg-success text-success-foreground hover:bg-success/90"
        >
          <Plus className="h-4 w-4" /> M+
        </Button>
      </div>
      {kzt > 0 && (
        <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Поступит KZT:{" "}
          <span className="font-semibold tabular-nums text-foreground">{fmt(kzt)} ₸</span>
        </div>
      )}
      <TxList txs={txs} onUpdate={onUpdate} onDelete={onDelete} withRate excludeKzt />
    </SectionCard>
  );
}

function ContactAutocompleteField({
  contacts,
  name,
  onNameChange,
  freeMode,
  onToggleFreeMode,
  linkedPlaceholder,
  freePlaceholder,
  nameRef,
  onEnterNext,
}: {
  contacts: ContactWithBalance[];
  name: string;
  onNameChange: (v: string) => void;
  freeMode: boolean;
  onToggleFreeMode: () => void;
  linkedPlaceholder: string;
  freePlaceholder: string;
  nameRef: React.RefObject<HTMLInputElement | null>;
  onEnterNext?: () => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (!q || freeMode) return [];
    const starts = contacts.filter((c) => c.name.toLowerCase().startsWith(q));
    const list =
      starts.length > 0 ? starts : contacts.filter((c) => c.name.toLowerCase().includes(q));
    return list.slice(0, 6);
  }, [contacts, name, freeMode]);

  return (
    <>
      <button
        type="button"
        aria-label={freeMode ? "Режим: заметка" : "Режим: контакт"}
        title={freeMode ? "Заметка (без привязки к контакту)" : "Привязка к контакту"}
        onClick={onToggleFreeMode}
        className="flex h-9 w-9 shrink-0 items-center justify-center justify-self-center rounded-md border border-input text-muted-foreground hover:text-foreground sm:justify-self-auto"
      >
        {freeMode ? <Link2Off className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
      </button>
      <div className="relative">
        <FlowInput
          ref={nameRef}
          placeholder={freeMode ? freePlaceholder : linkedPlaceholder}
          value={name}
          onChange={(e) => {
            onNameChange(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => {
            blurTimeout.current = setTimeout(() => setShowDropdown(false), 150);
          }}
          onEnterNext={onEnterNext}
        />
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-border bg-popover shadow-md">
            {suggestions.map((c) => (
              <div
                key={c.id}
                className="cursor-pointer px-3 py-1.5 text-sm hover:bg-muted"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (blurTimeout.current) clearTimeout(blurTimeout.current);
                  onNameChange(c.name);
                  setShowDropdown(false);
                }}
              >
                {c.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

interface ContactAddProps extends Omit<AddProps, "onAdd"> {
  onAdd: (tx: Omit<Transaction, "id" | "ts"> & { id?: string }) => void | Promise<void>;
  contacts: ContactWithBalance[];
  contactMap: Map<string, ContactWithBalance>;
}

function IncomeCard({ txs, onAdd, onUpdate, onDelete, contacts, contactMap }: ContactAddProps) {
  const [currency, setCurrency] = useState<Currency>("KZT");
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [freeMode, setFreeMode] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const a = parseAmount(amount);
    const trimmed = name.trim();
    if (a <= 0) return;
    if (!freeMode && !trimmed) return;
    await onAdd({
      kind: "income",
      currency,
      amount: a,
      name: trimmed || undefined,
      expenseType: freeMode ? "regular" : "person",
    });
    setAmount("");
    setName("");
    nameRef.current?.focus();
  };

  return (
    <SectionCard
      title="Приход (принесли деньги)"
      icon={HandCoins}
      tone="success"
      badge={`${txs.length}`}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_1fr_1fr_auto]">
        <ContactAutocompleteField
          contacts={contacts}
          name={name}
          onNameChange={setName}
          freeMode={freeMode}
          onToggleFreeMode={() => setFreeMode((v) => !v)}
          linkedPlaceholder="От кого"
          freePlaceholder="От кого (заметка)"
          nameRef={nameRef}
          onEnterNext={() => currencyRef.current?.focus()}
        />
        <CurrencySelect
          value={currency}
          onChange={setCurrency}
          triggerRef={currencyRef}
          onEnterNext={() => amountRef.current?.focus()}
        />
        <AmountInput
          ref={amountRef}
          value={amount}
          onChange={setAmount}
          placeholder="Сумма"
          onEnterSubmit={submit}
        />
        <Button
          onClick={submit}
          className="gap-1 bg-success text-success-foreground hover:bg-success/90"
        >
          <Plus className="h-4 w-4" /> M+
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Значок слева переключает: привязка к контакту (автоподсказка + баланс при наведении,
        обновляет профиль в Контактах) или просто заметка без привязки.
      </p>
      <TxList
        txs={txs}
        onUpdate={onUpdate}
        onDelete={onDelete}
        withName
        lockName
        contactMap={contactMap}
      />
    </SectionCard>
  );
}

function ExpenseCombinedCard({
  txs,
  onAdd,
  onUpdate,
  onDelete,
  contacts,
  contactMap,
}: ContactAddProps) {
  const [currency, setCurrency] = useState<Currency>("KZT");
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [freeMode, setFreeMode] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const a = parseAmount(amount);
    const trimmed = name.trim();
    if (a <= 0) return;
    if (!freeMode && !trimmed) return;
    await onAdd({
      kind: "expense",
      currency,
      amount: a,
      name: trimmed || undefined,
      expenseType: freeMode ? "regular" : "person",
    });
    setAmount("");
    setName("");
    nameRef.current?.focus();
  };

  return (
    <SectionCard
      title="Расходы / Отток денег"
      icon={ArrowDownCircle}
      tone="danger"
      badge={`${txs.length}`}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_1fr_1fr_auto]">
        <ContactAutocompleteField
          contacts={contacts}
          name={name}
          onNameChange={setName}
          freeMode={freeMode}
          onToggleFreeMode={() => setFreeMode((v) => !v)}
          linkedPlaceholder="Кто забрал / кому отдали"
          freePlaceholder="Название расхода"
          nameRef={nameRef}
          onEnterNext={() => currencyRef.current?.focus()}
        />
        <CurrencySelect
          value={currency}
          onChange={setCurrency}
          triggerRef={currencyRef}
          onEnterNext={() => amountRef.current?.focus()}
        />
        <AmountInput
          ref={amountRef}
          value={amount}
          onChange={setAmount}
          placeholder="Сумма"
          onEnterSubmit={submit}
        />
        <Button onClick={submit} variant="destructive" className="gap-1">
          <Minus className="h-4 w-4" /> M−
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Значок слева переключает: привязка к контакту (автоподсказка + баланс при наведении,
        обновляет профиль в Контактах) или просто заметка без привязки.
      </p>
      <TxList
        txs={txs}
        onUpdate={onUpdate}
        onDelete={onDelete}
        withName
        lockName
        contactMap={contactMap}
      />
    </SectionCard>
  );
}

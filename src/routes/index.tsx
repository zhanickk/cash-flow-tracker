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
  UserPlus,
  Download,
  FolderOpen,
  Users,
  Link2,
  Link2Off,
  ExternalLink,
  ArrowLeftRight,
  ChevronDown,
  CalendarClock,
} from "lucide-react";
import {
  buildDailyReport,
  buildReportWorkbook,
  downloadExcelBuffer,
  pickReportsDirectory,
  saveExcelToDirectory,
  type DailyReportData,
} from "@/lib/daily-report";
import { buildSummaryReportWorkbook, summaryReportFileBaseName } from "@/lib/summary-report";
import {
  EXPENSE_CATEGORIES,
  PAYROLL_CATEGORY_CODE,
  expenseCategoryLabel,
  matchesExpenseCategoryLabel,
  resolveCategory,
  useExpenses,
} from "@/lib/expenses";
import {
  isPaidThisMonth,
  useAddEmployee,
  useDeleteEmployee,
  useEmployees,
  type Employee,
} from "@/lib/payroll";
import { useFxPurchases } from "@/lib/fx-purchases";
import { useFxCurrencies, useFxSales } from "@/lib/fx-sales";
import { computeSessionExcessByCurrency, txsToFxOps } from "@/lib/fx-people-money-spend";
import { carryOutFrom, computeSimpleIncome, totalSimpleIncome } from "@/lib/simple-income";
import { useSessionCarryIn } from "@/lib/session-carry-in";
import { useCurrencyCostBasis } from "@/lib/currency-cost-basis";
import {
  dateKeyToDate,
  formatDateKeyRu,
  nextDateKey,
  setSessionDate,
  toDateKey,
  useSessionDate,
} from "@/lib/session-date";
import { buildIncomeSummary } from "@/lib/income-calculator";
import { useSession, useCurrentCashier, useLogout } from "@/lib/auth";
import { CashierManagementDialog } from "@/components/cashier-management-dialog";
import { LogOut } from "lucide-react";
import { HoverCard, HoverCardTrigger } from "@/components/ui/hover-card";
import { ContactBalanceHoverCard } from "@/components/contact-hover-card";
import {
  ContactNotFoundError,
  findContactByName,
  useAddContactTransaction,
  useContactsWithBalances,
  useCreateContact,
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
  groupByDay,
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
  if (currency === "GOLD" || currency === "KZT") {
    // Целый курс без десятичных (напр. 42000 ₸/гр) — группируем пробелами, как везде на сайте,
    // иначе большое число сливается в нечитаемую стену цифр.
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
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
  if (currency === "GOLD") return "42 000";
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
  // Для «Чистая прибыль» в дневном отчёте — тот же метод средневзвешенной
  // себестоимости, что и в «Калькуляторе дохода», чтобы цифры сходились.
  const { data: fxPurchasesAll = [], isLoading: fxPurchasesLoading } = useFxPurchases();
  const { data: fxSalesAll = [], isLoading: fxSalesLoading } = useFxSales();
  const { data: expensesAll = [], isLoading: expensesLoading } = useExpenses();
  const { data: fxCurrenciesAll = [] } = useFxCurrencies();
  // Пока эти журналы ещё не загрузились, weightedAvg считать нельзя — иначе
  // отчёт покажет 0 дохода вместо "подождите" (пустые массивы по умолчанию).
  const weightedAvgDataLoading = fxPurchasesLoading || fxSalesLoading || expensesLoading;

  // "Новый день" — ручное действие, а не полночь по календарю: пока кассу не
  // сбросили явно, дата в шапке и статус "отчёт за сегодня сделан" должны
  // отражать день начала ТЕКУЩЕЙ сессии (первая транзакция после последнего
  // сброса), а не календарную дату устройства — иначе в полночь всё это
  // молча "перескакивает" на следующий день, хотя касса ещё не закрыта.
  const sessionFromTs = useMemo(
    () => (transactions.length > 0 ? Math.min(...transactions.map((t) => t.ts)) : Date.now()),
    [transactions],
  );
  // Рабочая дата смены хранится явно в базе: касса может быть открыта на
  // завтра ещё до полуночи, а забытый вовремя «Новый день» иначе слепил бы
  // операции двух рабочих дней в одну дату. Дата первой операции остаётся
  // запасным вариантом, если в базе ещё ничего не проставлено.
  const { data: storedSessionDate } = useSessionDate();
  const sessionDateKey = useMemo(
    () => storedSessionDate ?? toDateKey(new Date(sessionFromTs)),
    [storedSessionDate, sessionFromTs],
  );
  const sessionDateLabel = useMemo(() => formatDateKeyRu(sessionDateKey), [sessionDateKey]);

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
      return raw ? JSON.parse(raw).date === sessionDateKey : false;
    } catch {
      return false;
    }
  });
  const [newDayOpen, setNewDayOpen] = useState(false);
  const [newDayPin, setNewDayPin] = useState("");
  const [newDayPinError, setNewDayPinError] = useState("");
  // Дата открываемой смены — по умолчанию следующая за текущей рабочей.
  // Ограничения «не позже сегодняшнего» намеренно нет: кассу открывают на
  // завтра ещё вечером.
  const [newDayDate, setNewDayDate] = useState("");
  // Контакт, которого не оказалось в справочнике при вводе операции.
  const [missingContactName, setMissingContactName] = useState<string | null>(null);
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactError, setNewContactError] = useState("");
  const createContact = useCreateContact();
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const { session } = useSession();
  const { data: currentCashier } = useCurrentCashier(session?.user?.id);
  const cashierName = currentCashier?.name;
  const logout = useLogout();

  const { data: contactsWithBalances = [] } = useContactsWithBalances();
  // Перенос остатка с прошлой смены — участвует в расчёте дохода как обычная
  // операция (излишек закупа в покупки, перепродажа в продажи).
  const { data: carryIn = [] } = useSessionCarryIn();
  // Курс закупа по валютам — известен всегда, даже если валюта давно не
  // торговалась и выпала из переноса.
  const { data: costBasis = {} } = useCurrencyCostBasis();
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

  /** Ищет контакт по имени и НЕ создаёт его, если не нашёл. Опечатка в имени
   * больше не заводит новую запись в справочнике — вместо этого касса скажет,
   * что контакта нет, и предложит создать его явно. */
  async function requireContactId(name: string): Promise<string> {
    const id = await findContactByName(name);
    if (!id) throw new ContactNotFoundError(name);
    return id;
  }

  async function addContactLinkedTx(tx: Omit<Transaction, "id" | "ts"> & { id?: string }) {
    const localId = tx.id ?? crypto.randomUUID();
    const full: Transaction = { ...tx, id: localId, ts: Date.now() };

    // Проверяем контакт ДО записи в кассу: если имени нет в справочнике,
    // операция не сохраняется вовсе. Иначе деньги были бы проведены, а по
    // контакту не отразились — молчаливое расхождение, которое потом ищут
    // руками.
    if (isCashContactLinkedTx(full)) {
      const contactName = full.name!.trim();
      const existingId = await findContactByName(contactName);
      if (!existingId) {
        setMissingContactName(contactName);
        return;
      }
    }

    await addCashTx.mutateAsync(full);
    if (!isCashContactLinkedTx(full)) return;

    try {
      const contactId = await requireContactId(full.name!.trim());
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

    const contactId = await requireContactId(contactName);
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
      const contactId = await requireContactId(contactName);
      const contactTxId = await resolveContactTxId(old, contactId);
      if (contactTxId) {
        await deleteContactTx.mutateAsync(contactTxId);
      }
    } catch {
      // касса удалена; связанную операцию контакта можно удалить вручную
    }
  }

  function markReportDone() {
    localStorage.setItem(REPORT_DONE_KEY, JSON.stringify({ date: sessionDateKey, at: Date.now() }));
    setReportDoneToday(true);
  }

  async function openDailyReport() {
    setReportBusy(true);
    try {
      // ВАЖНО: "Новый день" — ручное действие, а не полночь по календарю
      // (см. sessionFromTs выше). Период для маржи по себестоимости берём
      // не "с полуночи по календарю", а по факту — от самой ранней
      // транзакции текущей сессии (обычно это "Остаток" после последнего
      // сброса) до текущего момента. Иначе реальные сделки вчерашним числом
      // просто не попадают в окно и margin считается по пустому диапазону —
      // 0 при живой кассе.
      const toTs = Date.now();
      // Доход смены по простой формуле обменника — она же идёт в отчёт и в
      // лист «Касса».
      const simpleRows = computeSimpleIncome(txsToFxOps(transactions), carryIn);
      const simpleIncomeKzt = totalSimpleIncome(simpleRows);
      const weightedAvg = weightedAvgDataLoading
        ? undefined
        : (() => {
            const sessionIncome = buildIncomeSummary(
              fxPurchasesAll,
              fxSalesAll,
              fxCurrenciesAll,
              sessionFromTs,
              toTs,
              expensesAll,
            );
            const marginByCurrency: Record<string, number> = {};
            for (const row of sessionIncome.byCurrency) {
              marginByCurrency[row.currencyCode] = row.marginKzt;
            }
            const marginByCurrencySimple: Record<string, number> = {};
            for (const row of Object.values(simpleRows)) {
              marginByCurrencySimple[row.currency] = row.incomeKzt;
            }
            return {
              fxMarginKzt: simpleIncomeKzt,
              expensesKzt: sessionIncome.totalExpensesKzt,
              marginByCurrency: { ...marginByCurrency, ...marginByCurrencySimple },
            };
          })();
      // Дата отчёта = дата начала текущей сессии, а не календарная "сегодня"
      // — тот же принцип, что и для шапки страницы: пока не нажали "Новый
      // день", отчёт остаётся датирован тем днём, когда касса реально была
      // открыта.
      const reportDate = dateKeyToDate(sessionDateKey);
      const contactAccounts = contactsWithBalances
        .map((c) => ({
          name: c.name,
          usdBalance: c.balances.USD ?? 0,
          kztBalance: c.balances.KZT ?? 0,
        }))
        .filter((c) => c.usdBalance !== 0 || c.kztBalance !== 0);
      // Лист «Касса» показывает счета по ВСЕМ валютам, а не только USD/KZT —
      // поэтому отдаём полные балансы, а не сокращённый снимок выше.
      const contactBalances = contactsWithBalances
        .map((c) => ({ name: c.name, balances: c.balances }))
        .filter((c) => Object.values(c.balances).some((v) => (v ?? 0) !== 0));
      // Средневзвешенная себестоимость остатка по валютам — «сколько денег
      // вкладчиков вложено в то, что сейчас лежит в кассе».
      // Остатки валют оцениваем по постоянно хранимому курсу закупа. Раньше
      // брали средневзвешенную из журнала покупок, но у валюты, купленной
      // давно и не тронутой с тех пор, журнал мог этого курса уже не знать.
      const inventoryAvgRate: Partial<Record<Currency, number>> = {};
      for (const [code, rate] of Object.entries(costBasis)) {
        if (rate > 0) inventoryAvgRate[code as Currency] = rate;
      }
      for (const row of Object.values(simpleRows)) {
        if (row.avgBuyRate > 0) inventoryAvgRate[row.currency as Currency] = row.avgBuyRate;
      }
      const data = buildDailyReport(
        transactions,
        totals,
        weightedAvg,
        reportDate,
        contactAccounts,
        contactBalances,
        inventoryAvgRate,
        carryIn,
      );
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

  async function submitNewContact() {
    const name = newContactName.trim();
    if (!name) {
      setNewContactError("Введите имя");
      return;
    }
    const existing = await findContactByName(name);
    if (existing) {
      setNewContactError(`Контакт «${name}» уже есть в справочнике`);
      return;
    }
    await createContact.mutateAsync(name);
    setNewContactOpen(false);
    setNewContactName("");
    setNewContactError("");
  }

  function openNewContactDialog(prefill = "") {
    setNewContactName(prefill);
    setNewContactError("");
    setMissingContactName(null);
    setNewContactOpen(true);
  }

  function openNewDayDialog() {
    setNewDayDate(nextDateKey(sessionDateKey));
    setNewDayPin("");
    setNewDayPinError("");
    setNewDayOpen(true);
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
    // "Трата Жұрттың ақшасы" за уходящую сессию целиком (не по календарному
    // дню — сессия могла тянуться дольше суток): валюты, где купили больше,
    // чем продали, — излишек и его средний курс покупки записываются в
    // fx_purchases автоматически, чтобы с завтрашнего дня Калькулятор дохода
    // не считал этот остаток "без себестоимости".
    const sessionExcess = computeSessionExcessByCurrency(txsToFxOps(transactions));
    const excessBuys = Object.values(sessionExcess)
      .filter((row) => row.direction === "excess_buy" && row.excessAmt > 0 && row.avgRate > 0)
      .map((row) => ({
        currencyCode: row.currency,
        foreignAmount: row.excessAmt,
        rate: row.avgRate,
      }));
    // Полный итог по обеим направлениям сохраняется в постоянный журнал —
    // иначе история "Трата Жұрттың ақшасы" терялась бы вместе со сбросом
    // cash_transactions.
    const spendLog = Object.values(sessionExcess);
    // Простой расчёт закрывающейся смены: доход по формуле
    // (ср.курс продажи − ср.курс покупки) × min(куплено, продано), а
    // неперекрытый остаток уезжает в следующую смену обычной операцией.
    const simple = computeSimpleIncome(txsToFxOps(transactions), carryIn);
    const openedDate = newDayDate || nextDateKey(sessionDateKey);
    newDayCashRegister.mutate({
      openings,
      excessBuys,
      spendLog,
      sessionStart: sessionFromTs,
      simpleRows: Object.values(simple),
      carryOut: carryOutFrom(simple),
      closingBusinessDate: sessionDateKey,
      openingBusinessDate: openedDate,
    });
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
              {sessionDateLabel}
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
          onNewContact={() => openNewContactDialog()}
        />
        <ExpensePersonCard
          txs={transactions.filter((t) => t.kind === "expense" && t.expenseType === "person")}
          onAdd={addContactLinkedTx}
          onUpdate={updateTx}
          onDelete={deleteTx}
          contacts={contactsWithBalances}
          contactMap={contactMap}
          onNewContact={() => openNewContactDialog()}
        />
        <div className="lg:col-span-2">
          <ExpenseCategoryCard
            txs={transactions.filter((t) => t.kind === "expense" && t.expenseType !== "person")}
            onAdd={addContactLinkedTx}
            onUpdate={updateTx}
            onDelete={deleteTx}
          />
        </div>

        {/* History */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-5 w-5 text-primary" />
                Журнал изменений
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
                    {groupByDay([...history].reverse(), (h) => h.ts).map((group) => (
                      <div key={group.key}>
                        <div className="sticky top-0 z-10 border-b border-border bg-muted px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {group.label}
                        </div>
                        <ul className="divide-y divide-border">
                          {group.items.map((h) => (
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
                      </div>
                    ))}
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
            onClick={openNewDayDialog}
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
            <Link to="/fx-trades">
              <ArrowLeftRight className="h-4 w-4" />
              Купли/продажи по валютам
            </Link>
          </Button>
          <Button variant="outline" className="w-full gap-2 sm:col-span-2" asChild>
            <Link to="/income-calculator">
              <Calculator className="h-4 w-4" />
              Калькулятор дохода
            </Link>
          </Button>
          <Button variant="outline" className="w-full gap-2 sm:col-span-2" asChild>
            <Link to="/currency-balance">
              <Wallet className="h-4 w-4" />
              Трата Жұрттың ақшасы
            </Link>
          </Button>
          <Button variant="outline" className="w-full gap-2 sm:col-span-2" asChild>
            <Link to="/archive">
              <History className="h-4 w-4" />
              Архив смен (правка прошлых дней)
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

      {/* Контакта нет в справочнике — операция НЕ сохранена */}
      <Dialog open={missingContactName !== null} onOpenChange={(o) => !o && setMissingContactName(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Контакт не найден</DialogTitle>
            <DialogDescription>
              Контакта «{missingContactName}» нет в справочнике, поэтому операция не сохранена.
              Проверьте имя — возможно, опечатка. Если это действительно новый человек, создайте
              его явно.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMissingContactName(null)}>
              Исправить имя
            </Button>
            <Button onClick={() => openNewContactDialog(missingContactName ?? "")}>
              Создать «{missingContactName}»
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Явное создание контакта */}
      <Dialog open={newContactOpen} onOpenChange={setNewContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый контакт</DialogTitle>
            <DialogDescription>
              Имя должно совпадать с тем, как вы будете вводить его в кассе. Проверьте, нет ли
              этого человека в справочнике под другим написанием.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Имя контакта"
            value={newContactName}
            onChange={(e) => {
              setNewContactName(e.target.value);
              setNewContactError("");
            }}
            onKeyDown={(e) => handleEnterKey(e, undefined, submitNewContact)}
            autoFocus
          />
          {newContactName.trim().length > 0 && (
            <div className="text-xs text-muted-foreground">
              {(() => {
                const q = newContactName.trim().toLowerCase();
                const similar = contactsWithBalances
                  .filter((c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase()))
                  .slice(0, 5);
                return similar.length > 0
                  ? `Похожие уже есть: ${similar.map((c) => c.name).join(", ")}`
                  : "Похожих контактов не найдено";
              })()}
            </div>
          )}
          {newContactError && <div className="text-sm text-danger">{newContactError}</div>}
          <DialogFooter>
            <Button onClick={submitNewContact} disabled={createContact.isPending}>
              {createContact.isPending ? "Создаём…" : "Создать"}
            </Button>
          </DialogFooter>
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
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Дата новой смены</label>
            <Input
              type="date"
              value={newDayDate}
              onChange={(e) => setNewDayDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Можно поставить завтрашнюю дату заранее — календарного ограничения нет.
            </p>
          </div>
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
                <div className="text-xs text-muted-foreground">
                  Маржа обмена (KZT, по себестоимости)
                </div>
                <div className="text-lg font-bold tabular-nums text-success">
                  {fmt(data.totalFxMarginKzt)} ₸
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  тот же метод, что в «Калькуляторе дохода» — числа должны сходиться
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
                <h4 className="mb-1 text-sm font-semibold">Купля / продажа</h4>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  Куплено/Продано — только сегодняшние сделки. Маржа — по себестоимости (тот же
                  метод, что и сумма сверху, учитывает остатки с прошлых дней).
                </p>
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
  headerAction,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "success" | "danger" | "primary";
  badge?: string;
  /** Кнопка справа в шапке карточки (например, «Новый контакт»). */
  headerAction?: React.ReactNode;
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
          <span className="flex items-center gap-2">
            {headerAction}
            {badge && (
              <span className="rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {badge}
              </span>
            )}
          </span>
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
  /** Как withRate, но курс необязателен при сохранении — для "Остатка"
   * (курс — это только вручную заданная себестоимость, не обязательная). */
  optionalRate?: boolean;
  withName?: boolean;
  lockName?: boolean;
  excludeKzt?: boolean;
  contactMap?: Map<string, ContactWithBalance>;
}

function TxRow({
  tx,
  onUpdate,
  onDelete,
  withRate,
  optionalRate,
  withName,
  lockName,
  excludeKzt,
  contactMap,
}: RowProps) {
  const showRate = withRate || optionalRate;
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
      rate: withRate ? r : optionalRate ? (r > 0 ? r : undefined) : undefined,
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
            onEnterNext={showRate ? () => rateRef.current?.focus() : save}
          />
          {showRate && (
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
          {tx.rate ? (
            <span className="text-muted-foreground">
              {" "}
              × {fmt(tx.rate, tx.currency === "GOLD" || tx.currency === "KZT" ? 0 : 4)}
            </span>
          ) : null}
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

/** Итог по каждой валюте модуля: сумма + средневзвешенный курс (только по
 * записям, где курс указан). Показывается снизу каждой карточки кассы. */
function CurrencyTotalsFooter({
  txs,
  withRate = true,
}: {
  txs: Transaction[];
  withRate?: boolean;
}) {
  if (txs.length === 0) return null;
  const byCurrency = new Map<string, { amount: number; ratedKzt: number; ratedAmount: number }>();
  for (const t of txs) {
    const cur = byCurrency.get(t.currency) ?? { amount: 0, ratedKzt: 0, ratedAmount: 0 };
    cur.amount += t.amount;
    if (t.rate && t.rate > 0) {
      cur.ratedKzt += t.amount * t.rate;
      cur.ratedAmount += t.amount;
    }
    byCurrency.set(t.currency, cur);
  }
  const entries = [...byCurrency.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs">
      {entries.map(([currency, v]) => (
        <span key={currency} className="tabular-nums">
          <span className="font-semibold">{currency}:</span> {fmt(v.amount)}
          {withRate && v.ratedAmount > 0 && (
            <span className="text-muted-foreground">
              {" "}
              @ ср. {fmt(v.ratedKzt / v.ratedAmount, 4)}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

/** Группирует контакт-привязанные транзакции (Приход / Расход-выдача) по
 * имени: строка человека сворачивается в сумму, разворачивается по клику —
 * иначе список превращается в мессиво отдельных платежей. Записи без имени
 * (свободные заметки, freeMode) остаются отдельным плоским списком снизу.
 * Раскрытая группа — это те же TxRow, что и раньше: правки/удаление работают
 * как и прежде, просто спрятаны за клик по человеку. */
function GroupedTxList({
  txs,
  onUpdate,
  onDelete,
  contactMap,
}: {
  txs: Transaction[];
  onUpdate: RowProps["onUpdate"];
  onDelete: RowProps["onDelete"];
  contactMap?: Map<string, ContactWithBalance>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (txs.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        Записей пока нет
      </div>
    );
  }

  const groups = new Map<string, { displayName: string; txs: Transaction[] }>();
  const flat: Transaction[] = [];
  for (const t of txs) {
    const key = t.name?.trim();
    if (!key) {
      flat.push(t);
      continue;
    }
    const groupKey = key.toLowerCase();
    const g = groups.get(groupKey) ?? { displayName: key, txs: [] };
    g.txs.push(t);
    groups.set(groupKey, g);
  }
  const groupList = [...groups.entries()].sort(
    ([, a], [, b]) => Math.max(...b.txs.map((t) => t.ts)) - Math.max(...a.txs.map((t) => t.ts)),
  );

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="max-h-80 space-y-1.5 overflow-y-auto rounded-md border border-border bg-muted/30 p-1.5">
      {groupList.map(([key, g]) => {
        const totals = new Map<string, number>();
        for (const t of g.txs) totals.set(t.currency, (totals.get(t.currency) ?? 0) + t.amount);
        const isOpen = expanded.has(key);
        const contact = contactMap?.get(key);
        return (
          <div key={key} className="overflow-hidden rounded-md border border-border/60 bg-card">
            <button
              type="button"
              onClick={() => toggle(key)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-accent/40"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                    !isOpen && "-rotate-90",
                  )}
                />
                <span className={cn("truncate font-medium", contact && "text-primary")}>
                  {g.displayName}
                </span>
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {g.txs.length}
                </span>
              </span>
              <span className="shrink-0 tabular-nums font-semibold">
                {[...totals.entries()].map(([cur, amt]) => `${fmt(amt)} ${cur}`).join(" · ")}
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-border/60">
                <ul className="divide-y divide-border">
                  {[...g.txs]
                    .sort((a, b) => b.ts - a.ts)
                    .map((t) => (
                      <TxRow
                        key={t.id}
                        tx={t}
                        onUpdate={onUpdate}
                        onDelete={onDelete}
                        withName
                        lockName
                        contactMap={contactMap}
                      />
                    ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
      {flat.length > 0 && (
        <div className="pt-1">
          <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Без привязки
          </div>
          <ul className="divide-y divide-border rounded-md border border-border/60 bg-card">
            {[...flat]
              .sort((a, b) => b.ts - a.ts)
              .map((t) => (
                <TxRow
                  key={t.id}
                  tx={t}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  withName
                  lockName
                  contactMap={contactMap}
                />
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ============== Quadrants ============== */

export interface AddProps {
  txs: Transaction[];
  onAdd: (tx: Omit<Transaction, "id" | "ts"> & { id?: string }) => void;
  onUpdate: (id: string, patch: Partial<Transaction>) => void;
  onDelete: (id: string) => void;
}

export function OpeningCard({ txs, onAdd, onUpdate, onDelete }: AddProps) {
  const [currency, setCurrency] = useState<Currency>("KZT");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  const isForeign = currency !== "KZT";
  const submit = async () => {
    // Защита от повторного срабатывания, если несколько раз подряд нажать
    // Enter/кнопку, пока предыдущая операция ещё не завершилась — иначе
    // одна и та же транзакция записывается дважды или трижды.
    if (submitting) return;
    const a = parseAmount(amount);
    if (a <= 0) return;
    const r = isForeign ? parseRate(rate) : 0;
    setSubmitting(true);
    try {
      await onAdd({ kind: "opening", currency, amount: a, rate: r > 0 ? r : undefined });
      setAmount("");
      setRate("");
      amountRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <SectionCard title="Остаток на начало дня" icon={Wallet} tone="primary" badge={`${txs.length}`}>
      <div
        className={cn(
          "grid grid-cols-1 gap-2",
          isForeign ? "sm:grid-cols-[1fr_1fr_1fr_auto]" : "sm:grid-cols-[1fr_1fr_auto]",
        )}
      >
        <AmountInput
          ref={amountRef}
          value={amount}
          onChange={setAmount}
          placeholder="Сумма"
          onEnterNext={() => currencyRef.current?.focus()}
        />
        <CurrencySelect
          value={currency}
          onChange={(c) => onCurrencyChange(c, setCurrency, setRate)}
          triggerRef={currencyRef}
          onEnterNext={() => (isForeign ? rateRef.current?.focus() : submit())}
        />
        {isForeign && (
          <RateInput
            ref={rateRef}
            value={rate}
            onChange={setRate}
            currency={currency}
            onEnterSubmit={submit}
          />
        )}
        <Button
          onClick={submit}
          disabled={submitting}
          className="gap-1 bg-success text-success-foreground hover:bg-success/90"
        >
          <Plus className="h-4 w-4" /> Добавить
        </Button>
      </div>
      {isForeign && (
        <p className="text-[11px] text-muted-foreground">
          Курс необязателен, но если знаете себестоимость этого остатка — впишите: тогда он
          будет учтён в «Калькуляторе дохода» и дневном отчёте как реальная покупка, а не «без
          себестоимости» (0 маржи при продаже).
        </p>
      )}
      <TxList txs={txs} onUpdate={onUpdate} onDelete={onDelete} withName optionalRate />
      <CurrencyTotalsFooter txs={txs} />
    </SectionCard>
  );
}

export function BuyCard({ txs, onAdd, onUpdate, onDelete }: AddProps) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  const a = parseAmount(amount),
    r = parseRate(rate);
  const kzt = a * r;
  const submit = async () => {
    // Защита от дублей при многократном Enter, пока запись ещё не ушла —
    // особенно важно для купли/продажи: дубль здесь портит курс и прибыль.
    if (submitting) return;
    if (a <= 0 || r <= 0) return;
    setSubmitting(true);
    try {
      await onAdd({ kind: "buy", currency, amount: a, rate: r });
      setAmount("");
      setRate("");
      amountRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
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
        <Button onClick={submit} disabled={submitting} variant="destructive" className="gap-1">
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
      <CurrencyTotalsFooter txs={txs} />
    </SectionCard>
  );
}

export function SellCard({ txs, onAdd, onUpdate, onDelete }: AddProps) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  const a = parseAmount(amount),
    r = parseRate(rate);
  const kzt = a * r;
  const submit = async () => {
    if (submitting) return;
    if (a <= 0 || r <= 0) return;
    setSubmitting(true);
    try {
      await onAdd({ kind: "sell", currency, amount: a, rate: r });
      setAmount("");
      setRate("");
      amountRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
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
          disabled={submitting}
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
      <CurrencyTotalsFooter txs={txs} />
    </SectionCard>
  );
}

/** Автоподсказка по имени контакта — только поле ввода и выпадающий список,
 * без переключателя режима (используется как внутри ContactAutocompleteField,
 * так и напрямую там, где переключатель режима свой собственный). */
function ContactNameAutocomplete({
  contacts,
  name,
  onNameChange,
  freeMode,
  placeholder,
  nameRef,
  onEnterNext,
}: {
  contacts: ContactWithBalance[];
  name: string;
  onNameChange: (v: string) => void;
  freeMode: boolean;
  placeholder: string;
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
    <div className="relative">
      <FlowInput
        ref={nameRef}
        placeholder={placeholder}
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
      <ContactNameAutocomplete
        contacts={contacts}
        name={name}
        onNameChange={onNameChange}
        freeMode={freeMode}
        placeholder={freeMode ? freePlaceholder : linkedPlaceholder}
        nameRef={nameRef}
        onEnterNext={onEnterNext}
      />
    </>
  );
}

export interface ContactAddProps extends Omit<AddProps, "onAdd"> {
  onAdd: (tx: Omit<Transaction, "id" | "ts"> & { id?: string }) => void | Promise<void>;
  contacts: ContactWithBalance[];
  contactMap: Map<string, ContactWithBalance>;
  /** Открыть диалог создания контакта — ввод имени в поле его больше не создаёт. */
  onNewContact?: () => void;
}

export function IncomeCard({
  txs,
  onAdd,
  onUpdate,
  onDelete,
  contacts,
  contactMap,
  onNewContact,
}: ContactAddProps) {
  const [currency, setCurrency] = useState<Currency>("KZT");
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [freeMode, setFreeMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    // Пока идёт запись (в т.ч. синхронизация с контактом) — игнорируем
    // повторные Enter/клики, иначе одна и та же сумма уходит несколько раз.
    if (submitting) return;
    const a = parseAmount(amount);
    const trimmed = name.trim();
    if (a <= 0) return;
    if (!freeMode && !trimmed) return;
    setSubmitting(true);
    try {
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
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SectionCard
      title="Приход (принесли деньги)"
      icon={HandCoins}
      tone="success"
      badge={`${txs.length}`}
      headerAction={
        onNewContact && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 bg-card px-2 text-xs"
            onClick={onNewContact}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Контакт
          </Button>
        )
      }
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
          disabled={submitting}
          className="gap-1 bg-success text-success-foreground hover:bg-success/90"
        >
          <Plus className="h-4 w-4" /> M+
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Значок слева переключает: привязка к контакту (автоподсказка + баланс при наведении,
        обновляет профиль в Контактах) или просто заметка без привязки.
      </p>
      <GroupedTxList txs={txs} onUpdate={onUpdate} onDelete={onDelete} contactMap={contactMap} />
      <CurrencyTotalsFooter txs={txs} />
    </SectionCard>
  );
}

export interface ExpenseCategoryProps {
  txs: Transaction[];
  onAdd: (tx: Omit<Transaction, "id" | "ts"> & { id?: string }) => void | Promise<void>;
  onUpdate: (id: string, patch: Partial<Transaction>) => void | Promise<void>;
  onDelete: (id: string) => void;
}

/** Модуль невозвратных расходов по 5 фиксированным направлениям. Категория
 * «Зарплаты» вместо суммы открывает мини-модуль зарплат (см. PayrollPanel) —
 * там у каждого сотрудника своя ставка и день выплаты. */
export function ExpenseCategoryCard({ txs, onAdd, onUpdate, onDelete }: ExpenseCategoryProps) {
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0].code);
  const [amount, setAmount] = useState("");
  const [otherNote, setOtherNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const otherRef = useRef<HTMLInputElement>(null);

  const categoryMeta = EXPENSE_CATEGORIES.find((c) => c.code === category) ?? EXPENSE_CATEGORIES[0];
  const isOther = category === "other";
  const isPayroll = category === PAYROLL_CATEGORY_CODE;

  const submit = async () => {
    if (submitting) return;
    const a = parseAmount(amount);
    if (a <= 0) return;
    setSubmitting(true);
    try {
      const label = isOther ? otherNote.trim() || "Прочее" : categoryMeta.label;
      await onAdd({ kind: "expense", currency: "KZT", amount: a, name: label, expenseType: "regular" });
      setAmount("");
      setOtherNote("");
      (isOther ? otherRef : amountRef).current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const categoryTxs = txs.filter((t) => resolveCategory(t.name).category === category);

  return (
    <SectionCard
      title="Расходы (невозвратные)"
      icon={ArrowDownCircle}
      tone="danger"
      badge={`${txs.length}`}
    >
      <div className="flex flex-wrap gap-1.5">
        {EXPENSE_CATEGORIES.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => setCategory(c.code)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition",
              c.code === category
                ? "border-danger bg-danger-soft text-danger"
                : "border-input text-muted-foreground hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {isPayroll ? (
        <PayrollPanel onAdd={onAdd} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
            <AmountInput
              ref={amountRef}
              value={amount}
              onChange={setAmount}
              placeholder={`Сумма (${categoryMeta.label})`}
              onEnterNext={isOther ? () => otherRef.current?.focus() : undefined}
              onEnterSubmit={isOther ? undefined : submit}
            />
            <Button onClick={submit} disabled={submitting} variant="destructive" className="gap-1">
              <Minus className="h-4 w-4" /> M−
            </Button>
          </div>
          {isOther && (
            <Input
              ref={otherRef}
              placeholder="Описание расхода (категория «Прочее»)"
              value={otherNote}
              onChange={(e) => setOtherNote(e.target.value)}
              onKeyDown={(e) => handleEnterKey(e, submit)}
            />
          )}
          <p className="text-[11px] text-muted-foreground">
            Всегда в тенге — учитывается в «Калькуляторе дохода» как расход, уменьшающий чистую
            прибыль, и не создаёт баланс контакта.
          </p>
          <TxList txs={categoryTxs} onUpdate={onUpdate} onDelete={onDelete} />
          <CurrencyTotalsFooter txs={categoryTxs} withRate={false} />
        </>
      )}
    </SectionCard>
  );
}

/** Зарплаты по сотрудникам: у каждого своя ставка и день выплаты в месяце.
 * "Выплачено"/"Не выплачено" — по наличию записи в расходах категории
 * «Зарплаты» с note = имя сотрудника за текущий календарный месяц. */
function PayrollPanel({ onAdd }: { onAdd: ExpenseCategoryProps["onAdd"] }) {
  const { data: employees = [], isLoading } = useEmployees();
  const { data: expensesAll = [] } = useExpenses();
  const addEmployee = useAddEmployee();
  const deleteEmployee = useDeleteEmployee();

  const [newName, setNewName] = useState("");
  const [newSalary, setNewSalary] = useState("");
  const [newPayday, setNewPayday] = useState("5");
  const [addingEmployee, setAddingEmployee] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [paySubmitting, setPaySubmitting] = useState(false);

  const activeEmployees = employees.filter((e) => e.isActive);

  const startPay = (emp: Employee) => {
    setPayingId(emp.id);
    setPayAmount(fmt(emp.salaryKzt));
  };

  const confirmPay = async (emp: Employee) => {
    if (paySubmitting) return;
    const a = parseAmount(payAmount);
    if (a <= 0) return;
    setPaySubmitting(true);
    try {
      await onAdd({
        kind: "expense",
        currency: "KZT",
        amount: a,
        name: `${expenseCategoryLabel(PAYROLL_CATEGORY_CODE)}: ${emp.name}`,
        expenseType: "regular",
      });
      setPayingId(null);
      setPayAmount("");
    } finally {
      setPaySubmitting(false);
    }
  };

  const addEmployeeSubmit = async () => {
    if (addingEmployee) return;
    const name = newName.trim();
    const salary = parseAmount(newSalary);
    const payday = Math.min(31, Math.max(1, parseInt(newPayday, 10) || 1));
    if (!name || salary <= 0) return;
    setAddingEmployee(true);
    try {
      await addEmployee.mutateAsync({ name, salaryKzt: salary, payday });
      setNewName("");
      setNewSalary("");
      setNewPayday("5");
    } finally {
      setAddingEmployee(false);
    }
  };

  return (
    <div className="space-y-3">
      {isLoading && <p className="text-xs text-muted-foreground">Загрузка сотрудников…</p>}
      {!isLoading && activeEmployees.length === 0 && (
        <p className="text-xs text-muted-foreground">Сотрудников пока нет — добавьте ниже.</p>
      )}
      <ul className="space-y-1.5">
        {activeEmployees.map((emp) => {
          const paid = isPaidThisMonth(expensesAll, emp.name);
          return (
            <li key={emp.id} className="rounded-md border border-border bg-card p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{emp.name}</div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <CalendarClock className="h-3 w-3" /> {emp.payday}-е число · {fmt(emp.salaryKzt)} ₸
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      paid ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {paid ? "Выплачено" : "Не выплачено"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-[11px]"
                    onClick={() => startPay(emp)}
                  >
                    Выплатить
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-danger hover:text-danger">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Удалить сотрудника «{emp.name}»?</AlertDialogTitle>
                        <AlertDialogDescription>
                          История уже сделанных выплат в расходах останется — удалится только
                          карточка сотрудника из этого списка.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Отмена</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteEmployee.mutate(emp.id)}
                          className={buttonVariants({ variant: "destructive" })}
                        >
                          Удалить
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              {payingId === emp.id && (
                <div className="mt-2 flex items-center gap-1.5">
                  <AmountInput
                    value={payAmount}
                    onChange={setPayAmount}
                    placeholder="Сумма"
                    className="h-8 text-xs"
                    onEnterSubmit={() => confirmPay(emp)}
                  />
                  <Button
                    size="sm"
                    disabled={paySubmitting}
                    className="h-8 gap-1 bg-danger text-danger-foreground hover:bg-danger/90"
                    onClick={() => confirmPay(emp)}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setPayingId(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="rounded-md border border-dashed border-border p-2.5">
        <div className="mb-2 text-[11px] font-medium text-muted-foreground">Добавить сотрудника</div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_1fr_80px_auto]">
          <Input
            placeholder="Имя"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-8 text-xs"
          />
          <AmountInput
            value={newSalary}
            onChange={setNewSalary}
            placeholder="Оклад ₸"
            className="h-8 text-xs"
          />
          <Input
            type="number"
            min={1}
            max={31}
            placeholder="День"
            value={newPayday}
            onChange={(e) => setNewPayday(e.target.value)}
            className="h-8 text-xs"
          />
          <Button size="sm" disabled={addingEmployee} className="h-8 gap-1" onClick={addEmployeeSubmit}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Выдача денег конкретному контакту (создаёт его долг) — отдельно от
 * невозвратных расходов по категориям, которые теперь в ExpenseCategoryCard. */
export function ExpensePersonCard({
  txs,
  onAdd,
  onUpdate,
  onDelete,
  contacts,
  contactMap,
  onNewContact,
}: ContactAddProps) {
  const [currency, setCurrency] = useState<Currency>("KZT");
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    // Защита от дублей при многократном Enter — без неё именно тут чаще
    // всего плодились повторные списания.
    if (submitting) return;
    const a = parseAmount(amount);
    const trimmed = name.trim();
    if (a <= 0 || !trimmed) return;
    setSubmitting(true);
    try {
      // Подстраховка: если ввели ровно название категории расхода (тамак/
      // зарплаты/ауез ага/куралай апше), не создаём фейковый контакт-должника,
      // а записываем как невозвратный расход, как и было задумано.
      if (matchesExpenseCategoryLabel(trimmed)) {
        await onAdd({
          kind: "expense",
          currency: "KZT",
          amount: a,
          name: trimmed,
          expenseType: "regular",
        });
      } else {
        await onAdd({
          kind: "expense",
          currency,
          amount: a,
          name: trimmed,
          expenseType: "person",
        });
      }
      setName("");
      setAmount("");
      amountRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SectionCard
      title="Расход (выдача контакту)"
      icon={ArrowDownCircle}
      tone="danger"
      badge={`${txs.length}`}
      headerAction={
        onNewContact && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 bg-card px-2 text-xs"
            onClick={onNewContact}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Контакт
          </Button>
        )
      }
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <ContactNameAutocomplete
          contacts={contacts}
          name={name}
          onNameChange={setName}
          freeMode={false}
          placeholder="Кто забрал / кому отдали"
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
        <Button onClick={submit} disabled={submitting} variant="destructive" className="gap-1">
          <Minus className="h-4 w-4" /> M−
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Выдача денег конкретному контакту (долг, любая валюта, автоподсказка + баланс при
        наведении, обновляет профиль в Контактах). Невозвратные расходы по категориям — в
        карточке «Расходы» выше.
      </p>
      <GroupedTxList txs={txs} onUpdate={onUpdate} onDelete={onDelete} contactMap={contactMap} />
      <CurrencyTotalsFooter txs={txs} />
    </SectionCard>
  );
}

import ExcelJS from "exceljs";
import { peopleMoneySpendFromReportTxs } from "@/lib/fx-people-money-spend";

export type Currency = "USD" | "EUR" | "RUB" | "KGS" | "CNY" | "GOLD" | "KZT";
export type TxKind = "opening" | "buy" | "sell" | "income" | "expense";

export interface ReportTransaction {
  id: string;
  kind: TxKind;
  ts: number;
  name?: string;
  currency: Currency;
  amount: number;
  rate?: number;
  expenseType?: "regular" | "person";
}

export interface FxCurrencyRow {
  currency: Currency;
  boughtAmount: number;
  buyKzt: number;
  avgBuyRate: number;
  soldAmount: number;
  sellKzt: number;
  avgSellRate: number;
  matchedAmount: number;
  marginKzt: number;
  netKztFlow: number;
}

export interface DailyReportData {
  dateTitle: string;
  fileBaseName: string;
  generatedAt: string;
  rows: {
    time: string;
    kind: string;
    name: string;
    currency: string;
    amount: number;
    rate: number | null;
    kztEffect: number | null;
    note: string;
  }[];
  opening: Record<Currency, number>;
  closing: Record<Currency, number>;
  fxRows: FxCurrencyRow[];
  totalFxMarginKzt: number;
  incomeByCurrency: Partial<Record<Currency, number>>;
  regularIncomeByCurrency: Partial<Record<Currency, number>>;
  personIncomeByCurrency: Partial<Record<Currency, number>>;
  regularExpenseByCurrency: Partial<Record<Currency, number>>;
  personExpenseByCurrency: Partial<Record<Currency, number>>;
  incomeKzt: number;
  regularIncomeKzt: number;
  personIncomeKzt: number;
  regularExpenseKzt: number;
  personExpenseKzt: number;
  netProfitKzt: number;
  peopleBalance: {
    name: string;
    inKzt: number;
    outKzt: number;
    netKzt: number;
  }[];
  /** USD: трата Жұрттың ақшасы за сессию — либо продали больше, чем купили
   * (излишек продан из резерва), либо купили больше, чем продали (тенге
   * потрачены на остаток). direction === "balanced", если куплено = продано. */
  peopleMoneySpendUsd: {
    boughtUsd: number;
    soldUsd: number;
    direction: "reserve_spend" | "excess_buy" | "balanced";
    excessUsd: number;
    avgRate: number;
    spendKzt: number;
  };
  buyRows: ReportTransaction[];
  sellRows: ReportTransaction[];
  personRows: ReportTransaction[];
  /** Все контакты (валютные счета) с ненулевым балансом в USD и/или KZT —
   * снимок на момент формирования отчёта. */
  contactAccounts: { name: string; usdBalance: number; kztBalance: number }[];
  /** Данные для листа «Касса» — повторяет ручную таблицу обменника. */
  cashSheet: CashSheetData;
}

export interface CashSheetAccount {
  name: string;
  amount: number;
  currency: Currency;
}

export interface CashSheetCurrencyTotal {
  currency: Currency;
  /** Остаток в кассе на конец смены. */
  amount: number;
  /** Средневзвешенный курс покупки этого остатка (0 — если неизвестен). */
  avgRate: number;
  /** amount * avgRate — сколько тенге вложено в этот остаток. */
  costKzt: number;
}

export interface CashSheetData {
  /** Сделки покупки USD за смену: [сумма, курс]. */
  usdBuys: { amount: number; rate: number }[];
  /** Сделки продажи USD за смену: [сумма, курс]. */
  usdSells: { amount: number; rate: number }[];
  /** Остаток = куплено − продано. Положительный — перекупили, отрицательный —
   * перепродали (излишек ушёл из резерва вкладчиков). */
  ostatokUsd: number;
  /** Курс, по которому оценивается остаток: средний курс покупки, если
   * перекупили, средний курс продажи — если перепродали. */
  ostatokRate: number;
  /** Счета в тенге: положительные (мы должны) и «карыз» (нам должны). */
  kztPlus: CashSheetAccount[];
  kztKaryz: CashSheetAccount[];
  /** Долларовые счета: САЛЫНГАН (мы должны) и КАРЫЗ (нам должны). */
  usdSalyngan: CashSheetAccount[];
  usdKaryz: CashSheetAccount[];
  /** Остальные валюты вперемешку, разделённые на «у них есть» и «должны нам». */
  otherPlus: CashSheetAccount[];
  otherKaryz: CashSheetAccount[];
  /** Итоги по валютам в кассе + средний курс покупки остатка. */
  currencyTotals: CashSheetCurrencyTotal[];
  /** Доход за смену (маржа обмена по себестоимости) и чистая прибыль. */
  incomeKzt: number;
  netProfitKzt: number;
}

const FX: Currency[] = ["USD", "EUR", "RUB", "KGS", "CNY", "GOLD"];
const ALL: Currency[] = ["KZT", "USD", "EUR", "RUB", "KGS", "CNY", "GOLD"];

const KIND_LABEL: Record<TxKind, string> = {
  opening: "Остаток",
  buy: "Покупка",
  sell: "Продажа",
  income: "Приход",
  expense: "Расход",
};

function fmt(n: number, frac = 2) {
  if (!isFinite(n)) return "0";
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: frac,
  });
}

export function reportDateSlug(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export function reportFileBaseName(d = new Date()) {
  return `отчет_${reportDateSlug(d)}`;
}

export function todayDateKey(d = new Date()) {
  return reportDateSlug(d);
}

function kindLabel(tx: ReportTransaction) {
  if (tx.kind === "expense" && tx.expenseType === "person") return "Выдача (кому/забрал)";
  if (tx.kind === "expense") return "Обычный расход";
  return KIND_LABEL[tx.kind];
}

function kztEffect(tx: ReportTransaction): number | null {
  switch (tx.kind) {
    case "buy":
      return -(tx.amount * (tx.rate || 0));
    case "sell":
      return tx.amount * (tx.rate || 0);
    case "income":
      return tx.currency === "KZT" ? tx.amount : null;
    case "expense":
      return tx.currency === "KZT" ? -tx.amount : null;
    default:
      return null;
  }
}

function sumByCurrency(
  txs: ReportTransaction[],
  filter: (t: ReportTransaction) => boolean,
): Partial<Record<Currency, number>> {
  const out: Partial<Record<Currency, number>> = {};
  for (const t of txs) {
    if (!filter(t)) continue;
    out[t.currency] = (out[t.currency] || 0) + t.amount;
  }
  return out;
}

export function buildDailyReport(
  transactions: ReportTransaction[],
  closing: Record<Currency, number>,
  /**
   * Маржа обмена и расходы, посчитанные по средневзвешенной себестоимости
   * (тот же метод, что в «Калькуляторе дохода», за сегодня) — если переданы,
   * заменяют собой посуточный matched-volume расчёт margin/расходов в
   * «Чистая прибыль», чтобы дневной отчёт и калькулятор дохода показывали
   * согласованное число. Таблица «Купля/продажа» ниже всё равно остаётся
   * посуточной — это отдельная, честная статистика «что произошло сегодня»,
   * а не про себестоимость.
   */
  weightedAvg?: {
    fxMarginKzt: number;
    expensesKzt: number;
    /** Маржа по себестоимости (weighted-average, тот же метод, что в
     * «Калькуляторе дохода») для каждой валюты за текущую сессию — код
     * валюты → маржа в тенге. Когда есть значение для валюты, подменяет
     * посуточный matched-volume marginKzt в таблице «Купля/продажа» ниже,
     * чтобы строки были согласованы с себестоимостью, а не только сумма
     * сверху. Куплено/Продано/avgBuyRate/avgSellRate остаются посуточными —
     * это честная статистика «что произошло сегодня».
     */
    marginByCurrency?: Record<string, number>;
  },
  /** Дата, которой датируется отчёт (заголовок + имя файла) — это дата
   * НАЧАЛА текущей сессии кассы (первая транзакция после последнего
   * "Новый день"), а НЕ календарная "сегодня". "Новый день" — ручное
   * действие: если его не нажали, отчёт остаётся датирован тем днём, когда
   * касса была реально открыта, даже если сейчас уже наступила полночь. */
  reportDate: Date = new Date(),
  /** Все контакты (валютные счета) с ненулевым балансом USD/KZT — снимок
   * для отдельного листа отчёта. */
  contacts: { name: string; usdBalance: number; kztBalance: number }[] = [],
  /** Полные балансы контактов по ВСЕМ валютам (для листа «Касса»): имя →
   * код валюты → баланс. Знак: плюс — деньги клиента лежат у нас (мы должны),
   * минус — карыз, клиент должен нам. */
  contactBalances: { name: string; balances: Partial<Record<Currency, number>> }[] = [],
  /** Средневзвешенная себестоимость остатка по валютам (из журнала покупок,
   * тот же движок, что в «Калькуляторе дохода»): код валюты → курс. */
  inventoryAvgRate: Partial<Record<Currency, number>> = {},
): DailyReportData {
  const now = new Date();
  const opening: Record<Currency, number> = {
    KZT: 0,
    USD: 0,
    EUR: 0,
    RUB: 0,
    KGS: 0,
    CNY: 0,
    GOLD: 0,
  };
  for (const t of transactions.filter((x) => x.kind === "opening")) {
    opening[t.currency] += t.amount;
  }

  const fxRows: FxCurrencyRow[] = FX.map((currency) => {
    const buys = transactions.filter((t) => t.kind === "buy" && t.currency === currency);
    const sells = transactions.filter((t) => t.kind === "sell" && t.currency === currency);
    const boughtAmount = buys.reduce((s, t) => s + t.amount, 0);
    const buyKzt = buys.reduce((s, t) => s + t.amount * (t.rate || 0), 0);
    const soldAmount = sells.reduce((s, t) => s + t.amount, 0);
    const sellKzt = sells.reduce((s, t) => s + t.amount * (t.rate || 0), 0);
    const avgBuyRate = boughtAmount > 0 ? buyKzt / boughtAmount : 0;
    const avgSellRate = soldAmount > 0 ? sellKzt / soldAmount : 0;
    const matchedAmount = Math.min(boughtAmount, soldAmount);
    const matchedVolumeMarginKzt =
      matchedAmount > 0 && avgBuyRate > 0 && avgSellRate > 0
        ? matchedAmount * (avgSellRate - avgBuyRate)
        : 0;
    const costBasisMarginKzt = weightedAvg?.marginByCurrency?.[currency];
    const marginKzt = costBasisMarginKzt ?? matchedVolumeMarginKzt;
    return {
      currency,
      boughtAmount,
      buyKzt,
      avgBuyRate,
      soldAmount,
      sellKzt,
      avgSellRate,
      matchedAmount,
      marginKzt,
      netKztFlow: sellKzt - buyKzt,
    };
  });

  const matchedVolumeFxMarginKzt = fxRows.reduce((s, r) => s + r.marginKzt, 0);
  const totalFxMarginKzt = weightedAvg?.fxMarginKzt ?? matchedVolumeFxMarginKzt;
  const incomeByCurrency = sumByCurrency(transactions, (t) => t.kind === "income");
  // "person"-tagged income is money deposited by/linked to a contact — it increases what we owe
  // them (a liability), not real business profit. Only free-note income (not linked to any
  // contact, expenseType "regular") is genuine revenue and should count toward net profit —
  // this mirrors how expenses are already split into "regular" (real cost) vs "person" (payout,
  // not a cost).
  const regularIncomeByCurrency = sumByCurrency(
    transactions,
    (t) => t.kind === "income" && t.expenseType !== "person",
  );
  const personIncomeByCurrency = sumByCurrency(
    transactions,
    (t) => t.kind === "income" && t.expenseType === "person",
  );
  const regularExpenseByCurrency = sumByCurrency(
    transactions,
    (t) => t.kind === "expense" && t.expenseType !== "person",
  );
  const personExpenseByCurrency = sumByCurrency(
    transactions,
    (t) => t.kind === "expense" && t.expenseType === "person",
  );
  const incomeKzt = incomeByCurrency.KZT || 0;
  const regularIncomeKzt = regularIncomeByCurrency.KZT || 0;
  const personIncomeKzt = personIncomeByCurrency.KZT || 0;
  const regularExpenseKzt = weightedAvg?.expensesKzt ?? (regularExpenseByCurrency.KZT || 0);
  const personExpenseKzt = personExpenseByCurrency.KZT || 0;
  const netProfitKzt = totalFxMarginKzt + regularIncomeKzt - regularExpenseKzt;
  const buyRows = transactions.filter((t) => t.kind === "buy");
  const sellRows = transactions.filter((t) => t.kind === "sell");
  const personRows = transactions.filter((t) => t.kind === "expense" && t.expenseType === "person");
  const peopleMap = new Map<
    string,
    { name: string; inKzt: number; outKzt: number; netKzt: number }
  >();
  for (const tx of transactions) {
    const name = tx.name?.trim();
    if (!name) continue;
    const inSide = tx.kind === "income";
    const outSide = tx.kind === "expense" && tx.expenseType === "person";
    if (!inSide && !outSide) continue;
    const kzt = tx.currency === "KZT" ? tx.amount : 0;
    const prev = peopleMap.get(name) ?? { name, inKzt: 0, outKzt: 0, netKzt: 0 };
    const next = {
      name,
      inKzt: prev.inKzt + (inSide ? kzt : 0),
      outKzt: prev.outKzt + (outSide ? kzt : 0),
      netKzt: prev.netKzt + (inSide ? kzt : outSide ? -kzt : 0),
    };
    peopleMap.set(name, next);
  }
  const peopleBalance = [...peopleMap.values()].sort(
    (a, b) => Math.abs(b.netKzt) - Math.abs(a.netKzt),
  );

  const peopleMoneyDay = peopleMoneySpendFromReportTxs(transactions);
  const peopleMoneySpendUsd = {
    boughtUsd: peopleMoneyDay.boughtAmt,
    soldUsd: peopleMoneyDay.soldAmt,
    direction: peopleMoneyDay.direction,
    excessUsd: peopleMoneyDay.excessAmt,
    avgRate: peopleMoneyDay.avgRate,
    spendKzt: peopleMoneyDay.spendKzt,
  };

  const contactAccounts = contacts
    .filter((c) => c.usdBalance !== 0 || c.kztBalance !== 0)
    .sort((a, b) => Math.abs(b.usdBalance) + Math.abs(b.kztBalance) - (Math.abs(a.usdBalance) + Math.abs(a.kztBalance)));

  // --- Лист «Касса»: повторяет ручную таблицу обменника -------------------
  const usdBuys = transactions
    .filter((t) => t.kind === "buy" && t.currency === "USD" && (t.rate ?? 0) > 0)
    .sort((a, b) => a.ts - b.ts)
    .map((t) => ({ amount: t.amount, rate: t.rate as number }));
  const usdSells = transactions
    .filter((t) => t.kind === "sell" && t.currency === "USD" && (t.rate ?? 0) > 0)
    .sort((a, b) => a.ts - b.ts)
    .map((t) => ({ amount: t.amount, rate: t.rate as number }));

  const usdBoughtAmt = usdBuys.reduce((n, r) => n + r.amount, 0);
  const usdBoughtKzt = usdBuys.reduce((n, r) => n + r.amount * r.rate, 0);
  const usdSoldAmt = usdSells.reduce((n, r) => n + r.amount, 0);
  const usdSoldKzt = usdSells.reduce((n, r) => n + r.amount * r.rate, 0);
  const usdAvgBuyRate = usdBoughtAmt > 0 ? usdBoughtKzt / usdBoughtAmt : 0;
  const usdAvgSellRate = usdSoldAmt > 0 ? usdSoldKzt / usdSoldAmt : 0;
  const ostatokUsd = usdBoughtAmt - usdSoldAmt;
  // Курс остатка берём с той стороны, которая его и сформировала: перекупили —
  // значит тенге ушли по курсу ПОКУПКИ; перепродали — валюта ушла из резерва
  // по курсу ПРОДАЖИ.
  const ostatokRate = ostatokUsd >= 0 ? usdAvgBuyRate : usdAvgSellRate;

  const kztPlus: CashSheetAccount[] = [];
  const kztKaryz: CashSheetAccount[] = [];
  const usdSalyngan: CashSheetAccount[] = [];
  const usdKaryz: CashSheetAccount[] = [];
  const otherPlus: CashSheetAccount[] = [];
  const otherKaryz: CashSheetAccount[] = [];
  for (const c of contactBalances) {
    for (const code of ALL) {
      const bal = c.balances[code] ?? 0;
      if (bal === 0) continue;
      // Знак используем только для сортировки по колонкам — в самих колонках
      // суммы пишем без знака, как в ручной таблице.
      const entry: CashSheetAccount = { name: c.name, amount: Math.abs(bal), currency: code };
      if (code === "KZT") (bal > 0 ? kztPlus : kztKaryz).push(entry);
      else if (code === "USD") (bal > 0 ? usdSalyngan : usdKaryz).push(entry);
      else (bal > 0 ? otherPlus : otherKaryz).push(entry);
    }
  }
  const byAmountDesc = (a: CashSheetAccount, b: CashSheetAccount) => b.amount - a.amount;
  kztPlus.sort(byAmountDesc);
  kztKaryz.sort(byAmountDesc);
  usdSalyngan.sort(byAmountDesc);
  usdKaryz.sort(byAmountDesc);
  otherPlus.sort(byAmountDesc);
  otherKaryz.sort(byAmountDesc);

  const currencyTotals: CashSheetCurrencyTotal[] = FX.filter(
    (code) => (closing[code] ?? 0) !== 0,
  ).map((code) => {
    // Для USD пишем курс остатка/избытка смены (как просили), для остальных —
    // средневзвешенную себестоимость остатка из журнала покупок.
    const avgRate =
      code === "USD"
        ? ostatokRate || (inventoryAvgRate.USD ?? 0)
        : (inventoryAvgRate[code] ?? 0);
    const amount = closing[code] ?? 0;
    return { currency: code, amount, avgRate, costKzt: amount * avgRate };
  });

  const cashSheet: CashSheetData = {
    usdBuys,
    usdSells,
    ostatokUsd,
    ostatokRate,
    kztPlus,
    kztKaryz,
    usdSalyngan,
    usdKaryz,
    otherPlus,
    otherKaryz,
    currencyTotals,
    incomeKzt: totalFxMarginKzt,
    netProfitKzt,
  };

  const rows = [...transactions]
    .sort((a, b) => a.ts - b.ts)
    .map((tx) => ({
      time: new Date(tx.ts).toLocaleString("ru-RU"),
      kind: kindLabel(tx),
      name: tx.name || "—",
      currency: tx.currency,
      amount: tx.amount,
      rate: tx.rate ?? null,
      kztEffect: kztEffect(tx),
      note:
        tx.kind === "buy" || tx.kind === "sell"
          ? `KZT: ${fmt((kztEffect(tx) || 0) as number)}`
          : "",
    }));

  return {
    dateTitle: reportDate.toLocaleDateString("ru-RU", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    fileBaseName: reportFileBaseName(reportDate),
    generatedAt: now.toLocaleString("ru-RU"),
    rows,
    opening,
    closing,
    fxRows,
    totalFxMarginKzt,
    incomeByCurrency,
    regularIncomeByCurrency,
    personIncomeByCurrency,
    regularExpenseByCurrency,
    personExpenseByCurrency,
    incomeKzt,
    regularIncomeKzt,
    personIncomeKzt,
    regularExpenseKzt,
    personExpenseKzt,
    netProfitKzt,
    peopleBalance,
    peopleMoneySpendUsd,
    contactAccounts,
    cashSheet,
    buyRows,
    sellRows,
    personRows,
  };
}

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E3A5F" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
const ACCENT_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8F4EA" },
};
const WARN_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFCE8E8" },
};

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });
  row.height = 22;
}

function styleDataSheet(ws: ExcelJS.Worksheet) {
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function styleRowBorders(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    };
  });
}

export async function buildReportWorkbook(data: DailyReportData): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Кассовый лист";
  wb.created = new Date();

  const summary = wb.addWorksheet("Сводка", {
    properties: { tabColor: { argb: "FF2563EB" } },
  });
  summary.columns = [{ width: 36 }, { width: 22 }, { width: 22 }];
  summary.mergeCells("A1:C1");
  const title = summary.getCell("A1");
  title.value = `Отчёт — ${data.dateTitle}`;
  title.font = { size: 16, bold: true, color: { argb: "FF1E3A5F" } };
  title.alignment = { horizontal: "center" };
  summary.getCell("A2").value = `Сформирован: ${data.generatedAt}`;
  summary.mergeCells("A2:C2");
  summary.getCell("A2").alignment = { horizontal: "center" };

  let r = 4;
  const addSummaryRow = (label: string, value: string | number, highlight?: "good" | "bad") => {
    summary.getCell(`A${r}`).value = label;
    summary.getCell(`A${r}`).font = { bold: true };
    const valCell = summary.getCell(`B${r}`);
    valCell.value = value;
    if (highlight === "good") valCell.fill = ACCENT_FILL;
    if (highlight === "bad") valCell.fill = WARN_FILL;
    valCell.font = { bold: true, size: 12 };
    r++;
  };

  addSummaryRow("Доход (маржа обмена, KZT, по себестоимости)", data.totalFxMarginKzt, "good");
  const pms = data.peopleMoneySpendUsd;
  if (pms.boughtUsd > 0 || pms.soldUsd > 0) {
    const label =
      pms.direction === "reserve_spend"
        ? "Трата Жұрттың ақшасы — продано сверх покупки (из резерва)"
        : pms.direction === "excess_buy"
          ? "Трата Жұрттың ақшасы — куплено сверх продажи (потрачено тенге на остаток)"
          : "Трата Жұрттың ақшасы (USD, KZT)";
    addSummaryRow(
      label,
      pms.direction !== "balanced"
        ? `${fmt(pms.excessUsd)} $ × ${fmt(pms.avgRate, 4)} = ${fmt(pms.spendKzt)} ₸`
        : "0 (куплено = продано)",
      pms.direction === "reserve_spend" ? "bad" : undefined,
    );
  }
  addSummaryRow("Приход без привязки к контакту KZT", data.regularIncomeKzt, "good");
  addSummaryRow("Обычные расходы KZT", data.regularExpenseKzt, "bad");
  addSummaryRow(
    "Чистая прибыль дня, с учётом расходов (KZT)",
    data.netProfitKzt,
    data.netProfitKzt >= 0 ? "good" : "bad",
  );
  r++;
  addSummaryRow("Приход от контактов KZT (инфо, не прибыль)", data.personIncomeKzt);
  addSummaryRow("Выдачи людям KZT (инфо)", data.personExpenseKzt);

  r += 1;
  summary.getCell(`A${r}`).value = "Остатки на начало / конец";
  summary.getCell(`A${r}`).font = { bold: true, size: 12 };
  r++;
  const balHeader = summary.getRow(r);
  balHeader.values = ["Валюта", "Начало", "Конец"];
  styleHeaderRow(balHeader);
  r++;
  for (const c of ALL) {
    summary.getRow(r).values = [c, data.opening[c], data.closing[c]];
    styleRowBorders(summary.getRow(r));
    summary.getRow(r).eachCell((cell, col) => {
      if (col > 1) cell.numFmt = "#,##0.00";
    });
    r++;
  }

  const accountsSheet = wb.addWorksheet("Валютные счета", {
    properties: { tabColor: { argb: "FFEA580C" } },
  });
  accountsSheet.columns = [{ width: 26 }, { width: 16 }, { width: 16 }];
  styleHeaderRow(accountsSheet.addRow(["Контакт", "USD", "KZT"]));
  for (const c of data.contactAccounts) {
    accountsSheet.addRow([c.name, c.usdBalance, c.kztBalance]);
    const rr = accountsSheet.lastRow;
    if (rr) {
      styleRowBorders(rr);
      rr.getCell(2).numFmt = "#,##0.00";
      rr.getCell(3).numFmt = "#,##0.00";
    }
  }
  accountsSheet.autoFilter = { from: "A1", to: "C1" };
  styleDataSheet(accountsSheet);

  const fx = wb.addWorksheet("Купля-продажа", {
    properties: { tabColor: { argb: "FF059669" } },
  });
  fx.columns = [
    { width: 10 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
  ];
  const fxH = fx.addRow([
    "Валюта",
    "Куплено",
    "KZT ушло",
    "Ср. курс покупки",
    "Продано",
    "KZT пришло",
    "Ср. курс продажи",
    "Сопоставлено",
    "Маржа KZT",
    "Поток KZT",
  ]);
  styleHeaderRow(fxH);
  for (const row of data.fxRows) {
    if (row.boughtAmount === 0 && row.soldAmount === 0) continue;
    fx.addRow([
      row.currency,
      row.boughtAmount,
      row.buyKzt,
      row.avgBuyRate || "—",
      row.soldAmount,
      row.sellKzt,
      row.avgSellRate || "—",
      row.matchedAmount,
      row.marginKzt,
      row.netKztFlow,
    ]);
    const rr = fx.lastRow;
    if (rr) {
      styleRowBorders(rr);
      rr.eachCell((cell, i) => {
        if (i > 1) cell.numFmt = "#,##0.0000";
      });
    }
  }
  fx.autoFilter = { from: "A1", to: "J1" };
  styleDataSheet(fx);

  const ops = wb.addWorksheet("Операции", {
    properties: { tabColor: { argb: "FF7C3AED" } },
  });
  ops.columns = [
    { width: 18 },
    { width: 18 },
    { width: 20 },
    { width: 10 },
    { width: 14 },
    { width: 12 },
    { width: 16 },
    { width: 24 },
  ];
  const opsH = ops.addRow([
    "Время",
    "Тип",
    "Имя/комментарий",
    "Валюта",
    "Сумма",
    "Курс",
    "Эффект KZT",
    "Примечание",
  ]);
  styleHeaderRow(opsH);
  for (const row of data.rows) {
    ops.addRow([
      row.time,
      row.kind,
      row.name,
      row.currency,
      row.amount,
      row.rate ?? "",
      row.kztEffect ?? "",
      row.note,
    ]);
    const rr = ops.lastRow;
    if (rr) {
      styleRowBorders(rr);
      rr.getCell(5).numFmt = "#,##0.00";
      rr.getCell(6).numFmt = "#,##0.0000";
      rr.getCell(7).numFmt = "#,##0.00";
    }
  }
  ops.autoFilter = { from: "A1", to: "H1" };
  styleDataSheet(ops);

  const exp = wb.addWorksheet("Обычные расходы", {
    properties: { tabColor: { argb: "FFDC2626" } },
  });
  exp.columns = [{ width: 22 }, { width: 14 }, { width: 14 }];
  exp.addRow(["Категория", "Валюта", "Сумма"]);
  styleHeaderRow(exp.getRow(1));
  for (const c of ALL) {
    const ex = data.regularExpenseByCurrency[c];
    if (ex) exp.addRow(["Обычный расход", c, ex]);
  }
  exp.eachRow((row, idx) => {
    if (idx === 1) return;
    styleRowBorders(row);
    row.getCell(3).numFmt = "#,##0.00";
  });

  const buySheet = wb.addWorksheet("Купля", { properties: { tabColor: { argb: "FF0EA5E9" } } });
  buySheet.columns = [
    { width: 18 },
    { width: 18 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
  ];
  styleHeaderRow(buySheet.addRow(["Время", "Комментарий", "Валюта", "Сумма", "Курс", "KZT ушло"]));
  for (const tx of data.buyRows) {
    buySheet.addRow([
      new Date(tx.ts).toLocaleString("ru-RU"),
      tx.name || "—",
      tx.currency,
      tx.amount,
      tx.rate ?? "",
      -(tx.amount * (tx.rate || 0)),
    ]);
    const rr = buySheet.lastRow;
    if (rr) {
      styleRowBorders(rr);
      rr.getCell(4).numFmt = "#,##0.00";
      rr.getCell(5).numFmt = "#,##0.0000";
      rr.getCell(6).numFmt = "#,##0.00";
    }
  }
  styleDataSheet(buySheet);

  const sellSheet = wb.addWorksheet("Продажа", { properties: { tabColor: { argb: "FF16A34A" } } });
  sellSheet.columns = [
    { width: 18 },
    { width: 18 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
  ];
  styleHeaderRow(
    sellSheet.addRow(["Время", "Комментарий", "Валюта", "Сумма", "Курс", "KZT пришло"]),
  );
  for (const tx of data.sellRows) {
    sellSheet.addRow([
      new Date(tx.ts).toLocaleString("ru-RU"),
      tx.name || "—",
      tx.currency,
      tx.amount,
      tx.rate ?? "",
      tx.amount * (tx.rate || 0),
    ]);
    const rr = sellSheet.lastRow;
    if (rr) {
      styleRowBorders(rr);
      rr.getCell(4).numFmt = "#,##0.00";
      rr.getCell(5).numFmt = "#,##0.0000";
      rr.getCell(6).numFmt = "#,##0.00";
    }
  }
  styleDataSheet(sellSheet);

  const peopleSheet = wb.addWorksheet("Кому отдали", {
    properties: { tabColor: { argb: "FF9333EA" } },
  });
  peopleSheet.columns = [{ width: 18 }, { width: 24 }, { width: 10 }, { width: 14 }, { width: 14 }];
  styleHeaderRow(peopleSheet.addRow(["Время", "Кто забрал / кому", "Валюта", "Сумма", "KZT"]));
  for (const tx of data.personRows) {
    peopleSheet.addRow([
      new Date(tx.ts).toLocaleString("ru-RU"),
      tx.name || "—",
      tx.currency,
      tx.amount,
      tx.currency === "KZT" ? tx.amount : "",
    ]);
    const rr = peopleSheet.lastRow;
    if (rr) {
      styleRowBorders(rr);
      rr.getCell(4).numFmt = "#,##0.00";
      rr.getCell(5).numFmt = "#,##0.00";
    }
  }
  styleDataSheet(peopleSheet);

  const peopleBalanceSheet = wb.addWorksheet("Лица на балансе", {
    properties: { tabColor: { argb: "FF7C3AED" } },
  });
  peopleBalanceSheet.columns = [{ width: 24 }, { width: 16 }, { width: 16 }, { width: 16 }];
  styleHeaderRow(peopleBalanceSheet.addRow(["Имя", "Внесли KZT", "Забрали KZT", "Баланс KZT"]));
  for (const row of data.peopleBalance) {
    peopleBalanceSheet.addRow([row.name, row.inKzt, row.outKzt, row.netKzt]);
    const rr = peopleBalanceSheet.lastRow;
    if (rr) {
      styleRowBorders(rr);
      rr.getCell(2).numFmt = "#,##0.00";
      rr.getCell(3).numFmt = "#,##0.00";
      rr.getCell(4).numFmt = "#,##0.00";
    }
  }
  styleDataSheet(peopleBalanceSheet);

  styleDataSheet(exp);

  buildCashSheet(wb, data);

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/**
 * Лист «Касса» — электронная копия ручной таблицы обменника.
 *
 * Структура повторяет привычный лист один в один, чтобы его можно было
 * читать и сверять глазами без переучивания:
 *   • сверху две колонки сделок по доллару — покупка (A:D) и продажа (F:I),
 *     с итогом объёма, средним курсом (=сумма тенге / сумма валюты) и суммой
 *     тенге в последней строке;
 *   • ниже «Остаток» = куплено − продано: без знака, если перекупили, и с
 *     минусом, если перепродали (излишек ушёл из резерва вкладчиков);
 *   • ниже блок счетов: тенге (у кого лежит / карыз), доллар (САЛЫНГАН /
 *     КАРЫЗ), иные валюты (есть / должны нам), у каждой колонки — сумма внизу;
 *   • справа итоги по валютам в кассе со средним курсом покупки остатка —
 *     это и есть ответ на вопрос «сколько денег вкладчиков во что вложено»;
 *   • в самом низу справа — доход за смену и чистая прибыль.
 *
 * Суммы и средние курсы записаны формулами (SUM / деление), а не готовыми
 * числами — так лист остаётся живым: можно поправить строку руками, и итоги
 * пересчитаются сами, как в исходной таблице.
 */
function buildCashSheet(wb: ExcelJS.Workbook, data: DailyReportData) {
  const cs = data.cashSheet;
  const ws = wb.addWorksheet("Касса", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = [
    { width: 16 }, // A  покупка: сумма
    { width: 11 }, // B  покупка: курс
    { width: 18 }, // C  покупка: тенге
    { width: 3 }, // D  разделитель
    { width: 16 }, // E  продажа: сумма
    { width: 11 }, // F  продажа: курс
    { width: 18 }, // G  продажа: тенге
    { width: 3 }, // H  разделитель
    { width: 20 }, // I  тенге плюс: имя
    { width: 16 }, // J  тенге плюс: сумма
    { width: 20 }, // K  тенге карыз: имя
    { width: 16 }, // L  тенге карыз: сумма
    { width: 3 }, // M  разделитель
    { width: 20 }, // N  САЛЫНГАН: имя
    { width: 14 }, // O  САЛЫНГАН: сумма
    { width: 20 }, // P  доллар КАРЫЗ: имя
    { width: 14 }, // Q  доллар КАРЫЗ: сумма
    { width: 3 }, // R  разделитель
    { width: 20 }, // S  иные валюты (есть): имя
    { width: 8 }, //  T  иные валюты (есть): валюта
    { width: 15 }, // U  иные валюты (есть): сумма
    { width: 20 }, // V  иные валюты (карыз): имя
    { width: 8 }, //  W  иные валюты (карыз): валюта
    { width: 15 }, // X  иные валюты (карыз): сумма
    { width: 3 }, //  Y  разделитель
    { width: 12 }, // Z  итог: валюта
    { width: 16 }, // AA итог: остаток
    { width: 13 }, // AB итог: ср. курс покупки
    { width: 18 }, // AC итог: вложено тенге
  ];

  const cell = (addr: string, value: ExcelJS.CellValue, opts?: {
    bold?: boolean;
    numFmt?: string;
    fill?: ExcelJS.Fill;
    color?: string;
  }) => {
    const c = ws.getCell(addr);
    c.value = value;
    if (opts?.bold || opts?.color) {
      c.font = { bold: opts?.bold ?? false, color: opts?.color ? { argb: opts.color } : undefined };
    }
    if (opts?.numFmt) c.numFmt = opts.numFmt;
    if (opts?.fill) c.fill = opts.fill;
    return c;
  };

  const MONEY = "#,##0.00";
  const RATE = "#,##0.0000";
  const RED = "FFB91C1C";

  // --- Заголовок ---------------------------------------------------------
  ws.mergeCells("A1:G1");
  cell("A1", `Касса — ${data.dateTitle}`, { bold: true });
  ws.getCell("A1").font = { size: 14, bold: true, color: { argb: "FF1E3A5F" } };
  ws.getCell("A1").alignment = { horizontal: "center" };

  // --- Сделки по доллару -------------------------------------------------
  const TRADE_HEAD = 3;
  const TRADE_START = TRADE_HEAD + 1;
  cell("A2", "ПОКУПКА ДОЛЛАРА", { bold: true });
  cell("E2", "ПРОДАЖА ДОЛЛАРА", { bold: true });
  styleHeaderRow(
    ws.getRow(TRADE_HEAD),
  );
  cell(`A${TRADE_HEAD}`, "Сумма $", { bold: true });
  cell(`B${TRADE_HEAD}`, "Курс", { bold: true });
  cell(`C${TRADE_HEAD}`, "Тенге", { bold: true });
  cell(`E${TRADE_HEAD}`, "Сумма $", { bold: true });
  cell(`F${TRADE_HEAD}`, "Курс", { bold: true });
  cell(`G${TRADE_HEAD}`, "Тенге", { bold: true });

  const tradeCount = Math.max(cs.usdBuys.length, cs.usdSells.length, 1);
  for (let i = 0; i < tradeCount; i++) {
    const rowNo = TRADE_START + i;
    const buy = cs.usdBuys[i];
    const sell = cs.usdSells[i];
    if (buy) {
      cell(`A${rowNo}`, buy.amount, { numFmt: MONEY });
      cell(`B${rowNo}`, buy.rate, { numFmt: RATE });
      cell(`C${rowNo}`, { formula: `A${rowNo}*B${rowNo}` }, { numFmt: MONEY });
    }
    if (sell) {
      cell(`E${rowNo}`, sell.amount, { numFmt: MONEY });
      cell(`F${rowNo}`, sell.rate, { numFmt: RATE });
      cell(`G${rowNo}`, { formula: `E${rowNo}*F${rowNo}` }, { numFmt: MONEY });
    }
  }

  // Итоговая строка: объём, средний курс (тенге / объём) и сумма тенге —
  // ровно те же формулы, что в ручной таблице.
  const TRADE_END = TRADE_START + tradeCount - 1;
  const totalRow = TRADE_END + 1;
  cell(`A${totalRow}`, { formula: `SUM(A${TRADE_START}:A${TRADE_END})` }, {
    bold: true,
    numFmt: MONEY,
    fill: ACCENT_FILL,
  });
  cell(
    `B${totalRow}`,
    { formula: `IF(A${totalRow}=0,0,C${totalRow}/A${totalRow})` },
    { bold: true, numFmt: RATE, fill: ACCENT_FILL },
  );
  cell(`C${totalRow}`, { formula: `SUM(C${TRADE_START}:C${TRADE_END})` }, {
    bold: true,
    numFmt: MONEY,
    fill: ACCENT_FILL,
  });
  cell(`E${totalRow}`, { formula: `SUM(E${TRADE_START}:E${TRADE_END})` }, {
    bold: true,
    numFmt: MONEY,
    fill: ACCENT_FILL,
  });
  cell(
    `F${totalRow}`,
    { formula: `IF(E${totalRow}=0,0,G${totalRow}/E${totalRow})` },
    { bold: true, numFmt: RATE, fill: ACCENT_FILL },
  );
  cell(`G${totalRow}`, { formula: `SUM(G${TRADE_START}:G${TRADE_END})` }, {
    bold: true,
    numFmt: MONEY,
    fill: ACCENT_FILL,
  });

  // --- Остаток -----------------------------------------------------------
  const ostRow = totalRow + 2;
  cell(`A${ostRow}`, "Остаток", { bold: true });
  // Куплено − продано. Знак несёт смысл: плюс — перекупили (тенге вложены в
  // валюту), минус — перепродали (валюта ушла из резерва вкладчиков).
  cell(`B${ostRow}`, { formula: `A${totalRow}-E${totalRow}` }, {
    bold: true,
    numFmt: MONEY,
    color: cs.ostatokUsd < 0 ? RED : undefined,
  });
  // Курс остатка тоже формулой, а не числом: если поправить строку сделки
  // руками, остаток и его курс пересчитаются сами — как в ручной таблице.
  cell(
    `C${ostRow}`,
    { formula: `IF(B${ostRow}>=0,B${totalRow},F${totalRow})` },
    { bold: true, numFmt: RATE },
  );
  cell(`E${ostRow}`, cs.ostatokUsd >= 0 ? "перекупили (закуп)" : "перепродали (из резерва)", {
    color: cs.ostatokUsd < 0 ? RED : undefined,
  });
  cell(`F${ostRow}`, { formula: `B${ostRow}*C${ostRow}` }, { bold: true, numFmt: MONEY });
  cell(`G${ostRow}`, "тенге по остатку");

  // --- Блок счетов -------------------------------------------------------
  const ACC_HEAD = ostRow + 3;
  const ACC_START = ACC_HEAD + 1;
  cell(`I${ACC_HEAD}`, "тенге — плюс", { bold: true });
  cell(`J${ACC_HEAD}`, "сумма", { bold: true });
  cell(`K${ACC_HEAD}`, "тенге — карыз", { bold: true });
  cell(`L${ACC_HEAD}`, "сумма", { bold: true });
  cell(`N${ACC_HEAD}`, "САЛЫНГАН ($)", { bold: true });
  cell(`O${ACC_HEAD}`, "сумма", { bold: true });
  cell(`P${ACC_HEAD}`, "КАРЫЗ ($)", { bold: true });
  cell(`Q${ACC_HEAD}`, "сумма", { bold: true });
  cell(`S${ACC_HEAD}`, "иные валюты — есть", { bold: true });
  cell(`T${ACC_HEAD}`, "вал.", { bold: true });
  cell(`U${ACC_HEAD}`, "сумма", { bold: true });
  cell(`V${ACC_HEAD}`, "иные валюты — карыз", { bold: true });
  cell(`W${ACC_HEAD}`, "вал.", { bold: true });
  cell(`X${ACC_HEAD}`, "сумма", { bold: true });
  styleHeaderRow(ws.getRow(ACC_HEAD));

  const writeAccounts = (
    list: CashSheetAccount[],
    nameCol: string,
    amountCol: string,
    currencyCol?: string,
  ) => {
    list.forEach((acc, i) => {
      const rowNo = ACC_START + i;
      cell(`${nameCol}${rowNo}`, acc.name);
      if (currencyCol) cell(`${currencyCol}${rowNo}`, acc.currency);
      cell(`${amountCol}${rowNo}`, acc.amount, {
        numFmt: acc.currency === "GOLD" ? "#,##0.000" : MONEY,
      });
    });
  };
  writeAccounts(cs.kztPlus, "I", "J");
  writeAccounts(cs.kztKaryz, "K", "L");
  writeAccounts(cs.usdSalyngan, "N", "O");
  writeAccounts(cs.usdKaryz, "P", "Q");
  // Иные валюты идут вперемешку в одной колонке, поэтому у них есть отдельная
  // колонка кода валюты — по ней же считаются подытоги (складывать EUR с
  // золотом в одно число бессмысленно).
  writeAccounts(cs.otherPlus, "S", "U", "T");
  writeAccounts(cs.otherKaryz, "V", "X", "W");

  const accLen = Math.max(
    cs.kztPlus.length,
    cs.kztKaryz.length,
    cs.usdSalyngan.length,
    cs.usdKaryz.length,
    cs.otherPlus.length,
    cs.otherKaryz.length,
    1,
  );
  const ACC_END = ACC_START + accLen - 1;
  const accTotalRow = ACC_END + 1;
  for (const col of ["J", "L", "O", "Q"]) {
    cell(
      `${col}${accTotalRow}`,
      { formula: `SUM(${col}${ACC_START}:${col}${ACC_END})` },
      { bold: true, numFmt: MONEY, fill: ACCENT_FILL },
    );
  }
  cell(`I${accTotalRow}`, "ИТОГО", { bold: true });
  cell(`K${accTotalRow}`, "ИТОГО", { bold: true });
  cell(`N${accTotalRow}`, "ИТОГО", { bold: true });
  cell(`P${accTotalRow}`, "ИТОГО", { bold: true });

  // Иные валюты: подытог отдельной строкой на КАЖДУЮ валюту (SUMIF по коду),
  // а не одной суммой — иначе в итоге сложились бы евро с граммами золота.
  const otherCodes = [
    ...new Set([...cs.otherPlus, ...cs.otherKaryz].map((a) => a.currency)),
  ].sort();
  otherCodes.forEach((code, i) => {
    const rowNo = accTotalRow + i;
    cell(`S${rowNo}`, `ИТОГО ${code}`, { bold: true });
    cell(
      `U${rowNo}`,
      { formula: `SUMIF(T${ACC_START}:T${ACC_END},"${code}",U${ACC_START}:U${ACC_END})` },
      { bold: true, numFmt: code === "GOLD" ? "#,##0.000" : MONEY, fill: ACCENT_FILL },
    );
    cell(`V${rowNo}`, `ИТОГО ${code}`, { bold: true });
    cell(
      `X${rowNo}`,
      { formula: `SUMIF(W${ACC_START}:W${ACC_END},"${code}",X${ACC_START}:X${ACC_END})` },
      { bold: true, numFmt: code === "GOLD" ? "#,##0.000" : MONEY, fill: ACCENT_FILL },
    );
  });

  // Разница «лежит у нас» − «должны нам» по тенге и доллару.
  const diffRow = accTotalRow + 1;
  cell(`I${diffRow}`, "Разница (тенге)", { bold: true });
  cell(`J${diffRow}`, { formula: `J${accTotalRow}-L${accTotalRow}` }, {
    bold: true,
    numFmt: MONEY,
  });
  cell(`N${diffRow}`, "Разница ($)", { bold: true });
  cell(`O${diffRow}`, { formula: `O${accTotalRow}-Q${accTotalRow}` }, {
    bold: true,
    numFmt: MONEY,
  });

  // --- Итоги по валютам в кассе -----------------------------------------
  const CUR_HEAD = ACC_HEAD;
  cell(`Z${CUR_HEAD}`, "Валюта", { bold: true });
  cell(`AA${CUR_HEAD}`, "Остаток", { bold: true });
  cell(`AB${CUR_HEAD}`, "Ср. курс покупки", { bold: true });
  cell(`AC${CUR_HEAD}`, "Вложено ₸", { bold: true });

  const curStart = CUR_HEAD + 1;
  cs.currencyTotals.forEach((t, i) => {
    const rowNo = curStart + i;
    cell(`Z${rowNo}`, t.currency, { bold: true });
    cell(`AA${rowNo}`, t.amount, { numFmt: t.currency === "GOLD" ? "#,##0.000" : MONEY });
    cell(`AB${rowNo}`, t.avgRate, { numFmt: RATE });
    cell(`AC${rowNo}`, { formula: `AA${rowNo}*AB${rowNo}` }, { numFmt: MONEY });
  });
  const curEnd = curStart + Math.max(cs.currencyTotals.length, 1) - 1;
  const curTotalRow = curEnd + 1;
  cell(`Z${curTotalRow}`, "ИТОГО ₸", { bold: true });
  cell(`AC${curTotalRow}`, { formula: `SUM(AC${curStart}:AC${curEnd})` }, {
    bold: true,
    numFmt: MONEY,
    fill: ACCENT_FILL,
  });

  // --- Доход и прибыль ---------------------------------------------------
  const incomeRow = curTotalRow + 2;
  cell(`Z${incomeRow}`, "Доход за смену ₸", { bold: true });
  cell(`AC${incomeRow}`, cs.incomeKzt, {
    bold: true,
    numFmt: MONEY,
    fill: ACCENT_FILL,
    color: cs.incomeKzt < 0 ? RED : undefined,
  });
  const profitRow = incomeRow + 1;
  cell(`Z${profitRow}`, "Чистая прибыль ₸", { bold: true });
  cell(`AC${profitRow}`, cs.netProfitKzt, {
    bold: true,
    numFmt: MONEY,
    fill: cs.netProfitKzt < 0 ? WARN_FILL : ACCENT_FILL,
    color: cs.netProfitKzt < 0 ? RED : undefined,
  });
}

export function downloadExcelBuffer(buffer: ArrayBuffer, fileBaseName: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileBaseName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

const DIR_DB = "cash-report-dir";
const DIR_STORE = "handles";

type DirHandleWithPerms = FileSystemDirectoryHandle & {
  queryPermission: (opts: { mode: string }) => Promise<PermissionState>;
  requestPermission: (opts: { mode: string }) => Promise<PermissionState>;
};

export async function pickReportsDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const w = window as unknown as {
    showDirectoryPicker?: (opts?: {
      mode?: string;
      id?: string;
      startIn?: string;
    }) => Promise<FileSystemDirectoryHandle>;
  };
  if (!w.showDirectoryPicker) return null;
  try {
    const handle = await w.showDirectoryPicker({
      mode: "readwrite",
      id: "cash-flow-reports",
      startIn: "documents",
    });
    await saveDirectoryHandle(handle);
    return handle;
  } catch {
    return null;
  }
}

async function saveDirectoryHandle(handle: FileSystemDirectoryHandle) {
  try {
    const db = await openDirDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DIR_STORE, "readwrite");
      tx.objectStore(DIR_STORE).put(handle, "reports");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export async function loadReportsDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDirDb();
    const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
      const tx = db.transaction(DIR_STORE, "readonly");
      const req = tx.objectStore(DIR_STORE).get("reports");
      req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!handle) return null;
    const h = handle as DirHandleWithPerms;
    const perm = await h.queryPermission({ mode: "readwrite" });
    if (perm === "granted") return handle;
    const req = await h.requestPermission({ mode: "readwrite" });
    return req === "granted" ? handle : null;
  } catch {
    return null;
  }
}

function openDirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DIR_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DIR_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveExcelToDirectory(
  buffer: ArrayBuffer,
  fileBaseName: string,
  dir?: FileSystemDirectoryHandle | null,
) {
  const handle = dir ?? (await loadReportsDirectory());
  if (!handle) return false;
  try {
    const fileHandle = await handle.getFileHandle(`${fileBaseName}.xlsx`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(buffer);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

export { fmt };

import type { CashFxOp } from "@/lib/fx-people-money-spend";

/**
 * Простой расчёт дохода обменника — тот, по которому касса считает вручную.
 *
 *     доход = (ср. курс продажи − ср. курс покупки) × min(куплено, продано)
 *
 * Умножаем на МЕНЬШИЙ из двух объёмов: только он реально «закрылся» сделкой
 * туда-обратно. Разница объёмов дохода пока не даёт — она превращается в
 * остаток и переезжает в следующую смену ОБЫЧНОЙ ОПЕРАЦИЕЙ:
 *
 *   • купили больше, чем продали → излишек по среднему курсу ПОКУПКИ встаёт
 *     в раздел покупок следующей смены;
 *   • продали больше, чем купили → излишек по среднему курсу ПРОДАЖИ встаёт
 *     в раздел продаж следующей смены.
 *
 * Почему перепроданный остаток идёт именно в продажу, а не вычитается из
 * покупки: продали мы чужие деньги (валюту вкладчика), и доход по ним
 * появляется в тот день, когда выкупим обратно. Пример: рубль Замана —
 * он принёс 1 000 000 ₽, мы продали их по 5.46, назавтра выкупили по 5.411 и
 * вернули ему. Перенос в продажу даёт этой паре встретиться и показывает
 * доход (5.46 − 5.411) × 1 000 000 = 49 000 ₸. Если бы мы вычли миллион из
 * покупки, доход по этой сделке просто потерялся бы.
 */

export type ExcessDirection = "excess_buy" | "reserve_spend" | "balanced";

/** Перенос остатка с прошлой смены. Знак: >0 — излишек закупа (в покупки),
 * <0 — перепродали (в продажи). */
export interface CarryIn {
  currency: string;
  amount: number;
  rate: number;
}

export interface SimpleCurrencyIncome {
  currency: string;
  /** Куплено за смену ВКЛЮЧАЯ перенос-излишек закупа с прошлой смены. */
  boughtAmt: number;
  boughtKzt: number;
  avgBuyRate: number;
  /** Продано за смену ВКЛЮЧАЯ перенос-перепродажу с прошлой смены. */
  soldAmt: number;
  soldKzt: number;
  avgSellRate: number;
  /** min(boughtAmt, soldAmt) — объём, на который считается доход. */
  matchedAmt: number;
  incomeKzt: number;
  /** Остаток, уходящий в следующую смену (всегда положительный, сторону
   * задаёт direction). */
  excessAmt: number;
  /** Средний курс той стороны, которая сформировала остаток. */
  excessRate: number;
  /** Остаток в тенге СО ЗНАКОМ: минус — перепродали (отдали из резерва). */
  excessKzt: number;
  direction: ExcessDirection;
  /** Применённый перенос с прошлой смены — для прозрачности в отчёте. */
  carryInAmount: number;
  carryInRate: number;
}

function emptyRow(currency: string): SimpleCurrencyIncome {
  return {
    currency,
    boughtAmt: 0,
    boughtKzt: 0,
    avgBuyRate: 0,
    soldAmt: 0,
    soldKzt: 0,
    avgSellRate: 0,
    matchedAmt: 0,
    incomeKzt: 0,
    excessAmt: 0,
    excessRate: 0,
    excessKzt: 0,
    direction: "balanced",
    carryInAmount: 0,
    carryInRate: 0,
  };
}

/**
 * Доход по валютам за одну смену.
 *
 * @param ops   операции покупки/продажи текущей смены (из кассы)
 * @param carry перенос остатка с прошлой смены
 */
export function computeSimpleIncome(
  ops: CashFxOp[],
  carry: CarryIn[] = [],
): Record<string, SimpleCurrencyIncome> {
  const result: Record<string, SimpleCurrencyIncome> = {};
  const get = (currency: string) => {
    const row = result[currency] ?? emptyRow(currency);
    result[currency] = row;
    return row;
  };

  // Перенос кладём ПЕРВЫМ — это такая же операция, как любая сделка смены,
  // просто совершённая вчера.
  for (const c of carry) {
    if (!c.amount || !c.rate) continue;
    const row = get(c.currency);
    row.carryInAmount = c.amount;
    row.carryInRate = c.rate;
    const abs = Math.abs(c.amount);
    if (c.amount > 0) {
      row.boughtAmt += abs;
      row.boughtKzt += abs * c.rate;
    } else {
      row.soldAmt += abs;
      row.soldKzt += abs * c.rate;
    }
  }

  for (const op of ops) {
    if (op.currency === "KZT") continue;
    const row = get(op.currency);
    if (op.kind === "buy") {
      row.boughtAmt += op.foreignAmount;
      row.boughtKzt += op.kztAmount;
    } else {
      row.soldAmt += op.foreignAmount;
      row.soldKzt += op.kztAmount;
    }
  }

  for (const row of Object.values(result)) {
    row.avgBuyRate = row.boughtAmt > 0 ? row.boughtKzt / row.boughtAmt : 0;
    row.avgSellRate = row.soldAmt > 0 ? row.soldKzt / row.soldAmt : 0;
    row.matchedAmt = Math.min(row.boughtAmt, row.soldAmt);
    // Доход есть только там, где обе стороны ненулевые: одна лишь покупка
    // (или одна лишь продажа) курсовой разницы ещё не даёт.
    row.incomeKzt =
      row.boughtAmt > 0 && row.soldAmt > 0
        ? (row.avgSellRate - row.avgBuyRate) * row.matchedAmt
        : 0;

    const excess = row.boughtAmt - row.soldAmt;
    row.excessAmt = Math.abs(excess);
    if (excess > 0) {
      row.direction = "excess_buy";
      row.excessRate = row.avgBuyRate;
    } else if (excess < 0) {
      row.direction = "reserve_spend";
      row.excessRate = row.avgSellRate;
    } else {
      row.direction = "balanced";
      row.excessRate = 0;
    }
    // Со знаком: минус означает «отдали из резерва вкладчиков».
    row.excessKzt = excess >= 0 ? row.excessAmt * row.excessRate : -row.excessAmt * row.excessRate;
  }

  return result;
}

/** Суммарный доход за смену по всем валютам. */
export function totalSimpleIncome(rows: Record<string, SimpleCurrencyIncome>): number {
  return Object.values(rows).reduce((s, r) => s + r.incomeKzt, 0);
}

/** Что записать в перенос на следующую смену: знак кодирует сторону. */
export function carryOutFrom(rows: Record<string, SimpleCurrencyIncome>): CarryIn[] {
  return Object.values(rows)
    .filter((r) => r.excessAmt > 0 && r.excessRate > 0)
    .map((r) => ({
      currency: r.currency,
      amount: r.direction === "excess_buy" ? r.excessAmt : -r.excessAmt,
      rate: r.excessRate,
    }));
}

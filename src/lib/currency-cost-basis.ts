import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SimpleCurrencyIncome } from "@/lib/simple-income";

/**
 * Средний курс покупки по каждой валюте — хранится постоянно.
 *
 * Перенос остатка (session_carry_in) есть только у валют, где за смену были
 * сделки или остался неперекрытый объём. Валюта, пролежавшая без движения,
 * из цепочки выпадает вместе со своим курсом закупа. Именно так потерялось
 * золото: 780 г в кассе, а в цепочке 10 г по 62 000 — и продажа 200 г дала
 * 35 000 ₸ вместо 342 882 ₸.
 *
 * Здесь курс живёт отдельно от активности: обновляется при каждой закупке и
 * остаётся известным сколько угодно долго.
 */

export const COST_BASIS_KEY = ["currency-cost-basis"];

export function useCurrencyCostBasis() {
  return useQuery({
    queryKey: COST_BASIS_KEY,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.from("currency_cost_basis").select("*");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[r.currency_code] = Number(r.avg_buy_rate);
      return map;
    },
  });
}

/**
 * Обновляет курс закупа по итогам смены. Пишем только те валюты, где за смену
 * реально покупали: если покупок не было, прежний курс важнее — он и есть
 * себестоимость лежащего запаса.
 */
export async function updateCostBasis(rows: SimpleCurrencyIncome[]) {
  const payload = rows
    .filter((r) => r.boughtAmt > 0 && r.avgBuyRate > 0)
    .map((r) => ({
      currency_code: r.currency,
      avg_buy_rate: r.avgBuyRate,
      updated_at: new Date().toISOString(),
    }));
  if (payload.length === 0) return;
  const { error } = await supabase
    .from("currency_cost_basis")
    .upsert(payload, { onConflict: "currency_code" });
  if (error) throw error;
}

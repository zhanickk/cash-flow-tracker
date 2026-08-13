import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CarryIn } from "@/lib/simple-income";

/**
 * Перенос остатка между сменами (таблица session_carry_in).
 *
 * Хранит ровно одну строку на валюту — то, с чем ТЕКУЩАЯ смена стартовала.
 * Знак: >0 — излишек закупа (встаёт в покупки), <0 — перепродали (встаёт в
 * продажи). При «Новый день» строки перезаписываются остатком закрытой смены.
 */

export const CARRY_IN_KEY = ["session-carry-in"];

export function useSessionCarryIn() {
  return useQuery({
    queryKey: CARRY_IN_KEY,
    queryFn: async (): Promise<CarryIn[]> => {
      const { data, error } = await supabase.from("session_carry_in").select("*");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        currency: r.currency_code,
        amount: Number(r.amount),
        rate: Number(r.rate),
      }));
    },
  });
}

/** Перезаписать перенос целиком: старые строки убираем, новые кладём.
 * Вызывается при «Новый день» с остатком только что закрытой смены. */
export async function replaceSessionCarryIn(rows: CarryIn[]) {
  const { error: delErr } = await supabase
    .from("session_carry_in")
    .delete()
    .neq("currency_code", "");
  if (delErr) throw delErr;

  const payload = rows
    .filter((r) => r.amount !== 0 && r.rate > 0)
    .map((r) => ({
      currency_code: r.currency,
      amount: r.amount,
      rate: r.rate,
      updated_at: new Date().toISOString(),
    }));
  if (payload.length === 0) return;

  const { error } = await supabase.from("session_carry_in").insert(payload);
  if (error) throw error;
}

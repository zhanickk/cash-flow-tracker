import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type FxRateOverride = Tables<"fx_rate_overrides">;

const KEY = ["fx-rate-overrides"];

export function useFxRateOverrides() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<FxRateOverride[]> => {
      const { data, error } = await supabase.from("fx_rate_overrides").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Найти ручную корректировку курса для валюты и периода. */
export function findRateOverride(
  overrides: FxRateOverride[],
  currencyCode: string,
  dateFrom: string,
  dateTo: string,
): number | null {
  if (!dateFrom || !dateTo) return null;
  const row = overrides.find(
    (o) =>
      o.currency_code === currencyCode &&
      o.period_start <= dateTo &&
      o.period_end >= dateFrom,
  );
  return row ? Number(row.override_rate) : null;
}

export function useSaveFxRateOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      currencyCode: string;
      periodStart: string;
      periodEnd: string;
      overrideRate: number;
      note?: string;
    }) => {
      const payload = {
        currency_code: input.currencyCode,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        override_rate: input.overrideRate,
        note: input.note?.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("fx_rate_overrides").upsert(payload, {
        onConflict: "currency_code,period_start,period_end",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteFxRateOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fx_rate_overrides").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

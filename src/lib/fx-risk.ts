import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { frozenSalynghanKzt, replayUsdSales, type ContactTx } from "@/lib/fx-pots";
import { cashRowsToMappedSales } from "@/lib/fx-sale-map";

export const RISK_KEY = ["fx-risk-dashboard"];

export function useFxRiskDashboard() {
  return useQuery({
    queryKey: RISK_KEY,
    queryFn: async () => {
      const [{ data: contactTxs }, { data: cashRows }, { data: settings }] = await Promise.all([
        supabase.from("contact_transactions").select("*"),
        supabase.from("cash_transactions").select("*").eq("kind", "sell").order("ts"),
        supabase.from("app_settings").select("global_rate").eq("id", true).maybeSingle(),
      ]);
      const sales = cashRowsToMappedSales(cashRows ?? []);
      const replay = replayUsdSales((contactTxs ?? []) as ContactTx[], sales);
      const frozen = frozenSalynghanKzt(replay.enriched);

      const dailyRows = [...frozen.byDay.entries()]
        .map(([dateKey, kzt]) => ({ dateKey, kzt }))
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

      const salynghanSales = frozen.sales.map((s) => ({
        id: s.id,
        occurredAt: s.occurredAt,
        salynghanAmount: s.salynghanAmount,
        rate: s.rate,
        kzt: s.salynghanAmount * s.rate,
      }));

      const globalRate = Number(settings?.global_rate ?? 0);
      const frozenUsd = replay.salynghanRemainder;
      const hypotheticalKzt = globalRate > 0 ? frozenUsd * globalRate : null;
      const rateDeltaKzt =
        hypotheticalKzt != null ? hypotheticalKzt - frozen.totalKzt : null;

      return {
        frozenKztToday: frozen.totalKzt,
        salynghanRemainderUsd: replay.salynghanRemainder,
        karyzRemainderUsd: replay.karyzRemainder,
        globalRate,
        hypotheticalKzt,
        rateDeltaKzt,
        dailyRows,
        salynghanSales,
        pot: replay.pot,
      };
    },
  });
}

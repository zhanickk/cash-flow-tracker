import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt } from "@/lib/cash-shared";
import { balanceTone } from "@/lib/currency-balance";
import { useFxRiskDashboard } from "@/lib/fx-risk";
import { cn } from "@/lib/utils";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export const Route = createFileRoute("/fx-risk")({
  head: () => ({
    meta: [{ title: "Валютный риск — Кассовый лист" }],
  }),
  component: FxRiskPage,
});

function FxRiskPage() {
  const { data, isLoading } = useFxRiskDashboard();

  const chartData =
    data?.dailyRows.map((r) => ({
      day: r.dateKey.split("-").reverse().slice(0, 2).join("."),
      kzt: r.kzt,
    })) ?? [];

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-4xl px-3 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/currency-balance">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <TrendingUp className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-lg font-semibold">Дашборд валютного риска</h1>
              <p className="text-xs text-muted-foreground">
                Тенге, «замороженные» вместо долларов Салынған
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-3 py-4">
        {isLoading && <p className="text-center text-sm text-muted-foreground">Загрузка…</p>}

        {data && (
          <>
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-muted-foreground">
                  Заморожено в тенге (все продажи из Салынған USD)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tabular-nums text-success">
                  {fmt(data.frozenKztToday)} ₸
                </div>
                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    Остаток Салынған USD:{" "}
                    <span className={cn("font-semibold tabular-nums", balanceTone(data.salynghanRemainderUsd))}>
                      {fmt(data.salynghanRemainderUsd)} $
                    </span>
                  </div>
                  <div>
                    Остаток Қарыз USD:{" "}
                    <span className={cn("font-semibold tabular-nums", balanceTone(data.karyzRemainderUsd))}>
                      {fmt(data.karyzRemainderUsd)} $
                    </span>
                  </div>
                </div>
                {data.globalRate > 0 && (
                  <div className="mt-3 rounded-md bg-muted/60 p-3 text-sm">
                    <div className="text-muted-foreground">
                      Текущий курс (app_settings): {fmt(data.globalRate, 4)} ₸/$
                    </div>
                    {data.hypotheticalKzt != null && data.salynghanRemainderUsd !== 0 && (
                      <div className="mt-1">
                        Остаток Салынған по текущему курсу:{" "}
                        <span className="font-semibold tabular-nums">{fmt(data.hypotheticalKzt)} ₸</span>
                      </div>
                    )}
                    {data.rateDeltaKzt != null && (
                      <div
                        className={cn(
                          "mt-1 tabular-nums",
                          data.rateDeltaKzt >= 0 ? "text-success" : "text-danger",
                        )}
                      >
                        vs замороженные тенге: {data.rateDeltaKzt >= 0 ? "+" : ""}
                        {fmt(data.rateDeltaKzt)} ₸
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {chartData.length > 1 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Динамика по дням (₸ из Салынған)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{ kzt: { label: "₸", color: "hsl(var(--success))" } }}
                    className="h-48 w-full"
                  >
                    <BarChart data={chartData}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} width={48} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="kzt" fill="var(--color-kzt)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Операции с долей Салынған</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2">Дата</th>
                      <th className="px-3 py-2">USD (Салынған)</th>
                      <th className="px-3 py-2">Курс</th>
                      <th className="px-3 py-2">₸</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.salynghanSales.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                          Продаж из Салынған пока нет
                        </td>
                      </tr>
                    )}
                    {data.salynghanSales.map((s) => (
                      <tr key={s.id} className="border-b border-border/60">
                        <td className="px-3 py-2">
                          {new Date(s.occurredAt).toLocaleString("ru-RU")}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{fmt(s.salynghanAmount)}</td>
                        <td className="px-3 py-2 tabular-nums">{fmt(s.rate, 4)}</td>
                        <td className="px-3 py-2 tabular-nums text-success">{fmt(s.kzt)} ₸</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

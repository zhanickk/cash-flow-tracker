import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { auditActionLabel, useContactAuditLog } from "@/lib/contact-audit";
import { fmtContactBalancePlain } from "@/lib/contact-currencies";
import { fmtDateTime } from "@/lib/contacts";

export const Route = createFileRoute("/contacts-full")({
  head: () => ({
    meta: [{ title: "Контакты (полная база) — Кассовый лист" }],
  }),
  component: ContactsFullPage,
});

function ContactsFullPage() {
  const { data: entries = [], isLoading } = useContactAuditLog();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.contact_name.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        (e.currency ?? "").toLowerCase().includes(q),
    );
  }, [entries, query]);

  const contactCount = useMemo(() => new Set(entries.map((e) => e.contact_name)).size, [entries]);

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-4xl px-3 py-3">
          <div className="flex items-center gap-2">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <BookOpen className="h-5 w-5 text-primary" />
            <div>
              <div className="text-lg font-semibold">Контакты (полная база)</div>
              <div className="text-xs text-muted-foreground">
                Аудит операций · только просмотр · без расчёта балансов
              </div>
            </div>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Поиск по имени, сумме, описанию…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-3 py-4">
        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          <span>
            Записей: <strong className="text-foreground">{filtered.length}</strong>
          </span>
          <span>
            Контактов в журнале: <strong className="text-foreground">{contactCount}</strong>
          </span>
        </div>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">История действий</CardTitle>
            <p className="text-xs text-muted-foreground">
              Новые операции по клиентам записываются сюда автоматически. Удаление из этого
              раздела невозможно.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading && (
              <p className="p-6 text-center text-sm text-muted-foreground">Загрузка…</p>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
                <Users className="h-8 w-8 opacity-40" />
                <p>Журнал пуст. Записи появятся при новых операциях с клиентами.</p>
                <Link to="/contacts" className="text-primary underline">
                  Перейти к валютным счетам
                </Link>
              </div>
            )}
            {!isLoading && filtered.length > 0 && (
              <ul className="divide-y divide-border">
                {filtered.map((e) => (
                  <li key={e.id} className="px-3 py-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{e.contact_name}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {auditActionLabel(e.action)}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground">{e.summary}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        {e.amount != null && e.currency && (
                          <div
                            className={cn(
                              "font-semibold tabular-nums",
                              Number(e.amount) > 0
                                ? "text-success"
                                : Number(e.amount) < 0
                                  ? "text-danger"
                                  : "text-foreground",
                            )}
                          >
                            {fmtContactBalancePlain(
                              e.currency.includes("→") ? "KZT" : e.currency,
                              Number(e.amount),
                            )}
                          </div>
                        )}
                        <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                          {fmtDateTime(e.occurred_at)}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

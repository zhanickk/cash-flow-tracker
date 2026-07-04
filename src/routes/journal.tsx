import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Download, History, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useCashHistory } from "@/lib/cash-register";
import { type HistoryEntry, timeStr } from "@/lib/cash-shared";
import {
  buildJournalReportWorkbook,
  journalReportFileBaseName,
} from "@/lib/journal-report";
import { downloadExcelBuffer, saveExcelToDirectory } from "@/lib/daily-report";

export const Route = createFileRoute("/journal")({
  head: () => ({
    meta: [{ title: "Журнал изменений — Кассовый лист" }],
  }),
  component: JournalPage,
});

const ACTION_LABEL: Record<HistoryEntry["action"], string> = {
  add: "ДОБ",
  delete: "УДАЛ",
  edit: "ИЗМ",
  reset: "СБРОС",
};

function dateStr(ts: number) {
  return new Date(ts).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function JournalPage() {
  const { data: history = [], isLoading } = useCashHistory();
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<"all" | HistoryEntry["action"]>("all");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...history]
      .reverse()
      .filter((h) => actionFilter === "all" || h.action === actionFilter)
      .filter((h) => !q || h.summary.toLowerCase().includes(q));
  }, [history, query, actionFilter]);

  async function handleDownload() {
    setBusy(true);
    try {
      const buffer = await buildJournalReportWorkbook(history);
      const baseName = journalReportFileBaseName();
      await saveExcelToDirectory(buffer, baseName);
      downloadExcelBuffer(buffer, baseName);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-4xl px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" asChild>
                <Link to="/">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <History className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">Журнал изменений</h1>
              <span className="text-sm text-muted-foreground">({history.length})</span>
            </div>
            <Button size="sm" className="gap-2" onClick={handleDownload} disabled={busy || history.length === 0}>
              {busy ? <FolderOpen className="h-4 w-4 animate-pulse" /> : <Download className="h-4 w-4" />}
              Скачать отчёт
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-3 px-3 py-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Поиск по описанию…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="sm:flex-1"
          />
          <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as typeof actionFilter)}>
            <SelectTrigger className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все действия</SelectItem>
              <SelectItem value="add">Добавлено</SelectItem>
              <SelectItem value="edit">Изменено</SelectItem>
              <SelectItem value="delete">Удалено</SelectItem>
              <SelectItem value="reset">Сброс / новый день</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm text-muted-foreground">
              Показано {filtered.length} из {history.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Загрузка…</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Ничего не найдено</div>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((h) => (
                  <li key={h.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                      {dateStr(h.ts)} {timeStr(h.ts)}
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
                      {ACTION_LABEL[h.action]}
                    </span>
                    <span className="text-foreground">{h.summary}</span>
                    {h.cashierName && (
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {h.cashierName}
                      </span>
                    )}
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

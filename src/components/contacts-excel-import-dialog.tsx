import { useState } from "react";
import { FileSpreadsheet, Upload, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  parseContactsExcel,
  nameKey,
  type ParsedBalanceRow,
} from "@/lib/contacts-excel-import";
import { useImportContactBalancesFromExcel, type ContactWithBalance } from "@/lib/contacts";

interface PreviewRow extends ParsedBalanceRow {
  matchedContactId: string | null;
  matchedContactName: string | null;
}

function fmtAmountShort(n: number, currency: "KZT" | "USD") {
  const abs = Math.abs(n).toLocaleString("ru-RU");
  const sign = n >= 0 ? "+" : "-";
  return currency === "KZT" ? `${sign}${abs} ₸` : `${sign}$${abs}`;
}

export function ContactsExcelImportDialog({
  open,
  onOpenChange,
  contacts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: ContactWithBalance[];
}) {
  const [sheetName, setSheetName] = useState<string>("");
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const importMutation = useImportContactBalancesFromExcel();

  function reset() {
    setRows(null);
    setSheetName("");
    setParseError(null);
    setResultMsg(null);
  }

  async function handleFile(file: File) {
    setParsing(true);
    setParseError(null);
    setResultMsg(null);
    try {
      const buffer = await file.arrayBuffer();
      const result = await parseContactsExcel(buffer);
      const byKey = new Map(contacts.map((c) => [nameKey(c.name), c]));
      const preview: PreviewRow[] = result.rows.map((r) => {
        const match = byKey.get(nameKey(r.rawName));
        return {
          ...r,
          matchedContactId: match?.id ?? null,
          matchedContactName: match?.name ?? null,
        };
      });
      setSheetName(result.sheetName);
      setRows(preview);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Не удалось прочитать файл");
    } finally {
      setParsing(false);
    }
  }

  const matchedRows = (rows ?? []).filter((r) => r.matchedContactId);
  const skippedRows = (rows ?? []).filter((r) => !r.matchedContactId);

  function handleConfirmImport() {
    importMutation.mutate(
      {
        sheetLabel: sheetName,
        rows: matchedRows.map((r) => ({
          contactId: r.matchedContactId as string,
          currency: r.currency,
          amount: r.amount,
          rawName: r.rawName,
        })),
      },
      {
        onSuccess: (data) => {
          setConfirmOpen(false);
          setResultMsg(
            `Импортировано операций: ${data.inserted}. Пропущено (не найдено в контактах): ${skippedRows.length}.`,
          );
          setRows(null);
        },
      },
    );
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          onOpenChange(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Импорт баланса из Excel
            </DialogTitle>
            <DialogDescription>
              Загрузите файл — возьмём последний лист и блок «Остаток» (тенге плюс/минус, доллар
              САЛЫНГАН/КАРЫЗ). Обновятся только контакты, уже существующие в базе — для каждого
              добавится отдельная операция (не перезаписывая историю).
            </DialogDescription>
          </DialogHeader>

          {!rows && !resultMsg && (
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary",
                parsing && "pointer-events-none opacity-60",
              )}
            >
              <Upload className="h-8 w-8" />
              {parsing ? "Читаем файл…" : "Нажмите, чтобы выбрать .xlsx файл"}
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          )}

          {parseError && (
            <div className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {parseError}
            </div>
          )}

          {resultMsg && (
            <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success-soft p-3 text-sm text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {resultMsg}
            </div>
          )}

          {rows && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Лист: <span className="font-medium text-foreground">{sheetName}</span>
                </span>
                <span>
                  Найдено строк: {rows.length} · Совпадений:{" "}
                  <span className="font-medium text-success">{matchedRows.length}</span> · Не
                  найдено: <span className="font-medium text-danger">{skippedRows.length}</span>
                </span>
              </div>
              <ScrollArea className="h-72 rounded-md border border-border">
                <ul className="divide-y divide-border">
                  {rows.map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        {r.matchedContactId ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 shrink-0 text-danger" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-medium">{r.rawName}</div>
                          <div className="truncate text-muted-foreground">
                            {r.matchedContactId
                              ? `→ ${r.matchedContactName}`
                              : "не найден в контактах, пропущено"}
                          </div>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 font-medium tabular-nums",
                          r.amount >= 0 ? "text-success" : "text-danger",
                        )}
                      >
                        {fmtAmountShort(r.amount, r.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}

          <DialogFooter>
            {rows && (
              <Button variant="outline" onClick={reset}>
                Загрузить другой файл
              </Button>
            )}
            {rows && (
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={matchedRows.length === 0 || importMutation.isPending}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Импортировать ({matchedRows.length})
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Подтвердить импорт?</AlertDialogTitle>
            <AlertDialogDescription>
              Будет добавлено {matchedRows.length} операций (по одной на каждый совпавший контакт)
              с пометкой «Импорт из Excel». Баланс изменится на сумму из файла. Действие не
              перезаписывает историю — можно будет удалить каждую операцию по отдельности.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmImport} className={buttonVariants({})}>
              Импортировать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

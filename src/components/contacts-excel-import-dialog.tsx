import { useState } from "react";
import { FileSpreadsheet, Upload, CheckCircle2, AlertTriangle, UserPlus, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  mergeKztTargets,
  mergeUsdTargets,
  nameKey,
  parseContactsExcel,
  type ParsedBalanceRow,
} from "@/lib/contacts-excel-import";
import { useImportContactBalancesFromExcel, type ContactWithBalance } from "@/lib/contacts";
import { fmtContactBalancePlain } from "@/lib/contact-currencies";

interface PreviewRow extends ParsedBalanceRow {
  matchedContactId: string | null;
  matchedContactName: string | null;
  isNew: boolean;
}

function groupLabel(row: ParsedBalanceRow): string {
  if (row.group === "тенге плюс") return "Тенге плюс";
  if (row.group === "тенге минус") return "Тенге минус";
  return row.amount > 0 ? "Салынған" : "Қарыз";
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
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

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
      const merged = [...mergeUsdTargets(result.rows), ...mergeKztTargets(result.rows)];
      if (merged.length === 0) {
        throw new Error("На последнем листе не найдены колонки плюс/минус/САЛЫНГАН/КАРЫЗ");
      }
      const byKey = new Map(contacts.map((c) => [nameKey(c.name), c]));
      const preview: PreviewRow[] = merged.map((r) => {
        const match = byKey.get(nameKey(r.normalizedName));
        return {
          ...r,
          matchedContactId: match?.id ?? null,
          matchedContactName: match?.name ?? null,
          isNew: !match,
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

  const namesOnSheet = new Set((rows ?? []).map((r) => nameKey(r.normalizedName)));
  const removedContacts = contacts.filter((c) => !namesOnSheet.has(nameKey(c.name)));
  const newRows = (rows ?? []).filter((r) => r.isNew);
  const usdRows = (rows ?? []).filter((r) => r.currency === "USD");
  const kztRows = (rows ?? []).filter((r) => r.currency === "KZT");

  function handleConfirmImport() {
    if (!rows) return;
    importMutation.mutate(
      {
        sheetLabel: sheetName,
        deleteMissing: true,
        targets: rows.map((r) => ({
          rawName: r.rawName,
          normalizedName: r.normalizedName,
          currency: r.currency,
          targetBalance: r.amount,
        })),
      },
      {
        onSuccess: (data) => {
          setConfirmOpen(false);
          setResultMsg(
            `Готово: ${data.reconciled} корректировок, создано ${data.created}, удалено ${data.removed} контактов.`,
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
        <DialogContent className="flex max-h-[min(90vh,720px)] max-w-2xl flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Импорт из Excel
            </DialogTitle>
            <DialogDescription>
              Последний лист: тенге плюс/минус и USD САЛЫНГАН/КАРЫЗ. Балансы приводятся к Excel.
              Контакты, которых нет в файле, будут удалены.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
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
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Лист: <span className="font-medium text-foreground">{sheetName}</span>
                  </span>
                  <span>
                    USD: {usdRows.length} · KZT: {kztRows.length} · Всего: {rows.length}
                  </span>
                  <span>
                    Новые: <span className="font-medium text-primary">{newRows.length}</span> ·
                    Удалить:{" "}
                    <span className="font-medium text-danger">{removedContacts.length}</span>
                  </span>
                </div>
                <div className="max-h-52 overflow-y-auto rounded-md border border-border">
                  <ul className="divide-y divide-border">
                    {rows.map((r, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                        <div className="flex min-w-0 items-center gap-2">
                          {r.isNew ? (
                            <UserPlus className="h-3.5 w-3.5 shrink-0 text-primary" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-medium">{r.normalizedName}</div>
                            <div className="truncate text-muted-foreground">
                              {r.isNew ? "создать" : r.matchedContactName} · {groupLabel(r)}:{" "}
                              {fmtContactBalancePlain(r.currency, r.amount)}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                {removedContacts.length > 0 && (
                  <div className="rounded-md border border-danger/30 bg-danger-soft/30 p-2 text-xs">
                    <div className="mb-1 flex items-center gap-1 font-medium text-danger">
                      <Trash2 className="h-3.5 w-3.5" />
                      Будут удалены ({removedContacts.length}):
                    </div>
                    <div className="max-h-28 overflow-y-auto">
                      <div className="flex flex-wrap gap-1">
                        {removedContacts.map((c) => (
                          <span key={c.id} className="rounded bg-card px-1.5 py-0.5">
                            {c.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t border-border pt-4">
            {rows && (
              <Button variant="outline" onClick={reset}>
                Загрузить другой файл
              </Button>
            )}
            {rows && (
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={rows.length === 0 || importMutation.isPending}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Сверить счета
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
              Балансы {rows?.length ?? 0} записей (USD + KZT) будут приведены к Excel. Будет
              создано {newRows.length} новых контактов. {removedContacts.length} контактов будут
              удалены.
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

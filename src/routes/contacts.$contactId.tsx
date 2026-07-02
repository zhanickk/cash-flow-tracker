import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ArrowLeft, Plus, RotateCcw } from "lucide-react";
import {
  effectiveRate,
  fmtAmount,
  fmtDateTime,
  fmtUsd,
  useAddContactTransaction,
  useContactDetail,
  useDeleteContactTransaction,
  useGlobalRate,
  useUpdateContactRate,
} from "@/lib/contacts";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

export const Route = createFileRoute("/contacts/$contactId")({
  head: () => ({
    meta: [{ title: "Контакт — Кассовый лист" }],
  }),
  component: ContactDetailPage,
});

function balanceTone(v: number) {
  if (v > 0) return "text-success";
  if (v < 0) return "text-danger";
  return "text-muted-foreground";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function ContactDetailPage() {
  const { contactId } = Route.useParams();
  const { data, isLoading } = useContactDetail(contactId);
  const { data: globalRate = 0 } = useGlobalRate();
  const updateRate = useUpdateContactRate();
  const addTx = useAddContactTransaction();
  const deleteTx = useDeleteContactTransaction();

  const [rateDraft, setRateDraft] = useState<string | null>(null);
  const [currency, setCurrency] = useState<"KZT" | "USD">("KZT");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background p-4">
        <p className="text-center text-sm text-muted-foreground">Загрузка…</p>
      </div>
    );
  }

  const { contact, transactions, kztBalance, usdBalance } = data;
  const rate = effectiveRate(contact, globalRate);
  const combinedKzt = kztBalance + usdBalance * rate;

  const submit = () => {
    const n = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
    if (!n || isNaN(n)) return;
    addTx.mutate({ contactId: contact.id, currency, amount: n, note: note.trim() || undefined });
    setAmount("");
    setNote("");
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-3 py-3">
          <Link to="/contacts" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {initials(contact.name)}
          </div>
          <div className="text-lg font-semibold">{contact.name}</div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-3 py-4">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">Тенге</div>
            <div className={cn("text-xl font-semibold tabular-nums", balanceTone(kztBalance))}>
              {fmtAmount(kztBalance)} ₸
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">USD</div>
            <div className={cn("text-xl font-semibold tabular-nums", balanceTone(usdBalance))}>
              {fmtUsd(usdBalance)}
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Итого в тенге, по курсу клиента</span>
            <span className={cn("text-base font-semibold tabular-nums", balanceTone(combinedKzt))}>
              {fmtAmount(combinedKzt)} ₸
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>курс для {contact.name.split(" ")[0]}</span>
            <Input
              className="h-7 w-24 text-right tabular-nums"
              value={rateDraft ?? (contact.custom_rate ? String(contact.custom_rate) : "")}
              placeholder={String(globalRate || "")}
              onFocus={() =>
                setRateDraft(contact.custom_rate ? String(contact.custom_rate) : String(globalRate || ""))
              }
              onChange={(e) => setRateDraft(e.target.value.replace(/[^\d.,]/g, ""))}
              onBlur={() => {
                if (rateDraft === null) return;
                const n = parseFloat(rateDraft.replace(",", "."));
                updateRate.mutate({ contactId: contact.id, rate: !isNaN(n) && n > 0 ? n : null });
                setRateDraft(null);
              }}
            />
            <span>общий: {globalRate ? globalRate.toLocaleString("ru-RU") : "—"}</span>
            {contact.custom_rate != null && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => updateRate.mutate({ contactId: contact.id, rate: null })}
              >
                <RotateCcw className="h-3 w-3" />
                Сбросить к общему
              </Button>
            )}
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-border bg-card p-3">
          <div className="mb-2 text-sm font-medium">Новая операция</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1.2fr_auto]">
            <Select value={currency} onValueChange={(v) => setCurrency(v as "KZT" | "USD")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="KZT">Тенге</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Сумма (- если забрал)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <Input
              placeholder="Комментарий"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <Button onClick={submit} className="gap-1">
              <Plus className="h-4 w-4" />
              Добавить
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Положительная сумма = внёс (мы должны), отрицательная = забрал (должен нам)
          </p>
        </div>

        <div className="text-sm font-medium">Операции</div>
        <div className="mt-2 flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {transactions.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">Операций пока нет</p>
          )}
          {transactions.map((t) => (
            <div
              key={t.id}
              className="group flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{fmtDateTime(t.occurred_at)}</div>
                {t.note && <div className="truncate text-xs text-muted-foreground">{t.note}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div
                  className={cn(
                    "text-sm font-medium tabular-nums",
                    balanceTone(Number(t.amount)),
                  )}
                >
                  {t.currency === "KZT" ? fmtAmount(Number(t.amount)) + " ₸" : fmtUsd(Number(t.amount))}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-danger opacity-60 hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Удалить операцию?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {fmtDateTime(t.occurred_at)} ·{" "}
                        {t.currency === "KZT"
                          ? fmtAmount(Number(t.amount)) + " ₸"
                          : fmtUsd(Number(t.amount))}
                        {t.note ? ` · ${t.note}` : ""}. Действие необратимо.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteTx.mutate(t.id)}
                        className={buttonVariants({ variant: "destructive" })}
                      >
                        Удалить
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeftRight, ArrowRight } from "lucide-react";
import { useAddContactConversion, type ContactWithBalance } from "@/lib/contacts";

function fmtSide(currency: "KZT" | "USD", n: number) {
  if (!isFinite(n)) return "—";
  return currency === "KZT"
    ? `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₸`
    : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

interface ConversionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts?: ContactWithBalance[];
  fixedContact?: { id: string; name: string };
}

export function ContactConversionDialog({
  open,
  onOpenChange,
  contacts,
  fixedContact,
}: ConversionDialogProps) {
  const addConversion = useAddContactConversion();
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [fromCurrency, setFromCurrency] = useState<"KZT" | "USD">("KZT");
  const [rate, setRate] = useState("");
  const [amount, setAmount] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const toCurrency: "KZT" | "USD" = fromCurrency === "KZT" ? "USD" : "KZT";
  const contact = fixedContact ?? selected;

  const suggestions = useMemo(() => {
    if (!contacts || fixedContact) return [];
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return contacts.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6);
  }, [contacts, query, fixedContact]);

  const amountNum = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
  const rateNum = parseFloat(rate.replace(/\s/g, "").replace(",", "."));
  const valid = !!contact && amountNum > 0 && rateNum > 0;
  const toAmount = valid ? (fromCurrency === "USD" ? amountNum * rateNum : amountNum / rateNum) : 0;

  function reset() {
    setQuery("");
    setShowDropdown(false);
    setRate("");
    setAmount("");
    if (!fixedContact) setSelected(null);
  }

  function close() {
    onOpenChange(false);
    reset();
  }

  function submit() {
    if (!valid || !contact) return;
    setConfirmOpen(true);
  }

  function confirm() {
    if (!valid || !contact) return;
    addConversion.mutate({
      contactId: contact.id,
      fromCurrency,
      toCurrency,
      fromAmount: amountNum,
      toAmount,
      rate: rateNum,
    });
    setConfirmOpen(false);
    close();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Конвертация{contact ? ` — ${contact.name}` : ""}</DialogTitle>
          </DialogHeader>

          {!fixedContact && !selected && (
            <div className="relative">
              <Input
                placeholder="Имя контакта"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
              />
              {showDropdown && suggestions.length > 0 && (
                <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                  {suggestions.map((c) => (
                    <div
                      key={c.id}
                      className="cursor-pointer px-3 py-1.5 text-sm hover:bg-muted"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSelected({ id: c.id, name: c.name });
                        setShowDropdown(false);
                      }}
                    >
                      {c.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {contact && (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                  <div className="text-[11px] text-muted-foreground">Из</div>
                  <div className="font-medium">{fromCurrency === "KZT" ? "Тенге" : "USD"}</div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setFromCurrency(toCurrency)}
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </Button>
                <div className="flex-1 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                  <div className="text-[11px] text-muted-foreground">В</div>
                  <div className="font-medium">{toCurrency === "KZT" ? "Тенге" : "USD"}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mb-1 text-[11px] text-muted-foreground">
                    Сумма ({fromCurrency === "KZT" ? "₸" : "$"})
                  </div>
                  <Input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                    placeholder="0"
                  />
                </div>
                <div>
                  <div className="mb-1 text-[11px] text-muted-foreground">Курс (₸ за $1)</div>
                  <Input
                    value={rate}
                    onChange={(e) => setRate(e.target.value.replace(/[^\d.,]/g, ""))}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 rounded-lg bg-accent/60 px-3 py-2.5 text-sm">
                <span className="font-medium tabular-nums">
                  {amountNum > 0 ? fmtSide(fromCurrency, amountNum) : "—"}
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium tabular-nums">
                  {valid ? fmtSide(toCurrency, toAmount) : "—"}
                </span>
              </div>
            </>
          )}

          <DialogFooter>
            <Button disabled={!valid} onClick={submit} className="w-full gap-1">
              Конвертировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Подтвердить конвертацию?</AlertDialogTitle>
            <AlertDialogDescription>
              {contact?.name}: {valid ? fmtSide(fromCurrency, amountNum) : "—"} →{" "}
              {valid ? fmtSide(toCurrency, toAmount) : "—"}
              {valid ? ` по курсу ${rateNum.toLocaleString("ru-RU")}` : ""}. Счёт «
              {fromCurrency === "KZT" ? "Тенге" : "USD"}» уменьшится, счёт «
              {toCurrency === "KZT" ? "Тенге" : "USD"}» увеличится.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} className={buttonVariants({ variant: "default" })}>
              Конвертировать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

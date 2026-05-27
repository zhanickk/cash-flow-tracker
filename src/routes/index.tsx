import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Calculator,
  RefreshCw,
  Wallet,
  ShoppingCart,
  Banknote,
  HandCoins,
  PiggyBank,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Кассовый лист — Обмен валют" },
      { name: "description", content: "Учёт кассы обменного пункта: остаток, покупка, продажа, приход, расход по 6 валютам." },
    ],
  }),
  component: Index,
});

type Currency = "KZT" | "USD" | "EUR" | "RUB" | "CNY" | "GOLD";

const CURRENCIES: { code: Currency; label: string; symbol: string }[] = [
  { code: "KZT", label: "Тенге (KZT)", symbol: "₸" },
  { code: "USD", label: "Доллар (USD)", symbol: "$" },
  { code: "EUR", label: "Евро (EUR)", symbol: "€" },
  { code: "RUB", label: "Рубль (RUB)", symbol: "₽" },
  { code: "CNY", label: "Юань (CNY)", symbol: "¥" },
  { code: "GOLD", label: "Золото (гр)", symbol: "Au" },
];

type TxKind = "opening" | "buy" | "sell" | "income" | "expense";

interface Transaction {
  id: string;
  kind: TxKind;
  ts: number;
  name?: string;
  currency: Currency;
  amount: number;
  rate?: number;
  // deltas applied to memory totals
  deltas: Partial<Record<Currency, number>>;
}

const STORAGE_KEY = "cash-register-v1";

function fmt(n: number, frac = 2) {
  if (!isFinite(n)) return "0";
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: frac,
  });
}

function parseAmount(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/\s/g, "").replace(/,/g, ".");
  // if multiple dots, keep only last as decimal
  const parts = cleaned.split(".");
  let normalized = cleaned;
  if (parts.length > 2) {
    normalized = parts.slice(0, -1).join("") + "." + parts.at(-1);
  }
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

function formatInputValue(s: string): string {
  if (!s) return "";
  // allow only digits, comma, dot, space
  const cleaned = s.replace(/[^\d.,\s]/g, "");
  // separate integer / decimal at last comma or dot
  const match = cleaned.replace(/\s/g, "").match(/^(\d*)([.,]?)(\d*)$/);
  if (!match) return cleaned;
  const [, intPart, sep, decPart] = match;
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return withSep + (sep || "") + (decPart || "");
}

function todayStr() {
  return new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function Index() {
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Transaction[]) : [];
    } catch {
      return [];
    }
  });
  const [showSummary, setShowSummary] = useState(false);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    } catch {}
  }, [transactions]);

  const totals = useMemo(() => {
    const t: Record<Currency, number> = {
      KZT: 0, USD: 0, EUR: 0, RUB: 0, CNY: 0, GOLD: 0,
    };
    for (const tx of transactions) {
      for (const [k, v] of Object.entries(tx.deltas)) {
        t[k as Currency] += v || 0;
      }
    }
    return t;
  }, [transactions]);

  function addTx(tx: Omit<Transaction, "id" | "ts">) {
    setTransactions((prev) => [
      ...prev,
      { ...tx, id: crypto.randomUUID(), ts: Date.now() },
    ]);
  }

  function clearAll() {
    if (confirm("Очистить кассу и начать новый день?")) {
      setTransactions([]);
      setShowSummary(false);
    }
  }

  function revealSummary() {
    setShowSummary(true);
    setTimeout(() => {
      summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4 py-3 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Wallet className="h-5 w-5" />
            <span className="font-semibold tracking-tight">Кассовый лист</span>
          </div>
          <div className="text-center text-sm font-medium capitalize text-foreground sm:text-base">
            {todayStr()}
          </div>
          <Button variant="outline" size="sm" onClick={clearAll} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Новый день
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-2">
        {/* TOP-LEFT: Opening + Buy */}
        <div className="grid gap-4">
          <OpeningCard onAdd={addTx} txs={transactions.filter((t) => t.kind === "opening")} />
          <BuyCard onAdd={addTx} txs={transactions.filter((t) => t.kind === "buy")} />
        </div>

        {/* TOP-RIGHT: Sell */}
        <SellCard onAdd={addTx} txs={transactions.filter((t) => t.kind === "sell")} />

        {/* BOTTOM-LEFT: Income */}
        <IncomeCard onAdd={addTx} txs={transactions.filter((t) => t.kind === "income")} />

        {/* BOTTOM-RIGHT: Expense */}
        <ExpenseCard onAdd={addTx} txs={transactions.filter((t) => t.kind === "expense")} />

        {/* Summary */}
        {showSummary && (
          <div ref={summaryRef} className="lg:col-span-2">
            <Card className="border-primary/30 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PiggyBank className="h-5 w-5 text-primary" />
                  Итоговый остаток по валютам
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {CURRENCIES.map((c) => {
                    const v = totals[c.code];
                    return (
                      <div
                        key={c.code}
                        className={cn(
                          "rounded-xl border p-4 transition",
                          v > 0 && "border-success/40 bg-success-soft",
                          v < 0 && "border-danger/40 bg-danger-soft",
                          v === 0 && "border-border bg-muted",
                        )}
                      >
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {c.code}
                        </div>
                        <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                          {fmt(v)}
                        </div>
                        <div className="text-xs text-muted-foreground">{c.symbol}</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Fixed bottom MR bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 p-3">
          <div className="hidden flex-1 gap-2 overflow-x-auto sm:flex">
            {CURRENCIES.map((c) => (
              <div key={c.code} className="rounded-md border border-border bg-muted px-3 py-1.5 text-xs">
                <span className="font-semibold text-foreground">{c.code}</span>{" "}
                <span className="tabular-nums text-muted-foreground">{fmt(totals[c.code])}</span>
              </div>
            ))}
          </div>
          <Button
            size="lg"
            onClick={revealSummary}
            className="gap-2 bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90"
          >
            <Calculator className="h-5 w-5" />
            MR — Итог
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Sub-components ---------------- */

interface AddProps {
  onAdd: (tx: Omit<Transaction, "id" | "ts">) => void;
  txs: Transaction[];
}

function CurrencySelect({
  value,
  onChange,
  exclude,
}: {
  value: Currency;
  onChange: (c: Currency) => void;
  exclude?: Currency[];
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Currency)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CURRENCIES.filter((c) => !exclude?.includes(c.code)).map((c) => (
          <SelectItem key={c.code} value={c.code}>
            {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AmountInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      inputMode="decimal"
      value={value}
      placeholder={placeholder ?? "0"}
      onChange={(e) => onChange(formatInputValue(e.target.value))}
      className="tabular-nums"
    />
  );
}

function HistoryList({ txs }: { txs: Transaction[] }) {
  if (txs.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        Записей пока нет
      </div>
    );
  }
  return (
    <ScrollArea className="h-44 rounded-md border border-border bg-muted/40">
      <ul className="divide-y divide-border">
        {[...txs].reverse().map((t) => {
          const isPlus = ["opening", "income", "sell"].includes(t.kind);
          // sell adds KZT and subtracts currency; buy reverse — show actual deltas
          return (
            <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 border-0 px-1.5 py-0",
                    isPlus
                      ? "bg-success-soft text-success"
                      : "bg-danger-soft text-danger",
                  )}
                >
                  {isPlus ? "+" : "−"}
                </Badge>
                <span className="truncate text-foreground">
                  {t.name ? `${t.name} · ` : ""}
                  <span className="font-medium">{fmt(t.amount)} {t.currency}</span>
                  {t.rate ? ` × ${t.rate}` : ""}
                </span>
              </div>
              <div className="shrink-0 text-muted-foreground tabular-nums">
                {new Date(t.ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}

function SectionCard({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "success" | "danger" | "primary";
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        className={cn(
          "border-b border-border py-3",
          tone === "success" && "bg-success-soft",
          tone === "danger" && "bg-danger-soft",
          tone === "primary" && "bg-accent",
        )}
      >
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon
            className={cn(
              "h-5 w-5",
              tone === "success" && "text-success",
              tone === "danger" && "text-danger",
              tone === "primary" && "text-primary",
            )}
          />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4">{children}</CardContent>
    </Card>
  );
}

/* Section 1 — Opening cash */
function OpeningCard({ onAdd, txs }: AddProps) {
  const [currency, setCurrency] = useState<Currency>("KZT");
  const [amount, setAmount] = useState("");

  const submit = () => {
    const a = parseAmount(amount);
    if (a <= 0) return;
    onAdd({
      kind: "opening",
      currency,
      amount: a,
      deltas: { [currency]: a },
    });
    setAmount("");
  };

  return (
    <SectionCard title="Остаток на начало дня" icon={Wallet} tone="primary">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <CurrencySelect value={currency} onChange={setCurrency} />
        <AmountInput value={amount} onChange={setAmount} placeholder="Сумма" />
        <Button
          onClick={submit}
          className="gap-1 bg-success text-success-foreground hover:bg-success/90"
        >
          <ArrowUpCircle className="h-4 w-4" /> M+
        </Button>
      </div>
      <HistoryList txs={txs} />
    </SectionCard>
  );
}

/* Section 2 — Buy currency for KZT */
function BuyCard({ onAdd, txs }: AddProps) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [name, setName] = useState("");

  const a = parseAmount(amount);
  const r = parseAmount(rate);
  const kzt = a * r;

  const submit = () => {
    if (a <= 0 || r <= 0 || currency === "KZT") return;
    onAdd({
      kind: "buy",
      currency,
      amount: a,
      rate: r,
      name: name.trim() || undefined,
      deltas: { KZT: -kzt, [currency]: a },
    });
    setAmount(""); setRate(""); setName("");
  };

  return (
    <SectionCard title="Покупка валюты за тенге" icon={ShoppingCart} tone="danger">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input
          placeholder="Кто продал (имя)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <CurrencySelect value={currency} onChange={setCurrency} exclude={["KZT"]} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <AmountInput value={amount} onChange={setAmount} placeholder="Сумма валюты" />
        <AmountInput value={rate} onChange={setRate} placeholder="Курс" />
        <Button
          onClick={submit}
          variant="destructive"
          className="gap-1"
        >
          <ArrowDownCircle className="h-4 w-4" /> M−
        </Button>
      </div>
      {kzt > 0 && (
        <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Спишется с KZT: <span className="font-semibold text-foreground tabular-nums">{fmt(kzt)} ₸</span>
        </div>
      )}
      <HistoryList txs={txs} />
    </SectionCard>
  );
}

/* Sell — we receive KZT */
function SellCard({ onAdd, txs }: AddProps) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [name, setName] = useState("");

  const a = parseAmount(amount);
  const r = parseAmount(rate);
  const kzt = a * r;

  const submit = () => {
    if (a <= 0 || r <= 0 || currency === "KZT") return;
    onAdd({
      kind: "sell",
      currency,
      amount: a,
      rate: r,
      name: name.trim() || undefined,
      deltas: { KZT: kzt, [currency]: -a },
    });
    setAmount(""); setRate(""); setName("");
  };

  return (
    <SectionCard title="Продажа валюты (получаем тенге)" icon={Banknote} tone="success">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input
          placeholder="Кто купил (имя)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <CurrencySelect value={currency} onChange={setCurrency} exclude={["KZT"]} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <AmountInput value={amount} onChange={setAmount} placeholder="Сумма валюты" />
        <AmountInput value={rate} onChange={setRate} placeholder="Курс" />
        <Button
          onClick={submit}
          className="gap-1 bg-success text-success-foreground hover:bg-success/90"
        >
          <ArrowUpCircle className="h-4 w-4" /> M+
        </Button>
      </div>
      {kzt > 0 && (
        <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Поступит KZT: <span className="font-semibold text-foreground tabular-nums">{fmt(kzt)} ₸</span>
        </div>
      )}
      <HistoryList txs={txs} />
    </SectionCard>
  );
}

/* Income — people bring money */
function IncomeCard({ onAdd, txs }: AddProps) {
  const [currency, setCurrency] = useState<Currency>("KZT");
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");

  const submit = () => {
    const a = parseAmount(amount);
    if (a <= 0) return;
    onAdd({
      kind: "income",
      currency,
      amount: a,
      name: name.trim() || undefined,
      deltas: { [currency]: a },
    });
    setAmount(""); setName("");
  };

  return (
    <SectionCard title="Приход (принесли деньги)" icon={HandCoins} tone="success">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Input
          placeholder="От кого"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="sm:col-span-1"
        />
        <CurrencySelect value={currency} onChange={setCurrency} />
        <AmountInput value={amount} onChange={setAmount} placeholder="Сумма" />
        <Button
          onClick={submit}
          className="gap-1 bg-success text-success-foreground hover:bg-success/90"
        >
          <ArrowUpCircle className="h-4 w-4" /> M+
        </Button>
      </div>
      <HistoryList txs={txs} />
    </SectionCard>
  );
}

/* Expense — payouts */
function ExpenseCard({ onAdd, txs }: AddProps) {
  const [currency, setCurrency] = useState<Currency>("KZT");
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");

  const submit = () => {
    const a = parseAmount(amount);
    if (a <= 0) return;
    onAdd({
      kind: "expense",
      currency,
      amount: a,
      name: name.trim() || undefined,
      deltas: { [currency]: -a },
    });
    setAmount(""); setName("");
  };

  return (
    <SectionCard title="Расход / Выдача" icon={ArrowDownCircle} tone="danger">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Input
          placeholder="Кому"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <CurrencySelect value={currency} onChange={setCurrency} />
        <AmountInput value={amount} onChange={setAmount} placeholder="Сумма" />
        <Button onClick={submit} variant="destructive" className="gap-1">
          <ArrowDownCircle className="h-4 w-4" /> M−
        </Button>
      </div>
      <HistoryList txs={txs} />
    </SectionCard>
  );
}

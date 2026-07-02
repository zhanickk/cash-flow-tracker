import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardTrigger } from "@/components/ui/hover-card";
import { ContactBalanceHoverCard } from "@/components/contact-hover-card";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Link2,
  Link2Off,
  Plus,
  Users,
  X,
} from "lucide-react";
import {
  effectiveRate,
  useContactsWithBalances,
  useGlobalRate,
  type ContactWithBalance,
} from "@/lib/contacts";
import {
  findOrCreateContactByName,
  todayIso,
  useAddJournalEntry,
  useContactNames,
  useDeleteJournalEntry,
  useJournalEntries,
  type JournalEntry,
} from "@/lib/journal";

export const Route = createFileRoute("/journal")({
  head: () => ({
    meta: [{ title: "Касса — журнал" }],
  }),
  component: JournalPage,
});

function fmtPlain(n: number) {
  return Math.abs(n).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function shiftIso(iso: string, delta: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function JournalPage() {
  const [date, setDate] = useState(todayIso());
  const { data: entries = [], isLoading } = useJournalEntries(date);
  const { data: contactsWithBalances = [] } = useContactsWithBalances();
  const { data: globalRate = 0 } = useGlobalRate();
  const [rateDraft, setRateDraft] = useState("");

  const balanceMap = useMemo(() => {
    const m = new Map<string, ContactWithBalance>();
    for (const c of contactsWithBalances) m.set(c.id, c);
    return m;
  }, [contactsWithBalances]);

  const kztIn = entries.filter((e) => e.currency === "KZT" && Number(e.amount) > 0);
  const kztOut = entries.filter((e) => e.currency === "KZT" && Number(e.amount) < 0);
  const usdIn = entries.filter((e) => e.currency === "USD" && Number(e.amount) > 0);
  const usdOut = entries.filter((e) => e.currency === "USD" && Number(e.amount) < 0);

  const sum = (list: JournalEntry[]) => list.reduce((a, e) => a + Number(e.amount), 0);
  const displayRate = parseFloat(rateDraft.replace(",", "."));
  const netKzt = sum(kztIn) + sum(kztOut);
  const netUsd = sum(usdIn) + sum(usdOut);
  const hasRate = !isNaN(displayRate) && displayRate > 0;
  const combined = hasRate ? netKzt + netUsd * displayRate : null;

  const isToday = date === todayIso();

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-3 py-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="text-lg font-semibold">Касса — журнал</div>
          <Link
            to="/contacts"
            className="ml-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Users className="h-3.5 w-3.5" />
            Контакты
          </Link>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Курс, ₸/$</span>
            <Input
              className="h-8 w-20 text-right tabular-nums"
              placeholder="пусто"
              value={rateDraft}
              onChange={(e) => setRateDraft(e.target.value.replace(/[^\d.,]/g, ""))}
            />
          </div>
        </div>
        <div className="mx-auto flex max-w-4xl items-center justify-center gap-2 px-3 pb-3">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDate((d) => shiftIso(d, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[110px] text-center text-sm font-medium tabular-nums">{fmtDate(date)}</div>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDate((d) => shiftIso(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isToday && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setDate(todayIso())}>
              Сегодня
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-3 py-3">
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Загрузка…</p>}
        {!isLoading && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div className="text-xs font-medium text-muted-foreground">Тенге</div>
              <JournalBlock
                title="Пришло"
                tone="success"
                currency="KZT"
                sign={1}
                entries={kztIn}
                date={date}
                balanceMap={balanceMap}
                globalRate={globalRate}
              />
              <JournalBlock
                title="Ушло"
                tone="danger"
                currency="KZT"
                sign={-1}
                entries={kztOut}
                date={date}
                balanceMap={balanceMap}
                globalRate={globalRate}
              />
            </div>
            <div className="flex flex-col gap-3">
              <div className="text-xs font-medium text-muted-foreground">Доллар</div>
              <JournalBlock
                title="Салынган"
                tone="success"
                currency="USD"
                sign={1}
                entries={usdIn}
                date={date}
                balanceMap={balanceMap}
                globalRate={globalRate}
              />
              <JournalBlock
                title="Карыз"
                tone="danger"
                currency="USD"
                sign={-1}
                entries={usdOut}
                date={date}
                balanceMap={balanceMap}
                globalRate={globalRate}
              />
            </div>
          </div>
        )}

        {hasRate && (
          <div className="mt-4 rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground">Итого за день по курсу {displayRate.toLocaleString("ru-RU")}:</span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  combined! > 0 ? "text-success" : combined! < 0 ? "text-danger" : "text-muted-foreground",
                )}
              >
                {combined!.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₸
              </span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function JournalBlock({
  title,
  tone,
  currency,
  sign,
  entries,
  date,
  balanceMap,
  globalRate,
}: {
  title: string;
  tone: "success" | "danger";
  currency: "KZT" | "USD";
  sign: 1 | -1;
  entries: JournalEntry[];
  date: string;
  balanceMap: Map<string, ContactWithBalance>;
  globalRate: number;
}) {
  const total = entries.reduce((a, e) => a + Number(e.amount), 0);
  const addEntry = useAddJournalEntry();
  const deleteEntry = useDeleteJournalEntry();

  const headerBg = tone === "success" ? "bg-success/10" : "bg-danger/10";
  const headerText = tone === "success" ? "text-success" : "text-danger";

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className={cn("flex items-center justify-between rounded-t-xl px-3 py-2", headerBg)}>
        <span className={cn("text-xs font-medium", headerText)}>{title}</span>
        <span className={cn("text-xs tabular-nums", headerText)}>
          {fmtPlain(total)} {currency === "KZT" ? "₸" : "$"}
        </span>
      </div>
      <div className="flex flex-col gap-1 p-2">
        {entries.map((e) => (
          <JournalRow
            key={e.id}
            entry={e}
            currency={currency}
            date={date}
            balanceMap={balanceMap}
            globalRate={globalRate}
            onDelete={() =>
              deleteEntry.mutate({ id: e.id, entryDate: date, contactId: e.contact_id })
            }
          />
        ))}
        <NewRowForm
          currency={currency}
          sign={sign}
          date={date}
          onAdd={(input) => addEntry.mutate(input)}
        />
      </div>
    </div>
  );
}

function JournalRow({
  entry,
  currency,
  balanceMap,
  globalRate,
  onDelete,
}: {
  entry: JournalEntry;
  currency: "KZT" | "USD";
  date: string;
  balanceMap: Map<string, ContactWithBalance>;
  globalRate: number;
  onDelete: () => void;
}) {
  const amount = Number(entry.amount);
  const contact = entry.contact_id ? balanceMap.get(entry.contact_id) : undefined;
  const displayName = entry.contacts?.name ?? entry.label ?? "—";

  return (
    <div className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
      <div className="min-w-0 flex-1 truncate text-sm">
        {contact ? (
          <HoverCard openDelay={150} closeDelay={80}>
            <HoverCardTrigger asChild>
              <Link
                to="/contacts/$contactId"
                params={{ contactId: contact.id }}
                className="truncate underline decoration-dotted underline-offset-2 hover:text-primary"
              >
                {displayName}
              </Link>
            </HoverCardTrigger>
            <ContactBalanceHoverCard
              contactId={contact.id}
              name={contact.name}
              kztBalance={contact.kztBalance}
              usdBalance={contact.usdBalance}
              rate={effectiveRate(contact, globalRate)}
              txCount={contact.txCount}
              lastActivityAt={contact.lastActivityAt}
            />
          </HoverCard>
        ) : (
          <span className="truncate text-muted-foreground">{displayName}</span>
        )}
      </div>
      <div className="w-24 shrink-0 text-right text-sm tabular-nums">
        {fmtPlain(amount)}
        {currency === "USD" ? "" : " ₸"}
      </div>
      <button
        aria-label="Удалить строку"
        className="shrink-0 text-muted-foreground opacity-0 hover:text-danger group-hover:opacity-100"
        onClick={onDelete}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function NewRowForm({
  currency,
  sign,
  date,
  onAdd,
}: {
  currency: "KZT" | "USD";
  sign: 1 | -1;
  date: string;
  onAdd: (input: {
    entryDate: string;
    currency: "KZT" | "USD";
    amount: number;
    contactId?: string | null;
    label?: string | null;
  }) => void;
}) {
  const { data: contacts = [] } = useContactNames();
  const [query, setQuery] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [freeMode, setFreeMode] = useState(false);
  const [amount, setAmount] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || freeMode) return [];
    const starts = contacts.filter((c) => c.name.toLowerCase().startsWith(q));
    const list = starts.length > 0 ? starts : contacts.filter((c) => c.name.toLowerCase().includes(q));
    return list.slice(0, 6);
  }, [contacts, query, freeMode]);

  const reset = () => {
    setQuery("");
    setContactId(null);
    setAmount("");
    setShowDropdown(false);
  };

  const submit = async () => {
    const n = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
    const name = query.trim();
    if (!name || !n || isNaN(n)) return;
    if (freeMode) {
      onAdd({ entryDate: date, currency, amount: sign * n, label: name });
      reset();
      return;
    }
    let id = contactId;
    if (!id) {
      id = await findOrCreateContactByName(name);
    }
    onAdd({ entryDate: date, currency, amount: sign * n, contactId: id });
    reset();
  };

  return (
    <div className="flex items-center gap-2 px-1 pt-1">
      <button
        type="button"
        aria-label={freeMode ? "Режим: заметка" : "Режим: контакт"}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => {
          setFreeMode((v) => !v);
          setContactId(null);
          setShowDropdown(false);
        }}
        title={freeMode ? "Заметка (без контакта)" : "Привязка к контакту"}
      >
        {freeMode ? <Link2Off className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
      </button>
      <div className="relative min-w-0 flex-1">
        <Input
          className="h-8 text-sm"
          placeholder={freeMode ? "Заметка" : "Имя"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setContactId(null);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => {
            blurTimeout.current = setTimeout(() => setShowDropdown(false), 150);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-md border border-border bg-popover shadow-md">
            {suggestions.map((c) => (
              <div
                key={c.id}
                className="cursor-pointer px-3 py-1.5 text-sm hover:bg-muted"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (blurTimeout.current) clearTimeout(blurTimeout.current);
                  setQuery(c.name);
                  setContactId(c.id);
                  setShowDropdown(false);
                }}
              >
                {c.name}
              </div>
            ))}
          </div>
        )}
      </div>
      <Input
        className="h-8 w-20 text-right text-sm tabular-nums"
        placeholder="Сумма"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <Button size="icon" className="h-8 w-8 shrink-0" onClick={submit}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HoverCard, HoverCardTrigger } from "@/components/ui/hover-card";
import { ContactBalanceHoverCard } from "@/components/contact-hover-card";
import { ContactConversionDialog } from "@/components/contact-conversion-dialog";
import { ContactsExcelImportDialog } from "@/components/contacts-excel-import-dialog";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  History,
  Plus,
  Search,
  Users,
  Wallet,
  DollarSign,
  FileSpreadsheet,
  Coins,
} from "lucide-react";
import {
  fmtDateTime,
  useAllContactConversions,
  useContactsWithBalances,
  useCreateContact,
  type ContactWithBalance,
} from "@/lib/contacts";
import {
  CONTACT_CURRENCIES,
  balanceTone,
  fmtContactBalance,
  type ContactCurrency,
} from "@/lib/contact-currencies";

export const Route = createFileRoute("/contacts/")({
  head: () => ({
    meta: [{ title: "Контакты — Кассовый лист" }],
  }),
  component: ContactsPage,
});

const CURRENCY_ICON: Partial<Record<ContactCurrency, React.ComponentType<{ className?: string }>>> = {
  KZT: Wallet,
  USD: DollarSign,
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function ContactCurrencySection({
  title,
  icon: Icon,
  currency,
  contacts,
  onConvert,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  currency: ContactCurrency;
  contacts: ContactWithBalance[];
  onConvert: (contact: ContactWithBalance) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {contacts.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Нет контактов</p>
        )}
        {contacts.map((c) => {
          const value = c.balances[currency] ?? 0;
          return (
            <HoverCard key={`${c.id}-${currency}`} openDelay={150} closeDelay={80}>
              <div className="group flex items-center gap-1 px-1 transition-colors hover:bg-muted/50">
                <HoverCardTrigger asChild>
                  <Link
                    to="/contacts/$contactId"
                    params={{ contactId: c.id }}
                    className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2.5"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {initials(c.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{c.name}</div>
                      {c.lastActivityAt && (
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(c.lastActivityAt).toLocaleDateString("ru-RU")}
                        </div>
                      )}
                    </div>
                    <div
                      className={cn(
                        "shrink-0 text-sm font-semibold tabular-nums",
                        balanceTone(value),
                      )}
                    >
                      {fmtContactBalance(currency, value)}
                    </div>
                  </Link>
                </HoverCardTrigger>
                {(currency === "KZT" || currency === "USD") && (
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Конвертация"
                    className="h-8 w-8 shrink-0 bg-convert-soft text-convert opacity-70 hover:bg-convert-soft hover:text-convert hover:opacity-100"
                    onClick={(e) => {
                      e.preventDefault();
                      onConvert(c);
                    }}
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <ContactBalanceHoverCard
                contactId={c.id}
                name={c.name}
                balances={c.balances}
                activeCurrencies={c.activeCurrencies}
                txCount={c.txCount}
                lastActivityAt={c.lastActivityAt}
              />
            </HoverCard>
          );
        })}
      </div>
    </div>
  );
}

function sortContacts(
  list: ContactWithBalance[],
  sortBy: "balance" | "name" | "recent",
  currency: ContactCurrency,
) {
  if (sortBy === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  if (sortBy === "recent")
    return [...list].sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));
  return [...list].sort((a, b) => {
    const av = Math.abs(a.balances[currency] ?? 0);
    const bv = Math.abs(b.balances[currency] ?? 0);
    return bv - av;
  });
}

function currencySectionTitle(code: ContactCurrency) {
  const meta = CONTACT_CURRENCIES.find((c) => c.code === code);
  return meta ? `${meta.label}` : code;
}

function ContactsPage() {
  const { data: contacts, isLoading } = useContactsWithBalances();
  const createContact = useCreateContact();
  const { data: allConversions = [] } = useAllContactConversions();

  const [query, setQuery] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState<"all" | ContactCurrency>("all");
  const [sortBy, setSortBy] = useState<"balance" | "name" | "recent">("balance");
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [conversionOpen, setConversionOpen] = useState(false);
  const [conversionFixedContact, setConversionFixedContact] = useState<
    { id: string; name: string } | undefined
  >(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [excelImportOpen, setExcelImportOpen] = useState(false);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (contacts ?? []).filter((c) => c.name.toLowerCase().includes(q));
  }, [contacts, query]);

  const activeCurrencyCodes = useMemo(() => {
    const set = new Set<ContactCurrency>();
    for (const c of searched) {
      for (const code of c.activeCurrencies) set.add(code);
    }
    return CONTACT_CURRENCIES.map((x) => x.code).filter((code) => set.has(code));
  }, [searched]);

  const sections = useMemo(() => {
    const codes =
      currencyFilter === "all" ? activeCurrencyCodes : [currencyFilter];
    return codes
      .map((code) => ({
        code,
        contacts: sortContacts(
          searched.filter((c) => (c.balances[code] ?? 0) !== 0),
          sortBy,
          code,
        ),
      }))
      .filter((s) => s.contacts.length > 0);
  }, [searched, currencyFilter, activeCurrencyCodes, sortBy]);

  const hasResults = sections.length > 0;

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Users className="h-5 w-5 text-primary" />
          <div className="text-lg font-semibold">Контакты</div>
        </div>
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-3 pb-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Поиск по имени"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value as typeof currencyFilter)}
          >
            <option value="all">Все валюты</option>
            {CONTACT_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.short}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="balance">По балансу</option>
            <option value="name">По имени</option>
            <option value="recent">По дате</option>
          </select>
          <Button size="sm" className="gap-1" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Контакт</span>
          </Button>
        </div>
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 pb-3">
          <Button
            size="sm"
            className="flex-1 gap-1 bg-convert text-convert-foreground hover:bg-convert/90"
            onClick={() => {
              setConversionFixedContact(undefined);
              setConversionOpen(true);
            }}
          >
            <ArrowLeftRight className="h-4 w-4" />
            Конвертация
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => setHistoryOpen(true)}
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">История конвертаций</span>
          </Button>
        </div>
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 pb-3">
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1"
            onClick={() => setExcelImportOpen(true)}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Импорт баланса из Excel
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 py-3">
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Загрузка…</p>}
        {!isLoading && !hasResults && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {currencyFilter === "all"
              ? "Ничего не найдено"
              : `Нет контактов с ненулевым балансом в ${currencyFilter}`}
          </p>
        )}
        {!isLoading && hasResults && (
          <div
            className={cn(
              "grid gap-4",
              currencyFilter === "all" && sections.length > 1
                ? "sm:grid-cols-2"
                : "grid-cols-1",
            )}
          >
            {sections.map(({ code, contacts: list }) => (
              <ContactCurrencySection
                key={code}
                title={currencySectionTitle(code)}
                icon={CURRENCY_ICON[code] ?? Coins}
                currency={code}
                contacts={list}
                onConvert={(c) => {
                  setConversionFixedContact({ id: c.id, name: c.name });
                  setConversionOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </main>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый контакт</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Имя"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) {
                createContact.mutate(newName.trim());
                setNewName("");
                setAddOpen(false);
              }
            }}
          />
          <DialogFooter>
            <Button
              disabled={!newName.trim()}
              onClick={() => {
                createContact.mutate(newName.trim());
                setNewName("");
                setAddOpen(false);
              }}
            >
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContactConversionDialog
        open={conversionOpen}
        onOpenChange={setConversionOpen}
        contacts={contacts ?? []}
        fixedContact={conversionFixedContact}
      />

      <ContactsExcelImportDialog
        open={excelImportOpen}
        onOpenChange={setExcelImportOpen}
        contacts={contacts ?? []}
      />

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>История конвертаций</DialogTitle>
          </DialogHeader>
          {allConversions.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Конвертаций пока нет</p>
          )}
          <div className="flex flex-col divide-y divide-border">
            {allConversions.map((cv) => (
              <div key={cv.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{cv.contactName}</div>
                  <div className="text-[11px] text-muted-foreground">{fmtDateTime(cv.created_at)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-xs">
                  <span className="tabular-nums">
                    {cv.from_currency === "KZT"
                      ? `${Number(cv.from_amount).toLocaleString("ru-RU")} ₸`
                      : `$${Number(cv.from_amount).toLocaleString("en-US")}`}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium tabular-nums">
                    {cv.to_currency === "KZT"
                      ? `${Number(cv.to_amount).toLocaleString("ru-RU")} ₸`
                      : `$${Number(cv.to_amount).toLocaleString("en-US")}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

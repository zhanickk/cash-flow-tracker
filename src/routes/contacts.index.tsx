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
import { ContactsExcelImportDialog } from "@/components/contacts-excel-import-dialog";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Banknote,
  DollarSign,
  FileSpreadsheet,
  Plus,
  Search,
  Wallet,
} from "lucide-react";
import {
  useContactsWithBalances,
  useCreateContact,
  type ContactWithBalance,
} from "@/lib/contacts";
import { balanceTone, fmtContactBalance, type ContactCurrency } from "@/lib/contact-currencies";

export const Route = createFileRoute("/contacts/")({
  head: () => ({
    meta: [{ title: "Валютные счета — Кассовый лист" }],
  }),
  component: CurrencyAccountsPage,
});

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function sortByCurrencyAmount(
  list: ContactWithBalance[],
  currency: ContactCurrency,
  sign: "positive" | "negative",
) {
  return [...list]
    .sort((a, b) => {
      const av = Math.abs(a.balances[currency] ?? 0);
      const bv = Math.abs(b.balances[currency] ?? 0);
      return bv - av;
    })
    .filter((c) => {
      const v = c.balances[currency] ?? 0;
      return sign === "positive" ? v > 0 : v < 0;
    });
}

function CurrencyAccountSection({
  title,
  subtitle,
  contacts,
  currency,
  tone,
  icon: Icon,
}: {
  title: string;
  subtitle: string;
  contacts: ContactWithBalance[];
  currency: ContactCurrency;
  tone: "salynghan" | "karyz" | "kzt_plus" | "kzt_minus";
  icon: typeof DollarSign;
}) {
  const isUsd = currency === "USD";
  const total = contacts.reduce((s, c) => s + Math.abs(c.balances[currency] ?? 0), 0);
  const totalLabel = isUsd
    ? `$${total.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : `${total.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₸`;

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-[11px] text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {contacts.length} ·{" "}
          <span className="font-medium tabular-nums text-foreground">{totalLabel}</span>
        </div>
      </div>
      <div className="max-h-[min(420px,50vh)] divide-y divide-border overflow-y-auto">
        {contacts.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Нет записей</p>
        )}
        {contacts.map((c) => {
          const value = c.balances[currency] ?? 0;
          const display =
            tone === "karyz" || tone === "kzt_minus" ? Math.abs(value) : Math.abs(value);
          const signedForTone =
            tone === "salynghan" || tone === "kzt_plus" ? display : -display;
          return (
            <HoverCard key={c.id} openDelay={150} closeDelay={80}>
              <HoverCardTrigger asChild>
                <Link
                  to="/contacts/$contactId"
                  params={{ contactId: c.id }}
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
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
                      balanceTone(signedForTone),
                    )}
                  >
                    {fmtContactBalance(currency, tone === "karyz" || tone === "kzt_minus" ? -display : display)}
                  </div>
                </Link>
              </HoverCardTrigger>
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

function CurrencyAccountsPage() {
  const { data: contacts, isLoading } = useContactsWithBalances();
  const createContact = useCreateContact();

  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [excelImportOpen, setExcelImportOpen] = useState(false);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (contacts ?? []).filter((c) => c.name.toLowerCase().includes(q));
  }, [contacts, query]);

  const usdSalynghan = useMemo(() => sortByCurrencyAmount(searched, "USD", "positive"), [searched]);
  const usdKaryz = useMemo(() => sortByCurrencyAmount(searched, "USD", "negative"), [searched]);
  const kztPlus = useMemo(() => sortByCurrencyAmount(searched, "KZT", "positive"), [searched]);
  const kztMinus = useMemo(() => sortByCurrencyAmount(searched, "KZT", "negative"), [searched]);

  const hasResults =
    usdSalynghan.length > 0 ||
    usdKaryz.length > 0 ||
    kztPlus.length > 0 ||
    kztMinus.length > 0;

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Wallet className="h-5 w-5 text-primary" />
          <div>
            <div className="text-lg font-semibold">Валютные счета</div>
            <div className="text-xs text-muted-foreground">
              Долларовый и тенговый счета · данные из Excel и операций
            </div>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-3 pb-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Поиск по имени"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button size="sm" className="gap-1" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Контакт</span>
          </Button>
        </div>
        <div className="mx-auto flex max-w-7xl px-3 pb-3">
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1"
            onClick={() => setExcelImportOpen(true)}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Импорт из Excel (USD + KZT)
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-6 px-3 py-3">
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Загрузка…</p>}
        {!isLoading && !hasResults && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Нет счетов. Импортируйте из Excel или добавьте операции в карточке клиента.
          </p>
        )}
        {!isLoading && hasResults && (
          <>
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <DollarSign className="h-4 w-4" />
                Долларовый счёт
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                <CurrencyAccountSection
                  title="Салынған"
                  subtitle="Мы должны клиентам ($)"
                  contacts={usdSalynghan}
                  currency="USD"
                  tone="salynghan"
                  icon={DollarSign}
                />
                <CurrencyAccountSection
                  title="Қарыз"
                  subtitle="Клиенты должны нам ($)"
                  contacts={usdKaryz}
                  currency="USD"
                  tone="karyz"
                  icon={DollarSign}
                />
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Banknote className="h-4 w-4" />
                Тенговый счёт
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                <CurrencyAccountSection
                  title="Тенге плюс"
                  subtitle="Вложили нам деньги (₸)"
                  contacts={kztPlus}
                  currency="KZT"
                  tone="kzt_plus"
                  icon={Banknote}
                />
                <CurrencyAccountSection
                  title="Тенге минус"
                  subtitle="Должны нам (₸)"
                  contacts={kztMinus}
                  currency="KZT"
                  tone="kzt_minus"
                  icon={Banknote}
                />
              </div>
            </section>
          </>
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

      <ContactsExcelImportDialog
        open={excelImportOpen}
        onOpenChange={setExcelImportOpen}
        contacts={contacts ?? []}
      />
    </div>
  );
}

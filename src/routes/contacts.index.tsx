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
import { cn } from "@/lib/utils";
import { ArrowLeft, Plus, Search, Users, Wallet, DollarSign } from "lucide-react";
import {
  fmtAmount,
  fmtUsd,
  useContactsWithBalances,
  useCreateContact,
  type ContactWithBalance,
} from "@/lib/contacts";

export const Route = createFileRoute("/contacts/")({
  head: () => ({
    meta: [{ title: "Контакты — Кассовый лист" }],
  }),
  component: ContactsPage,
});

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function balanceTone(v: number) {
  if (v > 0) return "text-success";
  if (v < 0) return "text-danger";
  return "text-muted-foreground";
}

function ContactCurrencySection({
  title,
  icon: Icon,
  currency,
  contacts,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  currency: "KZT" | "USD";
  contacts: ContactWithBalance[];
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
          const value = currency === "KZT" ? c.kztBalance : c.usdBalance;
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
                    className={cn("shrink-0 text-sm font-semibold tabular-nums", balanceTone(value))}
                  >
                    {currency === "KZT" ? fmtAmount(value) + " ₸" : fmtUsd(value)}
                  </div>
                </Link>
              </HoverCardTrigger>
              <ContactBalanceHoverCard
                contactId={c.id}
                name={c.name}
                kztBalance={c.kztBalance}
                usdBalance={c.usdBalance}
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
  currency: "KZT" | "USD",
) {
  if (sortBy === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  if (sortBy === "recent")
    return [...list].sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));
  return [...list].sort((a, b) => {
    const av = Math.abs(currency === "KZT" ? a.kztBalance : a.usdBalance);
    const bv = Math.abs(currency === "KZT" ? b.kztBalance : b.usdBalance);
    return bv - av;
  });
}

function ContactsPage() {
  const { data: contacts, isLoading } = useContactsWithBalances();
  const createContact = useCreateContact();

  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"balance" | "name" | "recent">("balance");
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (contacts ?? []).filter((c) => c.name.toLowerCase().includes(q));
  }, [contacts, query]);

  const kztContacts = useMemo(
    () => sortContacts(searched.filter((c) => c.kztBalance !== 0), sortBy, "KZT"),
    [searched, sortBy],
  );
  const usdContacts = useMemo(
    () => sortContacts(searched.filter((c) => c.usdBalance !== 0), sortBy, "USD"),
    [searched, sortBy],
  );

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
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 pb-3">
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
      </header>

      <main className="mx-auto max-w-3xl px-3 py-3">
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Загрузка…</p>}
        {!isLoading && kztContacts.length === 0 && usdContacts.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Ничего не найдено</p>
        )}
        {!isLoading && (kztContacts.length > 0 || usdContacts.length > 0) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ContactCurrencySection
              title="Тенговые счета"
              icon={Wallet}
              currency="KZT"
              contacts={kztContacts}
            />
            <ContactCurrencySection
              title="Долларовые счета"
              icon={DollarSign}
              currency="USD"
              contacts={usdContacts}
            />
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
    </div>
  );
}

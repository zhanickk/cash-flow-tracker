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
  DollarSign,
  FileSpreadsheet,
  Plus,
  Search,
  Users,
} from "lucide-react";
import {
  useContactsWithBalances,
  useCreateContact,
  type ContactWithBalance,
} from "@/lib/contacts";
import { balanceTone, fmtContactBalance } from "@/lib/contact-currencies";

export const Route = createFileRoute("/contacts/")({
  head: () => ({
    meta: [{ title: "Клиенты USD — Кассовый лист" }],
  }),
  component: ContactsPage,
});

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function sortByUsdAmount(list: ContactWithBalance[], sign: "positive" | "negative") {
  return [...list].sort((a, b) => {
    const av = Math.abs(a.balances.USD ?? 0);
    const bv = Math.abs(b.balances.USD ?? 0);
    return bv - av;
  }).filter((c) => {
    const v = c.balances.USD ?? 0;
    return sign === "positive" ? v > 0 : v < 0;
  });
}

function UsdContactSection({
  title,
  subtitle,
  contacts,
  tone,
}: {
  title: string;
  subtitle: string;
  contacts: ContactWithBalance[];
  tone: "salynghan" | "karyz";
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-[11px] text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {contacts.length} ·{" "}
          <span className="font-medium tabular-nums text-foreground">
            $
            {contacts
              .reduce((s, c) => s + Math.abs(c.balances.USD ?? 0), 0)
              .toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
      <div className="max-h-[calc(100vh-14rem)] divide-y divide-border overflow-y-auto">
        {contacts.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Нет записей</p>
        )}
        {contacts.map((c) => {
          const value = c.balances.USD ?? 0;
          const display = tone === "karyz" ? Math.abs(value) : value;
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
                      balanceTone(tone === "salynghan" ? display : -display),
                    )}
                  >
                    {fmtContactBalance("USD", tone === "karyz" ? -display : display)}
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

function ContactsPage() {
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

  const salynghan = useMemo(() => sortByUsdAmount(searched, "positive"), [searched]);
  const karyz = useMemo(() => sortByUsdAmount(searched, "negative"), [searched]);

  const hasResults = salynghan.length > 0 || karyz.length > 0;

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Users className="h-5 w-5 text-primary" />
          <div>
            <div className="text-lg font-semibold">Клиенты (USD)</div>
            <div className="text-xs text-muted-foreground">Салынған и Қарыз по долларовому счёту</div>
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
            Импорт USD из Excel
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-3 py-3">
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Загрузка…</p>}
        {!isLoading && !hasResults && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Нет клиентов с USD-балансом. Импортируйте из Excel.
          </p>
        )}
        {!isLoading && hasResults && (
          <div className="grid gap-4 lg:grid-cols-2">
            <UsdContactSection
              title="Салынған"
              subtitle="Мы должны клиентам ($)"
              contacts={salynghan}
              tone="salynghan"
            />
            <UsdContactSection
              title="Қарыз"
              subtitle="Клиенты должны нам ($)"
              contacts={karyz}
              tone="karyz"
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

      <ContactsExcelImportDialog
        open={excelImportOpen}
        onOpenChange={setExcelImportOpen}
        contacts={contacts ?? []}
      />
    </div>
  );
}

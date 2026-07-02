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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { ArrowLeft, Plus, Search, Users } from "lucide-react";
import {
  effectiveRate,
  fmtAmount,
  fmtUsd,
  useContactsWithBalances,
  useCreateContact,
  useGlobalRate,
  useUpdateGlobalRate,
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

function ContactHoverCard({
  contact,
  globalRate,
}: {
  contact: ContactWithBalance;
  globalRate: number;
}) {
  const rate = effectiveRate(contact, globalRate);
  const combinedKzt = contact.kztBalance + contact.usdBalance * rate;
  return (
    <HoverCardContent className="w-72">
      <div className="mb-2 text-sm font-medium">{contact.name}</div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div className={cn("rounded-md bg-muted p-2", contact.kztBalance !== 0 && "bg-opacity-50")}>
          <div className="text-[11px] text-muted-foreground">Тенге</div>
          <div className={cn("text-sm font-semibold tabular-nums", balanceTone(contact.kztBalance))}>
            {fmtAmount(contact.kztBalance)} ₸
          </div>
        </div>
        <div className="rounded-md bg-muted p-2">
          <div className="text-[11px] text-muted-foreground">USD</div>
          <div className={cn("text-sm font-semibold tabular-nums", balanceTone(contact.usdBalance))}>
            {fmtUsd(contact.usdBalance)}
          </div>
        </div>
      </div>
      <div className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
        Итого в тенге по курсу {rate ? rate.toLocaleString("ru-RU") : "—"}:{" "}
        <span className={cn("font-medium", balanceTone(combinedKzt))}>
          {fmtAmount(combinedKzt)} ₸
        </span>
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        {contact.txCount} операц{contact.txCount === 1 ? "ия" : "ий"}
        {contact.lastActivityAt ? ` · ${new Date(contact.lastActivityAt).toLocaleDateString("ru-RU")}` : ""}
      </div>
    </HoverCardContent>
  );
}

function ContactsPage() {
  const { data: contacts, isLoading } = useContactsWithBalances();
  const { data: globalRate = 0 } = useGlobalRate();
  const updateGlobalRate = useUpdateGlobalRate();
  const createContact = useCreateContact();

  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"balance" | "name" | "recent">("balance");
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [rateDraft, setRateDraft] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const list = (contacts ?? []).filter((c) =>
      c.name.toLowerCase().includes(query.trim().toLowerCase()),
    );
    const rate = globalRate || 1;
    if (sortBy === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    if (sortBy === "recent")
      return [...list].sort((a, b) =>
        (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
      );
    return [...list].sort((a, b) => {
      const av = Math.abs(a.kztBalance + a.usdBalance * effectiveRate(a, rate));
      const bv = Math.abs(b.kztBalance + b.usdBalance * effectiveRate(b, rate));
      return bv - av;
    });
  }, [contacts, query, sortBy, globalRate]);

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Users className="h-5 w-5 text-primary" />
          <div className="text-lg font-semibold">Контакты</div>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Общий курс, ₸/$</span>
            <Input
              className="h-8 w-20 text-right tabular-nums"
              value={rateDraft ?? String(globalRate || "")}
              onFocus={() => setRateDraft(String(globalRate || ""))}
              onChange={(e) => setRateDraft(e.target.value.replace(/[^\d.,]/g, ""))}
              onBlur={() => {
                if (rateDraft === null) return;
                const n = parseFloat(rateDraft.replace(",", "."));
                if (!isNaN(n) && n > 0) updateGlobalRate.mutate(n);
                setRateDraft(null);
              }}
            />
          </div>
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
        {!isLoading && filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Ничего не найдено</p>
        )}
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {filtered.map((c) => {
            const rate = effectiveRate(c, globalRate);
            const combinedKzt = c.kztBalance + c.usdBalance * rate;
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
                    <div className="text-right">
                      <div className={cn("text-sm font-semibold tabular-nums", balanceTone(combinedKzt))}>
                        {fmtAmount(combinedKzt)} ₸
                      </div>
                      {c.usdBalance !== 0 && (
                        <div className="text-[11px] text-muted-foreground">
                          {fmtUsd(c.usdBalance)} · {fmtAmount(c.kztBalance)} ₸
                        </div>
                      )}
                    </div>
                  </Link>
                </HoverCardTrigger>
                <ContactHoverCard contact={c} globalRate={globalRate} />
              </HoverCard>
            );
          })}
        </div>
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

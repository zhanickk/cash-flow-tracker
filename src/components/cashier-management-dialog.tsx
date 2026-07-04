import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAddCashier, useCashiers } from "@/lib/auth";

export function CashierManagementDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cashiers = useCashiers();
  const addCashier = useAddCashier();

  function reset() {
    setName("");
    setLogin("");
    setPassword("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addCashier.mutateAsync({ name, login, password });
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось добавить кассира");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Users className="h-4 w-4" />
          Кассиры
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Кассиры</DialogTitle>
          <DialogDescription>
            Список кассиров с доступом к системе и добавление нового.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-40 overflow-y-auto rounded-md border border-border">
          {cashiers.isLoading && (
            <div className="p-3 text-sm text-muted-foreground">Загрузка…</div>
          )}
          {cashiers.data && cashiers.data.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">Кассиров пока нет</div>
          )}
          {cashiers.data?.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between border-b border-border px-3 py-2 text-sm last:border-b-0"
            >
              <span className="font-medium text-foreground">{c.name}</span>
              <span className="text-muted-foreground">{c.login}</span>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <UserPlus className="h-4 w-4" />
            Добавить нового кассира
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-cashier-name">Имя</Label>
              <Input
                id="new-cashier-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Айгерим"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-cashier-login">Логин</Label>
              <Input
                id="new-cashier-login"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="aigerim"
                autoCapitalize="off"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-cashier-password">Пароль</Label>
            <Input
              id="new-cashier-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="минимум 6 символов"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={addCashier.isPending} className="w-full">
              {addCashier.isPending ? "Добавляем…" : "Добавить кассира"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

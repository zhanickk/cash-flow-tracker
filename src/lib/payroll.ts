import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { recordExpense, type Expense } from "@/lib/expenses";
import { PAYROLL_CATEGORY_CODE } from "@/lib/expenses";

type EmployeeRow = Tables<"payroll_employees">;

export interface Employee {
  id: string;
  name: string;
  salaryKzt: number;
  /** День месяца, когда обычно выплачивается зарплата (1-31) — просто
   * ориентир, ничего не блокирует и не начисляет само по себе. */
  payday: number;
  isActive: boolean;
}

const EMPLOYEES_KEY = ["payroll-employees"];

function rowToEmployee(r: EmployeeRow): Employee {
  return {
    id: r.id,
    name: r.name,
    salaryKzt: Number(r.salary_kzt),
    payday: r.payday,
    isActive: r.is_active,
  };
}

export function useEmployees() {
  return useQuery({
    queryKey: EMPLOYEES_KEY,
    queryFn: async (): Promise<Employee[]> => {
      const { data, error } = await supabase
        .from("payroll_employees")
        .select("*")
        .order("payday", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(rowToEmployee);
    },
  });
}

export function useAddEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; salaryKzt: number; payday: number }) => {
      const { error } = await supabase.from("payroll_employees").insert({
        name: input.name.trim(),
        salary_kzt: input.salaryKzt,
        payday: input.payday,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<{ name: string; salaryKzt: number; payday: number; isActive: boolean }>;
    }) => {
      const update: TablesUpdate<"payroll_employees"> = { updated_at: new Date().toISOString() };
      if (patch.name !== undefined) update.name = patch.name.trim();
      if (patch.salaryKzt !== undefined) update.salary_kzt = patch.salaryKzt;
      if (patch.payday !== undefined) update.payday = patch.payday;
      if (patch.isActive !== undefined) update.is_active = patch.isActive;
      const { error } = await supabase.from("payroll_employees").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payroll_employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}

/** YYYY-MM в локальном часовом поясе браузера. */
function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Выплачена ли зарплата сотруднику в текущем календарном месяце — ищем
 * запись в expenses с категорией "Зарплаты" и note, точно равным имени
 * сотрудника (так записывает recordSalaryPayment ниже). */
export function isPaidThisMonth(expenses: Expense[], employeeName: string, now = Date.now()): boolean {
  const target = monthKey(now);
  const name = employeeName.trim().toLowerCase();
  return expenses.some(
    (e) =>
      e.category === PAYROLL_CATEGORY_CODE &&
      (e.note ?? "").trim().toLowerCase() === name &&
      monthKey(e.occurredAt) === target,
  );
}

/** Запись выплаты зарплаты конкретному сотруднику — невозвратный расход
 * категории "Зарплаты", note = имя сотрудника (по нему и матчим
 * isPaidThisMonth выше). */
export async function recordSalaryPayment(employee: Employee, amountKzt: number): Promise<void> {
  await recordExpense({
    occurredAt: new Date().toISOString(),
    category: PAYROLL_CATEGORY_CODE,
    note: employee.name,
    amountKzt,
  });
}

export function useRecordSalaryPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employee, amountKzt }: { employee: Employee; amountKzt: number }) =>
      recordSalaryPayment(employee, amountKzt),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

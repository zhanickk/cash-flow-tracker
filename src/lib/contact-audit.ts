import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabase-paginate";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type ContactAuditEntry = Tables<"contact_audit_log">;
export type ContactAuditAction = ContactAuditEntry["action"];

const AUDIT_KEY = ["contact-audit-log"];

export function useContactAuditLog() {
  return useQuery({
    queryKey: AUDIT_KEY,
    queryFn: async (): Promise<ContactAuditEntry[]> => {
      // Постранично: в журнале уже почти 2000 записей, а один ответ отдаёт
      // максимум 1000 — .limit(2000) молча обрезался, и старые записи в
      // историю не попадали.
      return await fetchAllRows<ContactAuditEntry>((from, to) =>
        supabase
          .from("contact_audit_log")
          .select("*")
          .order("occurred_at", { ascending: false })
          .order("created_at", { ascending: false })
          .range(from, to),
      );
    },
  });
}

export async function appendContactAuditLog(
  entry: Omit<TablesInsert<"contact_audit_log">, "id" | "created_at">,
) {
  const { error } = await supabase.from("contact_audit_log").insert(entry);
  if (error) throw error;
}

export function invalidateContactAudit(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: AUDIT_KEY });
}

export function auditActionLabel(action: string): string {
  switch (action) {
    case "add":
      return "Операция";
    case "edit":
      return "Изменение";
    case "delete":
      return "Удаление";
    case "import":
      return "Импорт Excel";
    case "conversion":
      return "Конвертация";
    case "create_contact":
      return "Новый контакт";
    case "cash_sync":
      return "Касса";
    default:
      return action;
  }
}

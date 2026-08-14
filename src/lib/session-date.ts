import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Рабочая дата смены — задаётся явно, а не выводится из даты первой операции.
 *
 * «Новый день» — ручное действие, поэтому календарь и рабочий день не совпадают:
 * смену могут открыть поздно вечером (по календарю ещё сегодня, по работе уже
 * завтра) или забыть закрыть — и тогда операции двух дней слипаются в одну дату.
 * Явная дата решает и то, и другое, и позволяет открыть кассу на следующий день
 * до того, как он наступил по календарю.
 */

export const SESSION_DATE_KEY = ["session-business-date"];

/** YYYY-MM-DD в местном времени (не UTC — иначе поздним вечером «уезжает»). */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dateKeyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Следующий день от переданной даты — значение по умолчанию при «Новый день». */
export function nextDateKey(key: string): string {
  const d = dateKeyToDate(key);
  d.setDate(d.getDate() + 1);
  return toDateKey(d);
}

export function formatDateKeyRu(key: string): string {
  return dateKeyToDate(key).toLocaleDateString("ru-RU", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function useSessionDate() {
  return useQuery({
    queryKey: SESSION_DATE_KEY,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from("session_state")
        .select("business_date")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return data?.business_date ?? toDateKey(new Date());
    },
  });
}

export async function setSessionDate(dateKey: string) {
  const { error } = await supabase
    .from("session_state")
    .upsert({ id: true, business_date: dateKey, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export function useSetSessionDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: setSessionDate,
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSION_DATE_KEY }),
  });
}

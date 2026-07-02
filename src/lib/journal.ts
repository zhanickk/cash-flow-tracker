import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type JournalEntry = Tables<"contact_transactions"> & {
  contacts: { name: string } | null;
};

export function todayIso() {
  const d = new Date();
  const tz = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tz * 60000);
  return local.toISOString().slice(0, 10);
}

export function useJournalEntries(entryDate: string) {
  return useQuery({
    queryKey: ["journal-entries", entryDate],
    queryFn: async (): Promise<JournalEntry[]> => {
      const { data, error } = await supabase
        .from("contact_transactions")
        .select("*, contacts(name)")
        .eq("entry_date", entryDate)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as JournalEntry[];
    },
  });
}

export function useContactNames() {
  return useQuery({
    queryKey: ["contact-names"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export async function findOrCreateContactByName(name: string): Promise<string> {
  const trimmed = name.trim();
  const { data: existing, error: findErr } = await supabase
    .from("contacts")
    .select("id")
    .ilike("name", trimmed)
    .limit(1)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing.id;
  const { data: created, error: createErr } = await supabase
    .from("contacts")
    .insert({ name: trimmed })
    .select("id")
    .single();
  if (createErr) throw createErr;
  return created.id;
}

export interface AddJournalEntryInput {
  entryDate: string;
  currency: "KZT" | "USD";
  amount: number;
  contactId?: string | null;
  label?: string | null;
  note?: string | null;
}

export function useAddJournalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddJournalEntryInput) => {
      const { error } = await supabase.from("contact_transactions").insert({
        entry_date: input.entryDate,
        currency: input.currency,
        amount: input.amount,
        contact_id: input.contactId ?? null,
        label: input.label ?? null,
        note: input.note ?? null,
        source: "journal",
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["journal-entries", vars.entryDate] });
      qc.invalidateQueries({ queryKey: ["contacts-with-balances"] });
      qc.invalidateQueries({ queryKey: ["contact-names"] });
      if (vars.contactId) {
        qc.invalidateQueries({ queryKey: ["contact-detail", vars.contactId] });
        qc.invalidateQueries({ queryKey: ["contact-last5", vars.contactId] });
      }
    },
  });
}

export function useDeleteJournalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; entryDate: string; contactId?: string | null }) => {
      const { error } = await supabase.from("contact_transactions").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["journal-entries", vars.entryDate] });
      qc.invalidateQueries({ queryKey: ["contacts-with-balances"] });
      if (vars.contactId) {
        qc.invalidateQueries({ queryKey: ["contact-detail", vars.contactId] });
        qc.invalidateQueries({ queryKey: ["contact-last5", vars.contactId] });
      }
    },
  });
}

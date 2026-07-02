import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Contact = Tables<"contacts">;
export type ContactTransaction = Tables<"contact_transactions">;

export interface ContactWithBalance extends Contact {
  kztBalance: number;
  usdBalance: number;
  lastActivityAt: string | null;
  txCount: number;
}

function aggregateBalances(
  contacts: Contact[],
  txs: ContactTransaction[],
): ContactWithBalance[] {
  const byContact = new Map<string, ContactTransaction[]>();
  for (const t of txs) {
    if (!t.contact_id) continue;
    const list = byContact.get(t.contact_id) ?? [];
    list.push(t);
    byContact.set(t.contact_id, list);
  }
  return contacts.map((c) => {
    const list = byContact.get(c.id) ?? [];
    let kztBalance = 0;
    let usdBalance = 0;
    let lastActivityAt: string | null = null;
    for (const t of list) {
      if (t.currency === "KZT") kztBalance += Number(t.amount);
      else if (t.currency === "USD") usdBalance += Number(t.amount);
      if (!lastActivityAt || t.occurred_at > lastActivityAt) lastActivityAt = t.occurred_at;
    }
    return { ...c, kztBalance, usdBalance, lastActivityAt, txCount: list.length };
  });
}

export function useContactsWithBalances() {
  return useQuery({
    queryKey: ["contacts-with-balances"],
    queryFn: async (): Promise<ContactWithBalance[]> => {
      const [{ data: contacts, error: cErr }, { data: txs, error: tErr }] = await Promise.all([
        supabase.from("contacts").select("*"),
        supabase.from("contact_transactions").select("*"),
      ]);
      if (cErr) throw cErr;
      if (tErr) throw tErr;
      return aggregateBalances(contacts ?? [], txs ?? []);
    },
  });
}

export function useContactDetail(contactId: string | undefined) {
  return useQuery({
    queryKey: ["contact-detail", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      if (!contactId) return null;
      const [{ data: contact, error: cErr }, { data: txs, error: tErr }] = await Promise.all([
        supabase.from("contacts").select("*").eq("id", contactId).single(),
        supabase
          .from("contact_transactions")
          .select("*")
          .eq("contact_id", contactId)
          .order("occurred_at", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);
      if (cErr) throw cErr;
      if (tErr) throw tErr;
      const list = txs ?? [];
      let kztBalance = 0;
      let usdBalance = 0;
      for (const t of list) {
        if (t.currency === "KZT") kztBalance += Number(t.amount);
        else if (t.currency === "USD") usdBalance += Number(t.amount);
      }
      return { contact: contact as Contact, transactions: list, kztBalance, usdBalance };
    },
  });
}

export function useContactLast5(contactId: string | null | undefined) {
  return useQuery({
    queryKey: ["contact-last5", contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<ContactTransaction[]> => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from("contact_transactions")
        .select("*")
        .eq("contact_id", contactId)
        .order("occurred_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGlobalRate() {
  return useQuery({
    queryKey: ["global-rate"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("global_rate")
        .eq("id", true)
        .single();
      if (error) throw error;
      return data?.global_rate ?? 0;
    },
  });
}

export function useUpdateGlobalRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rate: number) => {
      const { error } = await supabase
        .from("app_settings")
        .update({ global_rate: rate, updated_at: new Date().toISOString() })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["global-rate"] });
    },
  });
}

export function useUpdateContactRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, rate }: { contactId: string; rate: number | null }) => {
      const { error } = await supabase
        .from("contacts")
        .update({ custom_rate: rate, updated_at: new Date().toISOString() })
        .eq("id", contactId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["contact-detail", vars.contactId] });
      qc.invalidateQueries({ queryKey: ["contacts-with-balances"] });
    },
  });
}

export function useAddContactTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      contactId: string;
      currency: "KZT" | "USD";
      amount: number;
      note?: string;
    }): Promise<{ id: string }> => {
      const { data, error } = await supabase
        .from("contact_transactions")
        .insert({
          contact_id: input.contactId,
          currency: input.currency,
          amount: input.amount,
          note: input.note ?? null,
          source: "app",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["contact-detail", vars.contactId] });
      qc.invalidateQueries({ queryKey: ["contacts-with-balances"] });
      qc.invalidateQueries({ queryKey: ["contact-last5", vars.contactId] });
    },
  });
}

export function useDeleteContactTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<{ contact_id: string | null }> => {
      const { data, error } = await supabase
        .from("contact_transactions")
        .delete()
        .eq("id", id)
        .select("contact_id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.contact_id) {
        qc.invalidateQueries({ queryKey: ["contact-detail", data.contact_id] });
        qc.invalidateQueries({ queryKey: ["contact-last5", data.contact_id] });
      }
      qc.invalidateQueries({ queryKey: ["contacts-with-balances"] });
    },
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("contacts")
        .insert({ name: name.trim() })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts-with-balances"] });
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

export function effectiveRate(contact: { custom_rate: number | null }, globalRate: number) {
  return contact.custom_rate ?? globalRate;
}

export function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("ru-RU")} ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

export function fmtAmount(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n);
  return sign + abs.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

export function fmtUsd(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n);
  return sign + "$" + abs.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

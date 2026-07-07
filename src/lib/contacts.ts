import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { insertHistory } from "@/lib/cash-register";
import { nameKey } from "@/lib/contacts-excel-import";
import type { Currency } from "@/lib/cash-shared";
import {
  computeBalancesFromAmounts,
  emptyBalances,
  fmtContactBalancePlain,
  openCurrencies,
  type ContactCurrency,
} from "@/lib/contact-currencies";

export type Contact = Tables<"contacts">;
export type ContactTransaction = Tables<"contact_transactions">;
export type ContactConversion = Tables<"contact_conversions">;

export interface ContactWithBalance extends Contact {
  balances: Record<ContactCurrency, number>;
  /** @deprecated use balances.KZT */
  kztBalance: number;
  /** @deprecated use balances.USD */
  usdBalance: number;
  activeCurrencies: ContactCurrency[];
  lastActivityAt: string | null;
  txCount: number;
}

function journalAmount(currency: string, amount: number) {
  return fmtContactBalancePlain(currency, amount);
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
    const balances = computeBalancesFromAmounts(list);
    let lastActivityAt: string | null = null;
    for (const t of list) {
      if (!lastActivityAt || t.occurred_at > lastActivityAt) lastActivityAt = t.occurred_at;
    }
    return {
      ...c,
      balances,
      kztBalance: balances.KZT,
      usdBalance: balances.USD,
      activeCurrencies: openCurrencies(balances),
      lastActivityAt,
      txCount: list.length,
    };
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
      const balances = computeBalancesFromAmounts(list);
      return {
        contact: contact as Contact,
        transactions: list,
        balances,
        kztBalance: balances.KZT,
        usdBalance: balances.USD,
        activeCurrencies: openCurrencies(balances),
      };
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
      currency: Currency;
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
        .select("id, contacts(name)")
        .single();
      if (error) throw error;
      const contactName = (data as unknown as { contacts: { name: string } | null }).contacts?.name ?? "—";
      await insertHistory({
        action: "add",
        summary: `Контакт «${contactName}»: ${journalAmount(input.currency, input.amount)}${
          input.note ? ` — ${input.note}` : ""
        }`,
      });
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["contact-detail", vars.contactId] });
      qc.invalidateQueries({ queryKey: ["contacts-with-balances"] });
      qc.invalidateQueries({ queryKey: ["contact-last5", vars.contactId] });
    },
  });
}

export function useUpdateContactTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      contactId: string;
      currency?: Currency;
      amount?: number;
    }) => {
      const patch: { currency?: string; amount?: number } = {};
      if (input.currency !== undefined) patch.currency = input.currency;
      if (input.amount !== undefined) patch.amount = input.amount;
      if (Object.keys(patch).length === 0) return;

      const { data, error } = await supabase
        .from("contact_transactions")
        .update(patch)
        .eq("id", input.id)
        .select("currency, amount, note, contacts(name)")
        .single();
      if (error) throw error;

      const row = data as unknown as {
        currency: string;
        amount: number;
        note: string | null;
        contacts: { name: string } | null;
      };
      const contactName = row.contacts?.name ?? "—";
      await insertHistory({
        action: "edit",
        summary: `Контакт «${contactName}»: изменена операция → ${journalAmount(row.currency, Number(row.amount))}${
          row.note ? ` — ${row.note}` : ""
        }`,
      });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["contact-detail", vars.contactId] });
      qc.invalidateQueries({ queryKey: ["contacts-with-balances"] });
      qc.invalidateQueries({ queryKey: ["contact-last5", vars.contactId] });
    },
  });
}

export interface ExcelBalanceTarget {
  rawName: string;
  normalizedName: string;
  currency: "KZT" | "USD";
  targetBalance: number;
}

export function useImportContactBalancesFromExcel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sheetLabel: string;
      targets: ExcelBalanceTarget[];
    }): Promise<{ reconciled: number; created: number; zeroed: number }> => {
      const [{ data: contacts, error: cErr }, { data: allTxs, error: tErr }] = await Promise.all([
        supabase.from("contacts").select("*"),
        supabase.from("contact_transactions").select("*"),
      ]);
      if (cErr) throw cErr;
      if (tErr) throw tErr;

      const contactList = contacts ?? [];
      const txs = allTxs ?? [];

      const contactByKey = new Map<string, Contact>();
      for (const c of contactList) {
        const key = nameKey(c.name);
        if (!contactByKey.has(key)) contactByKey.set(key, c);
      }

      const txsByContact = new Map<string, ContactTransaction[]>();
      for (const t of txs) {
        if (!t.contact_id) continue;
        const list = txsByContact.get(t.contact_id) ?? [];
        list.push(t);
        txsByContact.set(t.contact_id, list);
      }

      function currentBalance(contactId: string, currency: string) {
        const list = txsByContact.get(contactId) ?? [];
        return list
          .filter((t) => t.currency === currency)
          .reduce((s, t) => s + Number(t.amount), 0);
      }

      function applyPendingDelta(contactId: string, currency: string, delta: number) {
        const list = txsByContact.get(contactId) ?? [];
        list.push({
          contact_id: contactId,
          currency,
          amount: delta,
        } as ContactTransaction);
        txsByContact.set(contactId, list);
      }

      const targetsByPersonCurrency = new Map<string, ExcelBalanceTarget>();
      for (const target of input.targets) {
        targetsByPersonCurrency.set(`${nameKey(target.normalizedName)}:${target.currency}`, target);
      }

      const namesOnSheet = new Set(
        [...targetsByPersonCurrency.values()].map((t) => nameKey(t.normalizedName)),
      );
      const inserts: {
        contact_id: string;
        currency: string;
        amount: number;
        note: string;
        source: string;
      }[] = [];

      let created = 0;

      for (const target of targetsByPersonCurrency.values()) {
        const key = nameKey(target.normalizedName);
        let contact = contactByKey.get(key);
        if (!contact) {
          const { data: newContact, error: createErr } = await supabase
            .from("contacts")
            .insert({ name: target.normalizedName })
            .select("*")
            .single();
          if (createErr) throw createErr;
          contact = newContact;
          contactByKey.set(key, contact);
          contactList.push(contact);
          txsByContact.set(contact.id, []);
          created++;
        }

        const current = currentBalance(contact.id, target.currency);
        const delta = target.targetBalance - current;
        if (Math.abs(delta) < 0.0001) continue;

        inserts.push({
          contact_id: contact.id,
          currency: target.currency,
          amount: delta,
          note: `Сверка баланса из Excel (лист ${input.sheetLabel}) — «${target.rawName}»: ${current.toLocaleString("ru-RU")} → ${target.targetBalance.toLocaleString("ru-RU")}`,
          source: "excel_import",
        });
        applyPendingDelta(contact.id, target.currency, delta);
      }

      for (const contact of contactList) {
        if (namesOnSheet.has(nameKey(contact.name))) continue;

        const contactTxs = txsByContact.get(contact.id) ?? [];
        const balances = computeBalancesFromAmounts(contactTxs);
        for (const [currency, balance] of Object.entries(balances)) {
          if (Math.abs(balance) < 0.0001) continue;
          inserts.push({
            contact_id: contact.id,
            currency,
            amount: -balance,
            note: `Сверка: контакт отсутствует на листе Excel (лист ${input.sheetLabel}) — обнуление`,
            source: "excel_import",
          });
        }
      }

      if (inserts.length > 0) {
        const { error } = await supabase.from("contact_transactions").insert(inserts);
        if (error) throw error;
      }

      await insertHistory({
        action: "add",
        summary: `Импорт Excel (лист ${input.sheetLabel}): сверка ${inserts.length} счетов, создано контактов ${created}`,
      });

      return {
        reconciled: inserts.length,
        created,
        zeroed: contactList.filter((c) => !namesOnSheet.has(nameKey(c.name))).length,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-detail"] });
      qc.invalidateQueries({ queryKey: ["contact-last5"] });
      qc.invalidateQueries({ queryKey: ["contacts-with-balances"] });
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
        .select("contact_id, currency, amount, note, contacts(name)")
        .single();
      if (error) throw error;
      const row = data as unknown as {
        contact_id: string | null;
        currency: string;
        amount: number;
        note: string | null;
        contacts: { name: string } | null;
      };
      const contactName = row.contacts?.name ?? "—";
      await insertHistory({
        action: "delete",
        summary: `Контакт «${contactName}»: удалена операция ${journalAmount(row.currency, Number(row.amount))}${
          row.note ? ` — ${row.note}` : ""
        }`,
      });
      return { contact_id: row.contact_id };
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

function conversionNote(input: {
  fromCurrency: "KZT" | "USD";
  toCurrency: "KZT" | "USD";
  fromAmount: number;
  toAmount: number;
  rate: number;
}) {
  const fmtFrom =
    input.fromCurrency === "KZT"
      ? `${input.fromAmount.toLocaleString("ru-RU")} ₸`
      : `$${input.fromAmount.toLocaleString("en-US")}`;
  const fmtTo =
    input.toCurrency === "KZT"
      ? `${input.toAmount.toLocaleString("ru-RU")} ₸`
      : `$${input.toAmount.toLocaleString("en-US")}`;
  return `Конвертация: ${fmtFrom} → ${fmtTo} (курс ${input.rate.toLocaleString("ru-RU")})`;
}

export function useContactConversions(contactId: string | null | undefined) {
  return useQuery({
    queryKey: ["contact-conversions", contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<ContactConversion[]> => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from("contact_conversions")
        .select("*")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAllContactConversions() {
  return useQuery({
    queryKey: ["all-contact-conversions"],
    queryFn: async (): Promise<(ContactConversion & { contactName: string })[]> => {
      const { data, error } = await supabase
        .from("contact_conversions")
        .select("*, contacts(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((row) => {
        const { contacts, ...rest } = row as ContactConversion & { contacts: { name: string } | null };
        return { ...rest, contactName: contacts?.name ?? "—" };
      });
    },
  });
}

export function useAddContactConversion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      contactId: string;
      fromCurrency: "KZT" | "USD";
      toCurrency: "KZT" | "USD";
      fromAmount: number;
      toAmount: number;
      rate: number;
    }) => {
      const { data: conversion, error: convErr } = await supabase
        .from("contact_conversions")
        .insert({
          contact_id: input.contactId,
          from_currency: input.fromCurrency,
          to_currency: input.toCurrency,
          from_amount: input.fromAmount,
          to_amount: input.toAmount,
          rate: input.rate,
        })
        .select("id, contacts(name)")
        .single();
      if (convErr) throw convErr;
      const note = conversionNote(input);
      const { error: txErr } = await supabase.from("contact_transactions").insert([
        {
          contact_id: input.contactId,
          currency: input.fromCurrency,
          amount: -input.fromAmount,
          note,
          source: "conversion",
          conversion_id: conversion.id,
        },
        {
          contact_id: input.contactId,
          currency: input.toCurrency,
          amount: input.toAmount,
          note,
          source: "conversion",
          conversion_id: conversion.id,
        },
      ]);
      if (txErr) throw txErr;
      const contactName =
        (conversion as unknown as { contacts: { name: string } | null }).contacts?.name ?? "—";
      await insertHistory({
        action: "add",
        summary: `Контакт «${contactName}»: ${note}`,
      });
      return conversion;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["contact-detail", vars.contactId] });
      qc.invalidateQueries({ queryKey: ["contacts-with-balances"] });
      qc.invalidateQueries({ queryKey: ["contact-last5", vars.contactId] });
      qc.invalidateQueries({ queryKey: ["contact-conversions", vars.contactId] });
      qc.invalidateQueries({ queryKey: ["all-contact-conversions"] });
    },
  });
}

export function useDeleteContactConversion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<{ contact_id: string }> => {
      const { data, error } = await supabase
        .from("contact_conversions")
        .delete()
        .eq("id", id)
        .select("contact_id, from_currency, to_currency, from_amount, to_amount, contacts(name)")
        .single();
      if (error) throw error;
      const row = data as unknown as {
        contact_id: string;
        from_currency: "KZT" | "USD";
        to_currency: "KZT" | "USD";
        from_amount: number;
        to_amount: number;
        contacts: { name: string } | null;
      };
      const contactName = row.contacts?.name ?? "—";
      const note = conversionNote({
        fromCurrency: row.from_currency,
        toCurrency: row.to_currency,
        fromAmount: Number(row.from_amount),
        toAmount: Number(row.to_amount),
        rate: 0,
      }).replace(/\s*\(курс[^)]*\)/, "");
      await insertHistory({
        action: "delete",
        summary: `Контакт «${contactName}»: удалена конвертация ${note}`,
      });
      return { contact_id: row.contact_id };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["contact-detail", data.contact_id] });
      qc.invalidateQueries({ queryKey: ["contacts-with-balances"] });
      qc.invalidateQueries({ queryKey: ["contact-last5", data.contact_id] });
      qc.invalidateQueries({ queryKey: ["contact-conversions", data.contact_id] });
      qc.invalidateQueries({ queryKey: ["all-contact-conversions"] });
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

export { fmtContactBalancePlain as fmtContactAmount, emptyBalances };

import type { Contact, ContactTransaction } from "@/lib/contacts";
import { inferTxType } from "@/lib/fx-pots";

export interface ClientFxRow {
  contactId: string;
  name: string;
  currency: string;
  karyzTotal: number;
  salynghanTotal: number;
  balance: number;
  txCount: number;
}

function contactKaryzSalynghan(txs: ContactTransaction[], currency: string) {
  let karyz = 0;
  let salynghan = 0;
  let balance = 0;
  let txCount = 0;
  for (const t of txs) {
    if (t.currency !== currency) continue;
    txCount++;
    const amt = Number(t.amount);
    balance += amt;
    const type = t.tx_type ?? inferTxType(amt, t.source);
    if (type === "conversion") continue;
    if (type === "karyz" || amt < 0) karyz += Math.abs(amt);
    else if (type === "salynghan" || amt > 0) salynghan += amt;
  }
  return { karyz, salynghan, balance, txCount };
}

export function buildClientFxReport(
  contacts: Contact[],
  allTxs: ContactTransaction[],
  options?: { contactId?: string; currencies?: string[] },
): ClientFxRow[] {
  const byContact = new Map<string, ContactTransaction[]>();
  for (const t of allTxs) {
    if (!t.contact_id) continue;
    const list = byContact.get(t.contact_id) ?? [];
    list.push(t);
    byContact.set(t.contact_id, list);
  }

  const currencySet = options?.currencies?.length
    ? new Set(options.currencies)
    : null;

  const rows: ClientFxRow[] = [];
  for (const c of contacts) {
    if (options?.contactId && c.id !== options.contactId) continue;
    const txs = byContact.get(c.id) ?? [];
    const curCodes = new Set(txs.map((t) => t.currency));
    for (const currency of curCodes) {
      if (currencySet && !currencySet.has(currency)) continue;
      const { karyz, salynghan, balance, txCount } = contactKaryzSalynghan(txs, currency);
      if (karyz === 0 && salynghan === 0 && balance === 0) continue;
      rows.push({
        contactId: c.id,
        name: c.name,
        currency,
        karyzTotal: karyz,
        salynghanTotal: salynghan,
        balance,
        txCount,
      });
    }
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function filterContactTxsInPeriod(
  txs: ContactTransaction[],
  fromTs: number,
  toTs: number,
): ContactTransaction[] {
  return txs.filter((t) => {
    const ts = new Date(t.occurred_at).getTime();
    return ts >= fromTs && ts <= toTs;
  });
}

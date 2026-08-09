/**
 * Supabase/PostgREST caps a single request at 1000 rows by default. Any query that
 * needs an ENTIRE table (no .eq/.limit narrowing it below the cap) will silently
 * return a truncated result once the table grows past 1000 rows — with no error,
 * just missing data. `contact_transactions` hit this in production: balance
 * reconciliation (Excel import, contacts list, FX risk/allocation) was computing
 * "current balance" from an incomplete snapshot, posting wrong correction amounts.
 *
 * Page through with .range() instead of a bare .select("*") for any full-table read.
 */
export async function fetchAllRows<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryPage(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

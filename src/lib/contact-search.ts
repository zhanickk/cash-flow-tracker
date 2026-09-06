/**
 * Поиск контакта по имени с учётом отдельных слов.
 *
 * Раньше подсказка сначала искала совпадение по началу ВСЕГО имени и только
 * если не находила ничего — смотрела внутрь строки. Из-за этого «жаркент» не
 * подсказывал «илияс жаркент», пока в справочнике был хоть один контакт на
 * «ж»: первая ветка возвращала его и вторая уже не отрабатывала.
 *
 * Теперь совпадения ранжируются:
 *   0 — имя начинается с запроса        («или» → «илияс жаркент»)
 *   1 — с запроса начинается любое слово («жарк» → «илияс жаркент»)
 *   2 — запрос встречается внутри слова  («аза» → «Б Аза»)
 * Внутри одного ранга выше стоит более короткое имя — оно ближе к точному.
 */
export function searchContactsByName<T extends { name: string }>(
  contacts: T[],
  query: string,
  limit = 8,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: { item: T; rank: number }[] = [];
  for (const c of contacts) {
    const name = c.name.toLowerCase();
    let rank = -1;
    if (name.startsWith(q)) rank = 0;
    else if (name.split(/\s+/).some((w) => w.startsWith(q))) rank = 1;
    else if (name.includes(q)) rank = 2;
    if (rank >= 0) scored.push({ item: c, rank });
  }

  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.item.name.length - b.item.name.length ||
      a.item.name.localeCompare(b.item.name),
  );
  return scored.slice(0, limit).map((s) => s.item);
}

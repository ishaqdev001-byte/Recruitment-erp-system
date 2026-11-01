function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function matchesSearch(query: string, ...values: Array<string | null | undefined>) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const searchableText = normalizeSearchText(values.filter(Boolean).join(" "));
  return normalizedQuery.split(" ").every((term) => searchableText.includes(term));
}

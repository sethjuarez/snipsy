/**
 * Scores how well `text` matches `query`. Every whitespace-separated token in
 * the query must match (word start > substring > in-order letters). Returns
 * null when any token fails to match. Empty queries match everything with 0.
 */
export function matchScore(query: string, text: string): number | null {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const haystack = text.toLowerCase();
  let total = 0;
  for (const token of tokens) {
    const score = tokenScore(token, haystack);
    if (score === null) return null;
    total += score;
  }
  return total;
}

function tokenScore(token: string, haystack: string): number | null {
  const index = haystack.indexOf(token);
  if (index === 0) return 4;
  if (index > 0) return /[\s\-_/:.([]/.test(haystack[index - 1]) ? 3 : 2;
  let position = 0;
  for (const char of token) {
    position = haystack.indexOf(char, position);
    if (position === -1) return null;
    position += 1;
  }
  return 1;
}

export function matchesQuery(query: string, ...fields: Array<string | undefined>): boolean {
  return matchScore(query, fields.filter(Boolean).join(" ")) !== null;
}

/** Filters and ranks items by best match; ties keep their original order. */
export function searchItems<T>(items: readonly T[], query: string, fields: (item: T) => Array<string | undefined>): T[] {
  if (!query.trim()) return [...items];
  return items
    .map((item, index) => ({ item, index, score: matchScore(query, fields(item).filter(Boolean).join(" ")) }))
    .filter((entry): entry is { item: T; index: number; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

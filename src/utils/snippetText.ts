// Mirrors src-tauri/src/snippet_text.rs; both are checked against
// tests/fixtures/image-tokens.json.

export type Segment = { kind: "text"; value: string } | { kind: "image"; value: string };

const OPEN = "{{image:";
const CLOSE = "}}";

export function isImageKey(key: string): boolean {
  if (key.length > 128) return false;
  const match = /^([a-z0-9][a-z0-9-]*)\.(png|jpg|jpeg)$/.exec(key);
  return !!match && !/^(con|prn|aux|nul|com\d|lpt\d)$/.test(match[1]);
}

export function imageToken(key: string): string {
  return `${OPEN}${key}${CLOSE}`;
}

export type ParseResult = { ok: true; segments: Segment[] } | { ok: false; error: string };

/** Anything starting with `{{image:` must be a complete, valid reference. */
export function parseSnippetText(text: string): ParseResult {
  const segments: Segment[] = [];
  let rest = text;
  for (let start = rest.indexOf(OPEN); start !== -1; start = rest.indexOf(OPEN)) {
    if (start > 0) segments.push({ kind: "text", value: rest.slice(0, start) });
    const after = rest.slice(start + OPEN.length);
    const end = after.indexOf(CLOSE);
    if (end === -1) return { ok: false, error: `Unclosed image reference: add ${CLOSE} after ${OPEN}` };
    const key = after.slice(0, end);
    if (!isImageKey(key)) return { ok: false, error: `Invalid image reference: ${OPEN}${key}${CLOSE}` };
    segments.push({ kind: "image", value: key });
    rest = after.slice(end + CLOSE.length);
  }
  if (rest) segments.push({ kind: "text", value: rest });
  return { ok: true, segments };
}

/** Referenced image keys in first-use order; empty when the text does not parse. */
export function referencedImages(text: string): string[] {
  const parsed = parseSnippetText(text);
  if (!parsed.ok) return [];
  return [...new Set(parsed.segments.filter((s) => s.kind === "image").map((s) => s.value))];
}

/** Problems that would stop delivery; null when there are none. */
export function imageRefProblems(
  text: string,
  delivery: string,
  available: ReadonlySet<string> | null,
): string | null {
  const parsed = parseSnippetText(text);
  if (!parsed.ok) return parsed.error;
  const keys = referencedImages(text);
  if (keys.length === 0) return null;
  if (delivery === "paste") return "Images only work with Fast-type delivery.";
  const missing = available ? keys.filter((key) => !available.has(key)) : [];
  return missing.length > 0 ? `Missing ${missing.length === 1 ? "image" : "images"}: ${missing.join(", ")}` : null;
}

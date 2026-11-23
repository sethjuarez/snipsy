// Mirrors src-tauri/src/snippet_text.rs; both are checked against
// tests/fixtures/snippet-tokens.json. The token set is closed and exact:
// anything else (other kinds, whitespace, capitals) is typed as-is.

export type Segment =
  | { kind: "text"; value: string }
  | { kind: "image"; value: string }
  | { kind: "cursor" }
  | { kind: "var"; value: string }
  | { kind: "date"; value: DatePreset }
  | { kind: "time" }
  | { kind: "clipboard" }
  | { kind: "random"; value: number };

export const DATE_PRESETS = ["iso", "short", "long", "us", "eu", "year", "month", "weekday"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];
export const MAX_RANDOM_LENGTH = 64;
/** Token grammar version this build understands; mirrors TOKEN_GRAMMAR in src-tauri/src/models.rs. */
export const TOKEN_GRAMMAR = 1;

const CLOSE = "}}";
const BARE: [string, () => Segment][] = [
  ["{{cursor}}", () => ({ kind: "cursor" })],
  ["{{clipboard}}", () => ({ kind: "clipboard" })],
  ["{{time}}", () => ({ kind: "time" })],
  ["{{date}}", () => ({ kind: "date", value: "short" })],
];
const WITH_ARG = ["image", "var", "date", "random"] as const;

export function isImageKey(key: string): boolean {
  if (key.length > 128) return false;
  const match = /^([a-z0-9][a-z0-9-]*)\.(png|jpg|jpeg)$/.exec(key);
  return !!match && !/^(con|prn|aux|nul|com\d|lpt\d)$/.test(match[1]);
}

export function isVariableName(name: string): boolean {
  return name.length <= 64 && /^[a-z0-9][a-z0-9_-]*$/.test(name);
}

export function imageToken(key: string): string {
  return `{{image:${key}}}`;
}

function randomLength(arg: string): number | null {
  if (!/^[1-9][0-9]?$/.test(arg)) return null;
  const n = Number(arg);
  return n <= MAX_RANDOM_LENGTH ? n : null;
}

function argumentSegment(kind: (typeof WITH_ARG)[number], arg: string): Segment | string {
  const token = `{{${kind}:${arg}}}`;
  switch (kind) {
    case "image":
      return isImageKey(arg) ? { kind: "image", value: arg } : `Invalid image reference: ${token}`;
    case "var":
      return isVariableName(arg)
        ? { kind: "var", value: arg }
        : `Invalid variable reference: ${token} (names use a-z, 0-9, - and _)`;
    case "date":
      return (DATE_PRESETS as readonly string[]).includes(arg)
        ? { kind: "date", value: arg as DatePreset }
        : `Unknown date format: ${token} (use ${DATE_PRESETS.join(", ")})`;
    case "random": {
      const n = randomLength(arg);
      return n === null ? `Invalid random length: ${token} (use 1-${MAX_RANDOM_LENGTH})` : { kind: "random", value: n };
    }
  }
}

export type ParseResult = { ok: true; segments: Segment[] } | { ok: false; error: string };

/** Parses snippet text; with `raw` ("Type literally") the text is one literal run. */
export function parseSnippetText(text: string, raw = false): ParseResult {
  if (raw) return { ok: true, segments: text ? [{ kind: "text", value: text }] : [] };
  const segments: Segment[] = [];
  let literal = "";
  let cursors = 0;
  let i = 0;
  const push = (segment: Segment): string | null => {
    if (segment.kind === "cursor" && ++cursors > 1) return "Only one {{cursor}} is allowed per snippet.";
    if (literal) segments.push({ kind: "text", value: literal });
    literal = "";
    segments.push(segment);
    return null;
  };
  scan: while (i < text.length) {
    if (text.startsWith("{{", i)) {
      for (const [bare, make] of BARE) {
        if (text.startsWith(bare, i)) {
          const error = push(make());
          if (error) return { ok: false, error };
          i += bare.length;
          continue scan;
        }
      }
      for (const kind of WITH_ARG) {
        const prefix = `{{${kind}:`;
        if (!text.startsWith(prefix, i)) continue;
        const start = i + prefix.length;
        const end = text.indexOf(CLOSE, start);
        if (end === -1) return { ok: false, error: `Unclosed ${kind} reference: add ${CLOSE} after ${prefix}` };
        const segment = argumentSegment(kind, text.slice(start, end));
        if (typeof segment === "string") return { ok: false, error: segment };
        const error = push(segment);
        if (error) return { ok: false, error };
        i = end + CLOSE.length;
        continue scan;
      }
    }
    literal += text[i];
    i += 1;
  }
  if (literal) segments.push({ kind: "text", value: literal });
  return { ok: true, segments };
}

/** Referenced image keys in first-use order; empty when the text does not parse. */
export function referencedImages(text: string, raw = false): string[] {
  const parsed = parseSnippetText(text, raw);
  if (!parsed.ok) return [];
  return [...new Set(parsed.segments.flatMap((s) => (s.kind === "image" ? [s.value] : [])))];
}

/** Referenced variable names in first-use order; empty when the text does not parse. */
export function referencedVariables(text: string, raw = false): string[] {
  const parsed = parseSnippetText(text, raw);
  if (!parsed.ok) return [];
  return [...new Set(parsed.segments.flatMap((s) => (s.kind === "var" ? [s.value] : [])))];
}

/** Distinct tokens (other than plain text) as written, for an at-a-glance summary. */
export function recognizedTokens(text: string, raw = false): string[] {
  const parsed = parseSnippetText(text, raw);
  if (!parsed.ok) return [];
  return [...new Set(parsed.segments.flatMap((s) => (s.kind === "text" ? [] : [segmentToken(s)])))];
}

export function segmentToken(segment: Exclude<Segment, { kind: "text" }>): string {
  switch (segment.kind) {
    case "cursor":
    case "time":
    case "clipboard":
      return `{{${segment.kind}}}`;
    case "date":
      return segment.value === "short" ? "{{date}}" : `{{date:${segment.value}}}`;
    default:
      return `{{${segment.kind}:${segment.value}}}`;
  }
}

export interface TokenCheckOptions {
  delivery: string;
  raw?: boolean;
  /** Image keys in the project; null skips the missing-image check. */
  images: ReadonlySet<string> | null;
  /** Variable names defined on the project; null skips the missing-variable check. */
  variables: ReadonlySet<string> | null;
}

/** Problems that would stop delivery; null when there are none. */
export function snippetTextProblems(text: string, options: TokenCheckOptions): string | null {
  const parsed = parseSnippetText(text, options.raw);
  if (!parsed.ok) return parsed.error;
  const cursor = parsed.segments.findIndex((s) => s.kind === "cursor");
  if (cursor !== -1 && parsed.segments.slice(cursor).some((s) => s.kind === "image")) {
    return "{{cursor}} must come after every image.";
  }
  const keys = referencedImages(text, options.raw);
  if (keys.length > 0) {
    if (options.delivery === "paste") return "Images only work with Fast-type delivery.";
    const missing = options.images ? keys.filter((key) => !options.images!.has(key)) : [];
    if (missing.length > 0) return `Missing ${missing.length === 1 ? "image" : "images"}: ${missing.join(", ")}`;
  }
  const names = referencedVariables(text, options.raw);
  const undefinedNames = options.variables ? names.filter((name) => !options.variables!.has(name)) : [];
  if (undefinedNames.length > 0) {
    return `Undefined ${undefinedNames.length === 1 ? "variable" : "variables"}: ${undefinedNames.join(", ")}. Add ${undefinedNames.length === 1 ? "it" : "them"} in Settings → Project.`;
  }
  return null;
}

/** Mirrors the backend check on save: valid, unique names. Returns every problem found. */
export function projectVariableProblems(variables: readonly { name: string }[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const { name } of variables) {
    if (!isVariableName(name)) {
      problems.push(`Invalid variable name "${name}": use a-z, 0-9, - and _, starting with a letter or digit.`);
    } else if (seen.has(name)) {
      problems.push(`Variable "${name}" is defined twice.`);
    }
    seen.add(name);
  }
  return problems;
}

/** Image-only problems; kept for callers that only care about images. */
export function imageRefProblems(
  text: string,
  delivery: string,
  available: ReadonlySet<string> | null,
): string | null {
  return snippetTextProblems(text, { delivery, images: available, variables: null });
}
import type { PauseStop } from "../types";
import { STOP_EPSILON, normalizePauseStops } from "./spotlight";

export type MomentImportMode = "timecodes" | "durations";

/** How a time was written; drives auto-detection of the import mode. */
export type TimeSyntax = "clock" | "frames" | "units" | "iso" | "number";

export type TimeParseResult =
  | { ok: true; seconds: number; syntax: TimeSyntax }
  | { ok: false; error: string };

export interface MomentImportEntry {
  /** 1-based line in the pasted text. */
  line: number;
  source: string;
  seconds?: number;
  syntax?: TimeSyntax;
  /** End of a `start - end` range, when the line was written as one. */
  rangeEnd?: number;
  label?: string;
  error?: string;
}

export type MomentImportRowStatus = "moment" | "info" | "skipped" | "error";

export interface MomentImportRow {
  line: number;
  source: string;
  status: MomentImportRowStatus;
  time?: number;
  label?: string;
  message?: string;
}

export interface MomentImportPlan {
  mode: MomentImportMode;
  rows: MomentImportRow[];
  stops: PauseStop[];
  /** Sum of section lengths (durations mode only). */
  sectionTotal?: number;
  notes: string[];
}

export interface ParseOptions {
  /** Frame rate used for SMPTE `hh:mm:ss:ff` timecodes. */
  fps?: number;
}

const NUMBER = String.raw`\d+(?:[.,]\d+)?|[.,]\d+`;
const ISO_DURATION = new RegExp(
  String.raw`^P(?:T(?:(${NUMBER})H)?(?:(${NUMBER})M)?(?:(${NUMBER})S)?)$`,
  "i",
);
const CLOCK = /^(\d+)(?::(\d{1,2})){1,2}(?:[.,](\d+))?$/;
const FRAMES = /^(\d+):(\d{1,2}):(\d{1,2})[:;.](\d{1,3})$/;
const PLAIN_NUMBER = new RegExp(String.raw`^(?:${NUMBER})$`);
// Longer unit spellings come first so `ms` is not read as minutes and `min` is not read as `m` + junk.
const UNIT_TOKEN = new RegExp(
  String.raw`\s*(?:(?:,|&|\+|and\b)\s*)?(${NUMBER})\s*(milliseconds?|millis|msecs?|ms|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s|['"])(?![a-z])\.?`,
  "iy",
);
const UNIT_RANK: Record<string, number> = { h: 0, m: 1, s: 2, ms: 3 };
const UNIT_SECONDS: Record<string, number> = { h: 3600, m: 60, s: 1, ms: 0.001 };
const LIST_MARKER = /^\s*(?:[-*+•●◦▪‣·–—>]+(?=\s|$)|\(?\d{1,3}[.)](?=\s)|\[[ xX]?\]|#{1,6}(?=\s))\s*/;
const EDGE_SEPARATORS = /^[\s\-–—:|,;.=>→]+|[\s\-–—:|,;=>→]+$/g;
const RANGE_SEPARATOR = /^\s*(?:->|-|–|—|to|→)\s*/i;
// When a larger unit is present, the next one down must stay under this.
const UNIT_LIMIT: Record<string, number> = { m: 60, s: 60, ms: 1000 };

function toNumber(text: string): number {
  return Number(text.replace(",", "."));
}

function canonicalUnit(unit: string): keyof typeof UNIT_RANK {
  const u = unit.toLowerCase();
  if (u === "'") return "m";
  if (u === '"') return "s";
  if (u === "ms" || u.startsWith("milli") || u.startsWith("msec")) return "ms";
  if (u.startsWith("h")) return "h";
  if (u.startsWith("m")) return "m";
  return "s";
}

function normalizeText(text: string): string {
  return text
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[\u2032\u2019\u2018`´]/g, "'")
    .replace(/[\u2033\u201c\u201d]|''/g, '"')
    .replace(/\uff1a/g, ":")
    .trim();
}

function parseUnits(text: string): TimeParseResult | null {
  UNIT_TOKEN.lastIndex = 0;
  let total = 0;
  let lastRank = -1;
  let matched = false;
  while (UNIT_TOKEN.lastIndex < text.length) {
    const start = UNIT_TOKEN.lastIndex;
    const match = UNIT_TOKEN.exec(text);
    if (!match) {
      if (!matched || text.slice(start).trim() !== "") return null;
      break;
    }
    const unit = canonicalUnit(match[2]);
    const rank = UNIT_RANK[unit];
    if (rank <= lastRank) {
      return { ok: false, error: "Units are repeated or out of order (write largest first, e.g. 1 min 3 sec)" };
    }
    const value = toNumber(match[1]);
    if (lastRank >= 0 && value >= UNIT_LIMIT[unit]) {
      return { ok: false, error: `"${match[0].trim()}" is too large after a bigger unit (must be under ${UNIT_LIMIT[unit]})` };
    }
    lastRank = rank;
    total += value * UNIT_SECONDS[unit];
    matched = true;
  }
  return matched ? { ok: true, seconds: total, syntax: "units" } : null;
}

/** Parse one time or duration, e.g. `1:03`, `01:02:03.5`, `1m3s`, `1 minute 3 seconds`, `PT1M3S`, `63`. */
export function parseTimeExpression(input: string, options: ParseOptions = {}): TimeParseResult {
  const text = normalizeText(input)
    .replace(/[.,;]+$/, "")
    .replace(/^[([{]\s*|\s*[)\]}]$/g, "");
  if (!text) return { ok: false, error: "Empty" };
  if (/^[-−]\s*\d/.test(text)) return { ok: false, error: "Negative times aren't allowed" };

  const frames = text.match(FRAMES);
  if (frames && (text.includes(";") || text.split(":").length === 4)) {
    const [, h, m, s, f] = frames.map(Number);
    if (m >= 60 || s >= 60) return { ok: false, error: "Minutes and seconds must be under 60" };
    const fps = options.fps;
    if (!fps || !Number.isFinite(fps) || fps <= 0) {
      return { ok: false, error: "Frame timecodes (hh:mm:ss:ff) need the video's frame rate" };
    }
    if (f >= Math.ceil(fps)) return { ok: false, error: `Frame ${f} is past the ${Math.round(fps)} fps limit` };
    return { ok: true, seconds: h * 3600 + m * 60 + s + f / fps, syntax: "frames" };
  }

  if (CLOCK.test(text)) {
    const [whole, fraction] = text.split(/[.,]/);
    const parts = whole.split(":").map(Number);
    const seconds = parts[parts.length - 1];
    const minutes = parts[parts.length - 2];
    if (seconds >= 60) return { ok: false, error: `Seconds must be under 60 in "${text}"` };
    if (parts.length === 3 && minutes >= 60) return { ok: false, error: `Minutes must be under 60 in "${text}"` };
    const value = parts.reduce((acc, part) => acc * 60 + part, 0) + (fraction ? Number(`0.${fraction}`) : 0);
    return { ok: true, seconds: value, syntax: "clock" };
  }

  const iso = text.match(ISO_DURATION);
  if (iso) {
    const [, h, m, s] = iso;
    if (h === undefined && m === undefined && s === undefined) return { ok: false, error: `"${text}" has no time parts` };
    if ((h !== undefined && m !== undefined && toNumber(m) >= 60) || ((h !== undefined || m !== undefined) && s !== undefined && toNumber(s) >= 60)) {
      return { ok: false, error: `Minutes and seconds must be under 60 in "${text}"` };
    }
    const seconds = (h ? toNumber(h) * 3600 : 0) + (m ? toNumber(m) * 60 : 0) + (s ? toNumber(s) : 0);
    return { ok: true, seconds, syntax: "iso" };
  }

  if (PLAIN_NUMBER.test(text)) return { ok: true, seconds: toNumber(text), syntax: "number" };

  const units = parseUnits(text);
  if (units) return units;

  return { ok: false, error: `Couldn't read "${text}" as a time` };
}

function stripListMarkers(line: string): string {
  let text = line;
  let previous: string;
  do {
    previous = text;
    text = text.replace(LIST_MARKER, "");
  } while (text !== previous);
  return text.trim();
}

function cleanLabel(text: string): string | undefined {
  const label = text.replace(EDGE_SEPARATORS, "").replace(/^["']|["']$/g, "").trim();
  return label || undefined;
}

/** Find a time at the start (YouTube-chapter style) or end (`Intro - 0:29`) of a line. */
function parseLabelledLine(text: string, options: ParseOptions): Omit<MomentImportEntry, "line" | "source"> {
  const whole = parseTimeExpression(text, options);
  if (whole.ok) return { seconds: whole.seconds, syntax: whole.syntax };

  // Give unspaced ranges like `0:00-0:29` word boundaries so the range check can see them.
  const words = text.replace(/(\d)\s*(->|[-–—→])\s*(\d)/g, "$1 $2 $3").split(/\s+/);
  let firstError: string | undefined = whole.error;

  for (let count = words.length - 1; count >= 1; count--) {
    const candidate = words.slice(0, count).join(" ").replace(/[,;:|.]+$/, "");
    const result = parseTimeExpression(candidate, options);
    if (!result.ok) {
      if (count === 1 && /\d/.test(candidate)) firstError = result.error;
      continue;
    }
    let rest = words.slice(count).join(" ");
    let rangeEnd: number | undefined;
    const range = rest.match(RANGE_SEPARATOR);
    if (range) {
      const afterSeparator = rest.slice(range[0].length).split(/\s+/);
      const end = parseTimeExpression((afterSeparator[0] ?? "").replace(/[,;:|.]+$/, ""), options);
      if (end.ok && end.syntax === result.syntax) {
        rangeEnd = end.seconds;
        rest = afterSeparator.slice(1).join(" ");
      }
    }
    return { seconds: result.seconds, syntax: result.syntax, rangeEnd, label: cleanLabel(rest) };
  }

  for (let index = 1; index < words.length; index++) {
    const candidate = words.slice(index).join(" ");
    const result = parseTimeExpression(candidate, options);
    if (result.ok) {
      return { seconds: result.seconds, syntax: result.syntax, label: cleanLabel(words.slice(0, index).join(" ")) };
    }
  }

  return { error: firstError };
}

/** Lines like `0:29, 0:56, 1:37` or `29 27 41` hold several times; `1 min, 3 sec` is one. */
function splitInlineList(text: string, options: ParseOptions): string[] | null {
  if (parseTimeExpression(text, options).ok) return null;
  for (const separator of [/\s*[;,|\t]\s*/, /\s+/]) {
    const pieces = text.split(separator).filter(Boolean);
    if (pieces.length > 1 && pieces.every((piece) => parseTimeExpression(piece, options).ok)) return pieces;
  }
  return null;
}

/** Split pasted text into entries, one per time, keeping labels and flagging unreadable lines. */
export function parseMomentList(text: string, options: ParseOptions = {}): MomentImportEntry[] {
  const entries: MomentImportEntry[] = [];
  text.split(/\r\n|\r|\n/).forEach((rawLine, index) => {
    const line = index + 1;
    const cleaned = stripListMarkers(normalizeText(rawLine));
    if (!cleaned) return;
    const pieces = splitInlineList(cleaned, options);
    if (pieces) {
      for (const piece of pieces) {
        const result = parseTimeExpression(piece, options);
        if (result.ok) entries.push({ line, source: piece, seconds: result.seconds, syntax: result.syntax });
      }
      return;
    }
    entries.push({ line, source: cleaned, ...parseLabelledLine(cleaned, options) });
  });
  return entries;
}

/**
 * Stricter than the dialog parser: decides whether a global Ctrl+V should open the import dialog.
 * A plain number with words around it (`Version 2`) is not enough on its own.
 */
export function looksLikeMomentList(entries: MomentImportEntry[]): boolean {
  if (entries.length === 0) return false;
  const strong = entries.filter(
    (entry) =>
      entry.seconds !== undefined &&
      (entry.syntax !== "number" || entry.label === undefined || entry.rangeEnd !== undefined),
  );
  if (strong.length * 2 < entries.length) return false;
  if (strong.length >= 2) return true;
  return strong.length === 1 && strong[0].syntax !== "number";
}

/** Guess whether a list holds timecodes or section lengths. */
export function detectMomentImportMode(entries: MomentImportEntry[]): MomentImportMode {
  const valid = entries.filter((entry) => entry.seconds !== undefined);
  if (valid.some((entry) => entry.rangeEnd !== undefined)) return "timecodes";
  if (valid.some((entry) => entry.syntax === "units" || entry.syntax === "iso")) return "durations";
  if (valid.length > 0 && valid[0].seconds === 0) return "timecodes";
  for (let index = 1; index < valid.length; index++) {
    if (valid[index].seconds! <= valid[index - 1].seconds!) return "durations";
  }
  return "timecodes";
}

export function formatImportTime(seconds: number): string {
  const rounded = Math.round(seconds * 1000) / 1000;
  const whole = Math.floor(rounded);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const fraction = rounded - whole;
  const fractionText = fraction > 0 ? fraction.toFixed(3).slice(1).replace(/0+$/, "") : "";
  const ss = `${s.toString().padStart(2, "0")}${fractionText}`;
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function errorRow(entry: MomentImportEntry): MomentImportRow {
  return { line: entry.line, source: entry.source, status: "error", message: entry.error ?? "Couldn't read a time" };
}

function planTimecodes(entries: MomentImportEntry[], startTime: number, endTime: number): MomentImportRow[] {
  const accepted: Array<{ time: number; line: number }> = [];
  let previous = -Infinity;
  return entries.map((entry): MomentImportRow => {
    if (entry.seconds === undefined) return errorRow(entry);
    const time = entry.seconds;
    const base = { line: entry.line, source: entry.source, label: entry.label };
    if (Math.abs(time - startTime) <= STOP_EPSILON) {
      return { ...base, status: "info", time, message: "Clip start — playback begins here" };
    }
    if (time < startTime) {
      return { ...base, status: "skipped", time, message: `Before the clip starts (${formatImportTime(startTime)})` };
    }
    if (Math.abs(time - endTime) <= STOP_EPSILON) {
      return { ...base, status: "info", time, message: "Clip end — playback stops here" };
    }
    if (time > endTime) {
      return { ...base, status: "skipped", time, message: `After the clip ends (${formatImportTime(endTime)})` };
    }
    const duplicate = accepted.find((other) => Math.abs(other.time - time) <= STOP_EPSILON);
    if (duplicate) {
      return { ...base, status: "skipped", time, message: `Same time as line ${duplicate.line}` };
    }
    const outOfOrder = time < previous;
    previous = Math.max(previous, time);
    accepted.push({ time, line: entry.line });
    return { ...base, status: "moment", time, message: outOfOrder ? "Out of order — sorted into place" : undefined };
  });
}

function planDurations(
  entries: MomentImportEntry[],
  startTime: number,
  endTime: number,
): { rows: MomentImportRow[]; total: number } {
  const sectionLength = (entry: MomentImportEntry) =>
    entry.seconds === undefined ? NaN : entry.rangeEnd !== undefined ? entry.rangeEnd - entry.seconds : entry.seconds;
  const acceptedIndexes = entries.flatMap((entry, index) => (sectionLength(entry) > 0 ? [index] : []));
  const lastValid = acceptedIndexes[acceptedIndexes.length - 1];
  let cursor = startTime;
  let total = 0;
  const rows = entries.map((entry, index): MomentImportRow => {
    if (entry.seconds === undefined) return errorRow(entry);
    const base = { line: entry.line, source: entry.source, label: entry.label };
    const length = sectionLength(entry);
    if (!(length > 0)) return { ...base, status: "skipped", message: "Section length must be more than 0" };
    cursor += length;
    total += length;
    if (index === lastValid) {
      return { ...base, status: "info", time: cursor, message: "Last section — runs to the clip end" };
    }
    if (cursor >= endTime - STOP_EPSILON) {
      return { ...base, status: "skipped", time: cursor, message: `Ends past the clip end (${formatImportTime(endTime)})` };
    }
    // The moment marks where the next section starts, so it carries that section's label.
    const nextLabel = entries.slice(index + 1).find((next) => sectionLength(next) > 0)?.label;
    return { ...base, status: "moment", time: cursor, label: nextLabel };
  });
  return { rows, total };
}

/** Turn parsed entries into the moments that will replace the clip's current ones. */
export function planMomentImport(
  entries: MomentImportEntry[],
  mode: MomentImportMode,
  startTime: number,
  endTime: number,
): MomentImportPlan {
  const notes: string[] = [];
  let rows: MomentImportRow[];
  let sectionTotal: number | undefined;
  if (mode === "durations") {
    const planned = planDurations(entries, startTime, endTime);
    rows = planned.rows;
    sectionTotal = planned.total;
    const clipLength = endTime - startTime;
    const difference = planned.total - clipLength;
    if (planned.total > 0 && Math.abs(difference) > 0.5) {
      notes.push(
        difference < 0
          ? `Sections add up to ${formatImportTime(planned.total)}, ${formatImportTime(-difference)} shorter than the clip (${formatImportTime(clipLength)}). The last section runs to the clip end.`
          : `Sections add up to ${formatImportTime(planned.total)}, ${formatImportTime(difference)} longer than the clip (${formatImportTime(clipLength)}).`,
      );
    }
  } else {
    rows = planTimecodes(entries, startTime, endTime);
  }
  if (entries.some((entry) => entry.syntax === "frames")) notes.push("Frame timecodes were converted using the video's frame rate.");
  const stops = normalizePauseStops(
    rows.filter((row) => row.status === "moment").map((row) => ({ time: row.time!, label: row.label })),
    startTime,
    endTime,
  );
  return { mode, rows, stops, sectionTotal, notes };
}

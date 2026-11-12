import type { PartialDate } from '@otakuleague/shared-types';

// Source responses are `unknown` until checked field by field: a field that is missing or
// changes type becomes null (or empty), and the rest of the import goes on.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/** A trimmed, non-empty string, or null. */
export function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // Postgres rejects NUL in text columns: one would fail the whole import.
  const trimmed = value.replaceAll('\u0000', '').trim();
  return trimmed === '' ? null : trimmed;
}

export function texts(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(text).filter((item) => item !== null)
    : [];
}

/** A whole number >= min, or null. */
export function integer(value: unknown, min = 0): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min
    ? value
    : null;
}

export function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return allowed.find((candidate) => candidate === value) ?? null;
}

/** An absolute http(s) URL, or null. */
export function httpUrl(value: unknown): string | null {
  const candidate = text(value);
  if (candidate === null || !URL.canParse(candidate)) return null;
  const { protocol } = new URL(candidate);
  return protocol === 'https:' || protocol === 'http:' ? candidate : null;
}

/** { year, month, day } with each part optional except the year. */
export function partialDate(value: unknown): PartialDate | null {
  const parts = record(value);
  const year = integer(parts.year, 1);
  if (year === null) return null;
  const month = integer(parts.month, 1);
  const day = integer(parts.day, 1);
  return {
    year,
    month: month !== null && month <= 12 ? month : null,
    day: day !== null && day <= 31 ? day : null,
  };
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,
    (entity, name: string) => {
      if (name.startsWith('#')) {
        const code =
          name[1]?.toLowerCase() === 'x'
            ? Number.parseInt(name.slice(2), 16)
            : Number.parseInt(name.slice(1), 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
      }
      return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
    },
  );
}

/** Matches SYNOPSIS_MAX_CHARS in apps/web/src/anime/overview-facts.ts. */
const SYNOPSIS_MAX_RAW_CHARS = 20_000;

const BREAK_TAG = /^br\s*\/?$/i;
const PARAGRAPH_END_TAG = /^\/p\s*$/i;
const RAW_TEXT_TAG = /^(script|style)\b/i;

/** Index just past the closing tag of `name` at or after `from`, or -1. */
function rawTextEnd(html: string, name: string, from: number): number {
  const closer = new RegExp(`</${name}\\s*>`, 'gi');
  closer.lastIndex = from;
  const match = closer.exec(html);
  return match === null ? -1 : match.index + match[0].length;
}

/**
 * Drops tags in one left-to-right pass: <br> becomes a line break, </p> a blank line,
 * script and style lose their content, every other tag disappears. A '<' without a '>'
 * stays as text. Linear in the input, whatever it contains.
 */
export function stripTags(html: string): string {
  let out = '';
  let index = 0;
  const noCloserAhead = new Set<string>();
  while (index < html.length) {
    const lt = html.indexOf('<', index);
    if (lt === -1) {
      out += html.slice(index);
      break;
    }
    out += html.slice(index, lt);
    const gt = html.indexOf('>', lt + 1);
    if (gt === -1) {
      out += html.slice(lt);
      break;
    }
    const inner = html.slice(lt + 1, gt);
    index = gt + 1;
    if (BREAK_TAG.test(inner)) {
      out += '\n';
    } else if (PARAGRAPH_END_TAG.test(inner)) {
      out += '\n\n';
    } else {
      const raw = RAW_TEXT_TAG.exec(inner);
      const name = raw?.[1]?.toLowerCase();
      if (name !== undefined && !noCloserAhead.has(name)) {
        const end = rawTextEnd(html, name, gt + 1);
        if (end === -1) noCloserAhead.add(name);
        else index = end;
      }
    }
  }
  return out;
}

/**
 * Source synopses come as HTML (AniList: <br>, <i>, <b>) or plain text (Jikan). We store
 * plain text only: tags dropped, script and style content dropped, entities decoded,
 * paragraphs separated by one blank line. The web app renders it as text, never as HTML.
 * The raw text is cut to 20,000 characters first, before any scan.
 */
export function synopsisText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let raw = value.slice(0, SYNOPSIS_MAX_RAW_CHARS);
  const last = raw.charCodeAt(raw.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) raw = raw.slice(0, -1);
  const plain = decodeEntities(stripTags(raw.replaceAll('\u0000', '')));
  const paragraphs = plain
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .join('\n'),
    )
    .filter((paragraph) => paragraph !== '');
  return paragraphs.length > 0 ? paragraphs.join('\n\n') : null;
}

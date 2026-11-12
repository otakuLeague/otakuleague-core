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

/** "#rrggbb", or null. */
export function hexColor(value: unknown): string | null {
  const color = text(value);
  return color !== null && /^#[0-9a-f]{6}$/i.test(color)
    ? color.toLowerCase()
    : null;
}

/** Postgres int4 maximum: AniList ids are far below it. */
const MAX_ID = 2_147_483_647;

/** An AniList id: 1 to the int4 maximum, or null. */
export function anilistId(value: unknown): number | null {
  const id = integer(value, 1);
  return id !== null && id <= MAX_ID ? id : null;
}

const MAX_TEXT_LENGTH = 300;
export const MAX_GENRES = 20;

/** Third-party text bounded before it is stored: at most 300 characters, no lone surrogates. */
export function boundedText(value: unknown): string | null {
  const trimmed = text(value);
  return trimmed === null
    ? null
    : trimmed.slice(0, MAX_TEXT_LENGTH).replace(/\p{Surrogate}/gu, '\uFFFD');
}

export function boundedTexts(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map(boundedText)
        .filter((item) => item !== null)
        .slice(0, MAX_GENRES)
    : [];
}

/** An https URL on anilist.co or one of its subdomains (its CDN), or null. */
export function anilistImageUrl(value: unknown): string | null {
  const url = httpUrl(value);
  if (url === null) return null;
  const { protocol, hostname } = new URL(url);
  return protocol === 'https:' &&
    (hostname === 'anilist.co' || hostname.endsWith('.anilist.co'))
    ? url
    : null;
}

/** A score out of 100 above zero (0 is AniList's "unrated"), or null. */
export function percentScore(value: unknown): number | null {
  const score = finite(value);
  return score !== null && score > 0 && score <= 100 ? score : null;
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

/**
 * Source synopses come as HTML (AniList: <br>, <i>, <b>) or plain text (Jikan). We store
 * plain text only: tags dropped, script and style content dropped, entities decoded,
 * paragraphs separated by one blank line. The web app renders it as text, never as HTML.
 */
export function synopsisText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const plain = decodeEntities(
    value
      .replaceAll('\u0000', '')
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n\n')
      .replace(/<[^>]*>/g, ''),
  );
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

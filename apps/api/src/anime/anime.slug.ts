import type { AnimeFormat } from '@otakuleague/shared-types';

/** Slug rules (ADR 0007). Pure: claiming them in the database is the importer's job. */

export const MAX_SLUG_LENGTH = 80;

/** Siblings of the slug under /anime/, now or planned. Reserving later cannot free a claimed slug. */
const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'anilist',
  'myanimelist',
  'search',
  'new',
]);

/**
 * Characters that carry meaning (HUNTER×HUNTER), would split a word (JoJo's), or are Latin
 * letters NFKD does not decompose (Weiß).
 */
const SYMBOLS: Readonly<Record<string, string>> = {
  '×': ' x ',
  '&': ' and ',
  "'": '',
  '’': '',
  '°': '',
  ß: 'ss',
  æ: 'ae',
  Æ: 'ae',
  œ: 'oe',
  Œ: 'oe',
  ø: 'o',
  Ø: 'o',
  ł: 'l',
  Ł: 'l',
  đ: 'd',
  Đ: 'd',
};

/** What a slug is built from: the AniList snapshot only, never the merged anime. */
export interface SlugSource {
  readonly anilistId: number;
  readonly titleEnglish: string | null;
  readonly titleRomaji: string | null;
  readonly year: number | null;
  readonly format: AnimeFormat | null;
}

/** Lowercase ASCII words joined by single hyphens; empty when the title has no Latin letter or digit. */
export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[×&'’°ßæÆœŒøØłŁđĐ]/g, (symbol) => SYMBOLS[symbol] ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** base + suffix within MAX_SLUG_LENGTH, cutting the base on a hyphen when it has one. */
function fit(base: string, suffix: string): string {
  const room = MAX_SLUG_LENGTH - suffix.length;
  if (base.length <= room) return base + suffix;
  const cut = base.slice(0, room);
  const hyphen = cut.lastIndexOf('-');
  const word = base[room] === '-' || hyphen <= 0 ? cut : cut.slice(0, hyphen);
  return word.replace(/-+$/, '') + suffix;
}

/**
 * Canonical slugs to try, best first: base, base-year, base-year-format, base-anilistId.
 * A rung whose value is missing is skipped; reserved words never appear.
 */
export function canonicalCandidates(source: SlugSource): string[] {
  const base =
    slugify(source.titleEnglish ?? '') ||
    slugify(source.titleRomaji ?? '') ||
    `anime-${source.anilistId}`;
  const year = source.year === null ? '' : `-${source.year}`;
  const format = source.format?.toLowerCase().replaceAll('_', '-');
  const suffixes = [
    '',
    year,
    format === undefined ? '' : `${year}-${format}`,
    `-${source.anilistId}`,
  ];
  const slugs = suffixes.map((suffix) => fit(base, suffix));
  return [...new Set(slugs)].filter((slug) => !RESERVED_SLUGS.has(slug));
}

/** The romaji slug, which redirects to the canonical one; null when it has nothing usable. */
export function romajiAlias(source: SlugSource): string | null {
  const slug = fit(slugify(source.titleRomaji ?? ''), '');
  return slug === '' || RESERVED_SLUGS.has(slug) ? null : slug;
}

/** The slug inputs from an AniList title and date set: English, else romaji; start year, else season year. */
export function slugSource(
  anilistId: number,
  fields: {
    readonly titleEnglish: string | null;
    readonly titleRomaji: string | null;
    readonly startDate: { readonly year: number | null } | null;
    readonly seasonYear: number | null;
    readonly format: AnimeFormat | null;
  },
): SlugSource {
  return {
    anilistId,
    titleEnglish: fields.titleEnglish,
    titleRomaji: fields.titleRomaji,
    year: fields.startDate?.year ?? fields.seasonYear,
    format: fields.format,
  };
}

/** The first candidate that is free or already this anime's; undefined when every rung is taken. */
export function pickCanonical(
  candidates: readonly string[],
  owners: ReadonlyMap<string, number>,
  anilistId: number,
): string | undefined {
  return candidates.find((candidate) => {
    const holder = owners.get(candidate);
    return holder === undefined || holder === anilistId;
  });
}

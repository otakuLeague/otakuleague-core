import type { AnimeDetails } from '@otakuleague/shared-types';
import { animeTitle } from './format';

const GENRES_MAX = 20;
const TAGS_MAX = 30;
/** AniList ranks how relevant a tag is (0-100); below this it is noise. */
export const TAG_RANK_MIN = 60;
const ALT_TITLES_MAX = 12;
/** Longer names are source errors, never shown. */
export const NAME_MAX_CHARS = 60;
const TITLE_MAX_CHARS = 200;

export interface ThemeTag {
  readonly name: string;
  /** 60-100: how relevant the tag is. */
  readonly rank: number;
}

export interface OverviewThemes {
  readonly genres: readonly string[];
  /** Most relevant first. */
  readonly open: readonly ThemeTag[];
  /** Hidden until the visitor asks for them; most relevant first. */
  readonly spoilers: readonly ThemeTag[];
}

export type AltTitleKind = 'romaji' | 'english' | 'native' | 'synonym';

export interface AltTitleGroup {
  readonly kind: AltTitleKind;
  readonly label: string;
  readonly texts: readonly string[];
}

const ALT_TITLE_LABELS: Readonly<Record<AltTitleKind, string>> = {
  romaji: 'Romaji',
  english: 'English',
  native: 'Native',
  synonym: 'Also known as',
};

const BIDI_CONTROLS = /[‪-‮⁦-⁩]/gu;
const INVISIBLE_ONLY = /^[\p{Cf}\s]*$/u;

/**
 * Source text fit to show: trimmed, without bidi embedding or isolate controls; null when it
 * is empty, invisible (format characters and spaces only) or longer than `max`.
 */
export function displayText(raw: string, max: number): string | null {
  const text = raw.replace(BIDI_CONTROLS, '').trim();
  return INVISIBLE_ONLY.test(text) || text.length > max ? null : text;
}

/** Lower-case NFKC with collapsed whitespace: "Ｓｈｉｎｇｅｋｉ  no" equals "shingeki no". */
function comparable(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

function genresOf(anime: AnimeDetails): readonly string[] {
  const seen = new Set<string>();
  return (anime.genres?.value ?? [])
    .flatMap((raw) => {
      const genre = displayText(raw, NAME_MAX_CHARS);
      if (genre === null || seen.has(comparable(genre))) return [];
      seen.add(comparable(genre));
      return [genre];
    })
    .slice(0, GENRES_MAX);
}

interface RankedTag extends ThemeTag {
  readonly key: string;
  readonly spoiler: boolean;
}

export function themesOf(anime: AnimeDetails): OverviewThemes {
  const genres = genresOf(anime);
  const genreKeys = new Set(genres.map(comparable));
  const ranked = (anime.tags?.value ?? [])
    .flatMap((tag): RankedTag[] => {
      const name = displayText(tag.name, NAME_MAX_CHARS);
      const { rank } = tag;
      if (name === null || rank === null || !Number.isFinite(rank)) return [];
      if (rank < TAG_RANK_MIN || genreKeys.has(comparable(name))) return [];
      return [
        {
          name,
          key: comparable(name),
          rank: Math.min(100, Math.round(rank)),
          spoiler: tag.spoiler,
        },
      ];
    })
    .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name, 'en'));
  // The best-ranked copy keeps its place; a spoiler flag on any copy wins.
  const spoilerKeys = new Set(
    ranked.filter((tag) => tag.spoiler).map((tag) => tag.key),
  );
  const seen = new Set<string>();
  const tags = ranked
    .flatMap((tag) => {
      if (seen.has(tag.key)) return [];
      seen.add(tag.key);
      return [tag];
    })
    .slice(0, TAGS_MAX);
  const plain = ({ name, rank }: RankedTag): ThemeTag => ({ name, rank });
  return {
    genres,
    open: tags.filter((tag) => !spoilerKeys.has(tag.key)).map(plain),
    spoilers: tags.filter((tag) => spoilerKeys.has(tag.key)).map(plain),
  };
}

/**
 * Every title but the one the page shows, then synonyms, each text once, grouped by kind. The
 * header subtitle already shows native and romaji; they are kept here too, labelled.
 */
export function altTitlesOf(anime: AnimeDetails): readonly AltTitleGroup[] {
  const seen = new Set([comparable(animeTitle(anime))]);
  const candidates: readonly (readonly [AltTitleKind, string])[] = [
    ['romaji', anime.titleRomaji?.value ?? ''],
    ['english', anime.titleEnglish?.value ?? ''],
    ['native', anime.titleNative?.value ?? ''],
    ...(anime.synonyms?.value ?? []).map((text) => ['synonym', text] as const),
  ];
  const titles = candidates
    .flatMap(([kind, raw]) => {
      const text = displayText(raw, TITLE_MAX_CHARS);
      if (text === null || seen.has(comparable(text))) return [];
      seen.add(comparable(text));
      return [{ kind, text }];
    })
    .slice(0, ALT_TITLES_MAX);
  return (Object.keys(ALT_TITLE_LABELS) as AltTitleKind[]).flatMap((kind) => {
    const texts = titles
      .filter((title) => title.kind === kind)
      .map((title) => title.text);
    return texts.length === 0
      ? []
      : [{ kind, label: ALT_TITLE_LABELS[kind], texts }];
  });
}

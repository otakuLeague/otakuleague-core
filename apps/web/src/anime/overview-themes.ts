import type { AnimeDetails } from '@otakuleague/shared-types';
import { animeTitle } from './format';

const GENRES_MAX = 20;
const TAGS_MAX = 30;
/** AniList ranks how relevant a tag is (0-100); below this it is noise. */
export const TAG_RANK_MIN = 60;
const ALT_TITLES_MAX = 12;

export interface ThemeTag {
  readonly name: string;
  /** 60-100: how relevant the tag is. */
  readonly rank: number;
  /** A spoiler tag stays hidden until the visitor asks for it. */
  readonly visibility: 'open' | 'spoiler';
}

export interface OverviewThemes {
  readonly genres: readonly string[];
  /** Most relevant first. */
  readonly tags: readonly ThemeTag[];
}

export interface AltTitle {
  readonly kind: 'romaji' | 'english' | 'native' | 'synonym';
  readonly text: string;
}

/** Lower-case NFKC with collapsed whitespace: "Ｓｈｉｎｇｅｋｉ  no" equals "shingeki no". */
function comparable(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

export function themesOf(anime: AnimeDetails): OverviewThemes {
  const genres = [
    ...new Set((anime.genres?.value ?? []).map((genre) => genre.trim())),
  ]
    .filter((genre) => genre !== '')
    .slice(0, GENRES_MAX);
  const genreKeys = new Set(genres.map(comparable));
  const seen = new Set<string>();
  const tags = (anime.tags?.value ?? [])
    .flatMap((tag): ThemeTag[] => {
      const name = tag.name.trim();
      const key = comparable(name);
      const { rank } = tag;
      if (
        rank === null ||
        !Number.isFinite(rank) ||
        rank < TAG_RANK_MIN ||
        key === '' ||
        genreKeys.has(key) ||
        seen.has(key)
      ) {
        return [];
      }
      seen.add(key);
      return [
        {
          name,
          rank: Math.min(100, Math.round(rank)),
          visibility: tag.spoiler ? 'spoiler' : 'open',
        },
      ];
    })
    .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name, 'en'))
    .slice(0, TAGS_MAX);
  return { genres, tags };
}

/** The titles the page does not already show, then synonyms; each text once. */
export function altTitlesOf(anime: AnimeDetails): readonly AltTitle[] {
  const seen = new Set([comparable(animeTitle(anime))]);
  const candidates: readonly AltTitle[] = [
    { kind: 'romaji', text: anime.titleRomaji?.value ?? '' },
    { kind: 'english', text: anime.titleEnglish?.value ?? '' },
    { kind: 'native', text: anime.titleNative?.value ?? '' },
    ...(anime.synonyms?.value ?? []).map((text): AltTitle => ({
      kind: 'synonym',
      text,
    })),
  ];
  return candidates
    .flatMap((title): AltTitle[] => {
      const text = title.text.trim();
      const key = comparable(text);
      if (key === '' || seen.has(key)) return [];
      seen.add(key);
      return [{ kind: title.kind, text }];
    })
    .slice(0, ALT_TITLES_MAX);
}

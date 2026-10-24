import type { AnimeDetails } from '@otakuleague/shared-types';

/** English, else romaji, else native: the name the page shows (OTA-97). */
export function animeTitle(anime: AnimeDetails): string {
  return (
    anime.titleEnglish?.value ??
    anime.titleRomaji?.value ??
    anime.titleNative?.value ??
    'Untitled anime'
  );
}

/** The synopsis's first paragraph, cut on a word under `max` characters, for link previews. */
export function excerpt(
  text: string | undefined,
  max = 200,
): string | undefined {
  const first = text?.split(/\n\s*\n/)[0]?.trim();
  if (first === undefined || first === '') return undefined;
  if (first.length <= max) return first;
  const cut = first.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

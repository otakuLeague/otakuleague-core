import type { AnimeListCard } from '@otakuleague/shared-types';

/** Only an absolute https URL is rendered; anything else leaves the empty cover frame. */
export function coverSrc(entry: Pick<AnimeListCard, 'coverImageUrl'>): string | null {
  if (entry.coverImageUrl === null || !URL.canParse(entry.coverImageUrl)) {
    return null;
  }
  return new URL(entry.coverImageUrl).protocol === 'https:'
    ? entry.coverImageUrl
    : null;
}

function presentTitle(title: string | null): string | null {
  return title === null || title.trim() === '' ? null : title;
}

export function cardTitle(
  entry: Pick<AnimeListCard, 'titleEnglish' | 'titleRomaji'>,
): string {
  return (
    presentTitle(entry.titleEnglish) ??
    presentTitle(entry.titleRomaji) ??
    'Untitled'
  );
}

import type { AnimeListCard } from '@otakuleague/shared-types';
import { imageSrc } from '../anime/image-src';

/** Only a canonical https URL is rendered; anything else leaves the empty cover frame. */
export function coverSrc(
  entry: Pick<AnimeListCard, 'coverImageUrl'>,
): string | null {
  return imageSrc(entry.coverImageUrl);
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

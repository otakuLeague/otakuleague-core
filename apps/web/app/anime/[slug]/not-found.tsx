import type { Metadata } from 'next';
import { AnimeNotFoundView } from '../../../src/anime/not-found-view';

export const metadata: Metadata = { title: 'Anime not found' };

/** When the proxy let a request through (API slow) and the page found no anime itself. */
export default function AnimeNotFound() {
  return <AnimeNotFoundView />;
}

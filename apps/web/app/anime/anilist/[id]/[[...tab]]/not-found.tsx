import type { Metadata } from 'next';
import { AnimeNotFoundView } from '../../../../../src/anime/not-found-view';
import '../../../[slug]/anime-page.css';

export const metadata: Metadata = { title: 'Anime not found' };

export default function AnilistIdNotFound() {
  return <AnimeNotFoundView />;
}

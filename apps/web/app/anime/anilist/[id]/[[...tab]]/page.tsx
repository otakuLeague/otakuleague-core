import type { Metadata } from 'next';
import { seasonRedirect } from '../../../../../src/anime/season-redirect';

// No robots key here (the root layout owns it): the X-Robots-Tag header keeps it noindex.
export const metadata: Metadata = { title: 'Opening anime…' };

export default async function AnilistIdPage({
  params,
}: {
  readonly params: Promise<{ id: string; tab?: string[] }>;
}) {
  const { id, tab } = await params;
  return seasonRedirect(id, tab);
}

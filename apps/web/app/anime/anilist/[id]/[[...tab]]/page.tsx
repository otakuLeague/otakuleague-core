import type { Metadata } from 'next';
import { seasonRedirect } from '../../../../../src/anime/season-redirect';
import { ImportBusyState } from '../../../[slug]/header';
import '../../../[slug]/anime-page.css';

// No robots key here (the root layout owns it): the X-Robots-Tag header keeps it noindex.
export const metadata: Metadata = { title: 'Opening anime…' };

export default async function AnilistIdPage({
  params,
}: {
  readonly params: Promise<{ id: string; tab?: string[] }>;
}) {
  const { id, tab } = await params;
  await seasonRedirect(id, tab);
  // Only reached when the import cap is hit: every other outcome redirects or throws.
  return (
    <main className="ol-root anime-page">
      <ImportBusyState />
    </main>
  );
}

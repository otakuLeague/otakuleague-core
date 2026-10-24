'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ANIME_TABS, tabHref } from '../../../src/anime/tabs';

/** The seven tabs as links (each its own route); the open one is marked aria-current="page". */
export function TabsNav({ slug }: { readonly slug: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Anime sections" className="ol-tabs">
      {ANIME_TABS.map((tab) => {
        const href = tabHref(slug, tab.segment);
        return (
          <Link
            key={tab.segment}
            href={href}
            className="ol-tab"
            aria-current={pathname === href ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ANIME_TABS, tabHref } from '../../../src/anime/tabs';

/**
 * The seven tabs as links (each its own route); the open one is marked aria-current="page".
 * `pills` is the sticky bar's compact version.
 */
export function TabsNav({
  slug,
  variant = 'tabs',
}: {
  readonly slug: string;
  readonly variant?: 'tabs' | 'pills';
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={
        variant === 'tabs' ? 'Anime sections' : 'Anime sections, sticky bar'
      }
      className={variant === 'tabs' ? 'ol-tabs' : 'anime-pills'}
    >
      {ANIME_TABS.map((tab) => {
        const href = tabHref(slug, tab.segment);
        return (
          <Link
            key={tab.segment}
            href={href}
            className={variant === 'tabs' ? 'ol-tab' : 'anime-pill'}
            aria-current={pathname === href ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

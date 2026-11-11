/** The header's sections (design docs/design/global-shell/motion.md, "Active section"). */
export type NavSection = 'discover' | 'season' | 'rankings' | 'leaderboard';

export type NavLink = {
  readonly href: string;
  readonly label: string;
  readonly section: NavSection;
};

export type DiscoverLink = {
  readonly href: string;
  readonly label: string;
  readonly hint: string;
  readonly icon: string;
};

/** The four lists of the old Discover dropdown (PARITY.md §1). */
export const DISCOVER_LINKS: readonly DiscoverLink[] = [
  {
    href: '/discover/airing',
    label: 'Top airing',
    hint: 'Most watched this week',
    icon: '●',
  },
  {
    href: '/discover/upcoming',
    label: 'Top upcoming',
    hint: 'Announced, not aired yet',
    icon: '◷',
  },
  {
    href: '/discover/completed',
    label: 'Recently completed',
    hint: 'Finished in the last 3 months',
    icon: '✓',
  },
  {
    href: '/discover/episodes',
    label: 'Latest episodes',
    hint: 'Released in the last 48 h',
    icon: '▶',
  },
];

export const MAIN_LINKS: readonly NavLink[] = [
  { href: '/season', label: 'Seasonal', section: 'season' },
  { href: '/top/anime', label: 'Rankings', section: 'rankings' },
  { href: '/leaderboard', label: 'Leaderboard', section: 'leaderboard' },
];

const SECTION_PREFIXES: readonly (readonly [NavSection, string])[] = [
  ['discover', '/discover'],
  ['season', '/season'],
  ['rankings', '/top'],
  ['leaderboard', '/leaderboard'],
];

/** True for `prefix` itself and any path below it, by whole segments (`/season/x`, not `/seasonx`). */
export function isWithin(pathname: string | null, prefix: string): boolean {
  if (pathname === null) return false;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** The section the path belongs to, or null (home, anime pages, or a prerender without a path). */
export function activeSection(pathname: string | null): NavSection | null {
  const match = SECTION_PREFIXES.find(([, prefix]) =>
    isWithin(pathname, prefix),
  );
  return match === undefined ? null : match[0];
}

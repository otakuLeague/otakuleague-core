import type { SeasonKey } from '../../../src/anime/header-facts';

/** The anime header's icons, drawn from docs/design/anime-page (decorative: aria-hidden). */

const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

const SEASON_PATHS: Record<SeasonKey, readonly string[]> = {
  spring: [
    'M12 21V11',
    'M12 11C12 7 9 5 5 5c0 4 3 6 7 6z',
    'M12 13c0-4 3-6 7-6 0 4-3 6-7 6z',
  ],
  summer: [
    'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
    'M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  ],
  fall: ['M12 22v-6', 'M12 16l-6-3 2-2-4-4 4 0 1-3 3 4 3-4 1 3 4 0-4 4 2 2z'],
  winter: ['M12 2v20M4 6l16 12M20 6L4 18M9 3l3 3 3-3M9 21l3-3 3 3'],
};

export function SeasonIcon({
  season,
  size = 15,
}: {
  readonly season: SeasonKey;
  readonly size?: number;
}) {
  return (
    <svg width={size} height={size} {...stroke}>
      {SEASON_PATHS[season].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export function FormatIcon() {
  return (
    <svg width={15} height={15} {...stroke}>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function HeartIcon({ size = 16 }: { readonly size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 21s-7.5-4.6-9.5-9.2C1 8 3.4 4.5 7 4.5c2 0 3.5 1 5 2.8 1.5-1.8 3-2.8 5-2.8 3.6 0 6 3.5 4.5 7.3C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

export function PlusIcon({ size = 16 }: { readonly size?: number }) {
  return (
    <svg width={size} height={size} {...stroke} strokeWidth={2.6}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function StarIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
    </svg>
  );
}

export function MembersIcon() {
  return (
    <svg width={14} height={14} {...stroke}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14c3 0 5 2.2 5 5" />
    </svg>
  );
}

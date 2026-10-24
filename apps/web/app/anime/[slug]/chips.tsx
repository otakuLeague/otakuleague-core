import type { HeaderFacts } from '../../../src/anime/header-facts';
import { SeasonIcon } from './icons';

/** Status and season chips, coloured by the --status-* and --season-* tokens; `mini` in the sticky bar. */

type Size = 'full' | 'mini';

export function StatusChip({
  status,
  size = 'full',
}: {
  readonly status: NonNullable<HeaderFacts['status']>;
  readonly size?: Size;
}) {
  return (
    <span
      className={`anime-chip anime-chip--${size} anime-chip--tinted`}
      style={
        { '--chip-color': `var(--status-${status.key})` } as React.CSSProperties
      }
    >
      {size === 'full' && (
        <span
          className={
            status.key === 'airing'
              ? 'anime-chip__dot anime-chip__dot--pulse'
              : 'anime-chip__dot'
          }
          aria-hidden="true"
        />
      )}
      {status.label}
    </span>
  );
}

export function SeasonChip({
  season,
  size = 'full',
}: {
  readonly season: NonNullable<HeaderFacts['season']>;
  readonly size?: Size;
}) {
  const style = {
    '--chip-color': `var(--season-${season.key})`,
  } as React.CSSProperties;
  if (size === 'mini') {
    return (
      <span
        className="anime-chip anime-chip--mini anime-chip--tinted"
        style={style}
      >
        {season.label}
      </span>
    );
  }
  // Season pages come later: a link to # for now, like the credits.
  return (
    <a
      href="#"
      className="anime-chip anime-chip--full anime-chip--tinted"
      style={style}
    >
      <SeasonIcon season={season.key} />
      {season.label}
    </a>
  );
}

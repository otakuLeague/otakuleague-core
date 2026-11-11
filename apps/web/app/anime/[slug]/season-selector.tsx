'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  type FocusEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  type SeasonOption,
  tabHref,
  tabSegmentOf,
} from '../../../src/anime/tabs';

function seasonNote(season: SeasonOption): string {
  const year = season.year === null ? '' : String(season.year);
  if (!season.upcoming) return year;
  return year === '' ? 'Upcoming' : `${year} · Upcoming`;
}

/** Spelled out: the label and year run together in the visible text. */
function triggerName(current: SeasonOption | undefined): string {
  if (current === undefined) return 'Seasons';
  const year = current.year === null ? '' : `, ${current.year}`;
  return `Season: ${current.label}${year}`;
}

/**
 * The franchise's main line (OTA-97), as a disclosure of links rather than a listbox: each
 * season is a page, opened on the tab the visitor is on. No animation: it opens in place.
 */
export function SeasonSelector({
  slug,
  seasons,
}: {
  readonly slug: string;
  readonly seasons: readonly SeasonOption[];
}) {
  const segment = tabSegmentOf(usePathname(), slug);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const current = seasons.find((season) => season.isCurrent);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !open) return;
    setOpen(false);
    triggerRef.current?.focus();
  };
  const closeOnFocusOut = (event: FocusEvent) => {
    if (!(event.relatedTarget instanceof Node)) return;
    if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className="ol-season anime-season"
      onKeyDown={closeOnEscape}
      onBlur={closeOnFocusOut}
    >
      <button
        ref={triggerRef}
        type="button"
        className="ol-season__trigger"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={triggerName(current)}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {current?.label ?? 'Seasons'}
        {current !== undefined && current.year !== null && (
          <span className="ol-season__year">{current.year}</span>
        )}
        <span className="ol-season__chev" aria-hidden="true" />
      </button>
      <nav
        id={menuId}
        aria-label="Seasons"
        className="anime-season__menu"
        hidden={!open}
      >
        <ul className="ol-season__list">
          {seasons.map((season) => {
            const className = `ol-season__item${season.upcoming ? ' ol-season__item--upcoming' : ''}`;
            const content = (
              <>
                <span className="ol-season__dot" aria-hidden="true" />
                {season.label}
                <small>{seasonNote(season)}</small>
              </>
            );
            return (
              <li key={season.anilistId}>
                {season.slug === null ? (
                  // Not imported yet, so no page to open: listed, not linked.
                  <span
                    className={`${className} anime-season__unlinked`}
                    aria-disabled="true"
                  >
                    {content}
                  </span>
                ) : (
                  <Link
                    href={tabHref(season.slug, segment)}
                    prefetch={false}
                    aria-current={season.isCurrent ? 'true' : undefined}
                    className={className}
                    onClick={() => setOpen(false)}
                  >
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

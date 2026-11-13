'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type FocusEvent, useEffect, useId, useRef, useState } from 'react';
import { animeLink } from '../../../src/anime/anime-link';
import { type SeasonOption, tabSegmentOf } from '../../../src/anime/tabs';

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

  // Safari never focuses a clicked link: the trigger blurs with no relatedTarget before the
  // click lands, so a press inside must not count as focus leaving.
  const pressInsideRef = useRef(false);

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
    const endPress = () => {
      pressInsideRef.current = false;
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('pointerup', endPress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('pointerup', endPress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const closeOnFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    if (next === null && pressInsideRef.current) return;
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className="ol-season anime-season"
      onPointerDown={() => {
        pressInsideRef.current = true;
      }}
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
            const note = seasonNote(season);
            // Imported: its slug page. Otherwise (a slug alone is only claimed) the nofollow id
            // route, which imports it and redirects on the same tab.
            const { href, rel } = animeLink(season, segment);
            const content = (
              <>
                <span className="ol-season__dot" aria-hidden="true" />
                {season.label}
                {note !== '' && <small>{note}</small>}
              </>
            );
            return (
              <li key={season.anilistId}>
                <Link
                  href={href}
                  prefetch={false}
                  rel={rel}
                  aria-current={season.isCurrent ? 'true' : undefined}
                  className={className}
                  onClick={() => setOpen(false)}
                >
                  {content}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

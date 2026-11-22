'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { OverviewTrailer } from '../../../src/anime/trailer';

/** The press moves focus to the player. */
function focusOnMount(frame: HTMLIFrameElement | null) {
  frame?.focus();
}

/** `replace` (allowed cross-origin) blanks the player without adding a history entry. */
function stopPlayer(frame: HTMLIFrameElement) {
  frame.contentWindow?.location.replace('about:blank');
}

/**
 * Trailer facade: a poster and a play button. Nothing from the video host (iframe, script,
 * preconnect) loads until the press; the iframe then takes the same 16:9 box, so nothing shifts.
 * The swap is instant (no animation), so reduced motion needs nothing extra. Leaving the page
 * (unmount or a hidden Activity) stops the player and puts the poster back.
 */
export function TrailerPlayer({
  trailer,
  title,
}: {
  readonly trailer: OverviewTrailer;
  readonly title: string;
}) {
  const [state, setState] = useState<'poster' | 'playing'>('poster');
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  /** Stable, so React calls it once when the iframe mounts. */
  const attachFrame = useCallback((frame: HTMLIFrameElement | null) => {
    frameRef.current = frame;
    focusOnMount(frame);
  }, []);
  useEffect(() => {
    if (state !== 'playing') return;
    const frame = frameRef.current;
    if (frame === null) return; // Never null while playing: narrows the type only.
    // Syncs with the iframe: cacheComponents keeps a left page's DOM in a hidden <Activity>, so stop it here.
    return () => {
      stopPlayer(frame);
      setState('poster');
    };
  }, [state]);
  return (
    <div className="ov-trailer" data-state={state}>
      {state === 'playing' ? (
        <iframe
          ref={attachFrame}
          className="ov-trailer__frame"
          src={trailer.embedUrl}
          title={`Trailer: ${title} (${trailer.siteLabel})`}
          allow="autoplay; fullscreen; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button
          type="button"
          className="ov-trailer__frame ov-trailer__poster"
          onClick={() => setState('playing')}
        >
          {trailer.poster.kind === 'image' && (
            <Image
              src={trailer.poster.url}
              alt=""
              fill
              sizes="(max-width: 900px) 100vw, 840px"
            />
          )}
          {/* The accessible name starts with the visible label (WCAG 2.5.3). */}
          <span className="ov-trailer__play">
            <span className="ov-trailer__badge" aria-hidden="true">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </span>
            <span className="ov-trailer__label">
              Play trailer{' '}
              <span className="anime-sr-only">({trailer.siteLabel})</span>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

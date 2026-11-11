'use client';

import { useSyncExternalStore } from 'react';
import { countdown } from '../../../src/anime/header-facts';

function subscribeToSeconds(onTick: () => void): () => void {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
}

/** Whole seconds, so the snapshot only changes once a second. */
const nowInSeconds = () => Math.floor(Date.now() / 1000) * 1000;
/** The visitor's locale and current time zone (built per tick: the zone can change). */
function formatLocalTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso));
}

/** On the server and during hydration there is no visitor clock: render no time yet. */
const noClock = () => null;

/**
 * Live countdown to the next episode, ticking each second in the browser; the airing time, in
 * the visitor's time zone, is in the tooltip. At zero it reads "Episode N aired".
 */
export function Countdown({
  episode,
  airingAt,
}: {
  readonly episode: number;
  readonly airingAt: string;
}) {
  const now = useSyncExternalStore(subscribeToSeconds, nowInSeconds, noClock);
  const left = now === null ? undefined : countdown(airingAt, now);
  if (left === null) {
    return (
      <p className="anime-countdown anime-countdown--aired" role="status">
        Episode {episode} aired
      </p>
    );
  }
  const localTime = now === null ? undefined : formatLocalTime(airingAt);
  return (
    <div className="anime-countdown" role="timer" title={localTime}>
      <span className="ol-label">Next episode</span>
      <time className="ol-num" dateTime={airingAt}>
        Ep {episode}
        {left !== undefined && ` · ${left}`}
      </time>
    </div>
  );
}

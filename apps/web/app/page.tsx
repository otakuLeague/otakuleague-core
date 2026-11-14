import type { Metadata } from 'next';
import Link from 'next/link';
import { HOME_ROWS } from '../src/home/home-rows';
import { HomeRow } from './home-row';
import './styles/browse.css';
import './styles/home.css';

export const metadata: Metadata = { alternates: { canonical: '/' } };

// Static hero (the LCP h1 ships with the prerendered shell); each row streams on its own (ADR 0003).
export default function Home() {
  return (
    <main className="hm-page">
      <header className="hm-copy">
        <p className="hm-eyebrow">Your anime HQ</p>
        <h1 className="hm-h1">
          <span>Track every anime.</span> <span>Earn XP.</span>{' '}
          <span className="hm-grad">Top the season.</span>
        </h1>
        <p className="hm-lede">
          Anime pages, seasonal charts and rankings, your watchlist, and XP for
          everything you add, finish and rate. Every season ends with a
          leaderboard.
        </p>
        <div className="hm-ctas">
          <Link
            className="ol-btn ol-btn--primary"
            href="/auth?mode=sign-up"
            prefetch={false}
          >
            Create your account
          </Link>
          <Link
            className="ol-btn ol-btn--ghost"
            href="/auth?mode=sign-in"
            prefetch={false}
          >
            I already have one
          </Link>
        </div>
      </header>
      {HOME_ROWS.map((row) => (
        <HomeRow key={row.id} row={row} />
      ))}
    </main>
  );
}

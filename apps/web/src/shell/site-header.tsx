import Link from 'next/link';
import { Suspense } from 'react';
import { HeaderNav, HeaderNavView } from './header-nav';
import { Logo } from './logo';

/**
 * The guest header on every route (ADR 0014, slice 2a). Server-rendered and static: only the
 * nav reads the path, inside a Suspense boundary whose fallback is the same nav with nothing
 * active, so a prerender with an unknown param still ships working links.
 * The search is a plain GET form: it submits without JavaScript; live results come with OTA-98.
 */
export function SiteHeader() {
  return (
    <header className="sh-header ol-glass">
      <div className="sh-header__in">
        <Logo />
        <Suspense fallback={<HeaderNavView pathname={null} />}>
          <HeaderNav />
        </Suspense>
        <span className="sh-spacer" />
        <form className="sh-search" role="search" action="/search" method="get">
          <label className="sh-search__field">
            <SearchIcon />
            <input
              type="search"
              name="q"
              placeholder="Search anime"
              aria-label="Search anime"
              enterKeyHint="search"
            />
          </label>
        </form>
        <div className="sh-right">
          <Link
            className="ol-btn ol-btn--ghost ol-btn--sm"
            href="/auth?mode=sign-in"
          >
            Sign in
          </Link>
          <Link
            className="ol-btn ol-btn--primary ol-btn--sm sh-only-desktop"
            href="/auth?mode=sign-up"
          >
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle
        cx="7"
        cy="7"
        r="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="m11 11 3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

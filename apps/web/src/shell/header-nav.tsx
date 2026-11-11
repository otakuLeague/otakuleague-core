'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Disclosure } from './disclosure';
import { activeSection, DISCOVER_LINKS, isWithin, MAIN_LINKS } from './nav';

/** Main nav for the current path. Rendered inside a Suspense boundary (see SiteHeader). */
export function HeaderNav() {
  return <HeaderNavView pathname={usePathname()} />;
}

/**
 * The links themselves. `pathname` null is the prerendered fallback: the same working links,
 * nothing marked active.
 */
export function HeaderNavView({
  pathname,
}: {
  readonly pathname: string | null;
}) {
  const section = activeSection(pathname);
  return (
    <nav aria-label="Main">
      <ul className="sh-nav">
        <li>
          <Disclosure
            summaryClassName="sh-nav__link"
            active={section === 'discover'}
            summary={
              <>
                <span>Discover</span>
                <ChevronIcon />
              </>
            }
          >
            <ul>
              {DISCOVER_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={
                      isWithin(pathname, link.href) ? 'page' : undefined
                    }
                  >
                    <span className="sh-menu__ico" aria-hidden="true">
                      {link.icon}
                    </span>
                    <span>
                      {link.label}
                      <small>{link.hint}</small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Disclosure>
        </li>
        {MAIN_LINKS.map((link) => (
          <li key={link.href}>
            <Link
              className="sh-nav__link"
              href={link.href}
              aria-current={section === link.section ? 'page' : undefined}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ChevronIcon() {
  return (
    <svg className="sh-chev" viewBox="0 0 10 10" aria-hidden="true">
      <path
        d="M1.5 3.5 5 7l3.5-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

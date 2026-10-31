import Link from 'next/link';
import { Logo } from './logo';
import { ThemeSwitch } from './theme-switch';

// Links and socials from the old site's footer (PARITY.md §1); legal pages land with OTA-147.
const ROADMAP_URL =
  'https://cosmic-plutonium-46d.notion.site/2b564006e720817ebcddda0414edf7b7?v=2b564006e72081b7b472000c768b8d2f';
export const CONTACT_EMAIL = 'contact@otakuleague.com';

const ABOUT_LINKS = [
  { href: '/faq', label: 'About & FAQ' },
  { href: '/contact', label: 'Contact' },
] as const;

const LEGAL_LINKS = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/cookies', label: 'Cookies' },
] as const;

// Short marks until the networks' official icons are added (no icon dependency yet).
export const SOCIAL_LINKS = [
  { href: 'https://x.com/otakuLeague2025', name: 'X', mark: 'X' },
  { href: 'https://discord.gg/FKv2uhAmrM', name: 'Discord', mark: 'Dc' },
  {
    href: 'https://www.instagram.com/otaku__league',
    name: 'Instagram',
    mark: 'Ig',
  },
  { href: 'https://www.tiktok.com/@otakuleague', name: 'TikTok', mark: 'Tt' },
  {
    href: 'https://www.facebook.com/profile.php?id=61583540218127',
    name: 'Facebook',
    mark: 'Fb',
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="sh-foot">
      <div className="sh-foot__in">
        <div className="sh-foot__brand">
          <Logo />
          <p>
            Track. Compete. Level up. Your watchlist, XP and season leaderboard
            in one place.
          </p>
        </div>
        <nav aria-labelledby="foot-about">
          <h2 className="ol-label" id="foot-about">
            OtakuLeague
          </h2>
          <ul>
            <li>
              <a href={ROADMAP_URL} target="_blank" rel="noopener noreferrer">
                Roadmap <span aria-hidden="true">↗</span>
              </a>
            </li>
            {ABOUT_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-labelledby="foot-legal">
          <h2 className="ol-label" id="foot-legal">
            Legal
          </h2>
          <ul>
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="ol-label" id="foot-social">
            Follow
          </h2>
          <ul className="sh-social" aria-labelledby="foot-social">
            {SOCIAL_LINKS.map((social) => (
              <li key={social.name}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.name}
                >
                  <span aria-hidden="true">{social.mark}</span>
                </a>
              </li>
            ))}
          </ul>
          <ThemeSwitch />
        </div>
      </div>
      <div className="sh-foot__base">
        <span>
          © 2026 OtakuLeague ·{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </span>
        <span>Anime data from AniList</span>
      </div>
    </footer>
  );
}

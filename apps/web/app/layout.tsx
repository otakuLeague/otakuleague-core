import { APP_NAME } from '@otakuleague/shared-types';
import type { Metadata, Viewport } from 'next';
import {
  Bricolage_Grotesque,
  Instrument_Sans,
  JetBrains_Mono,
} from 'next/font/google';
import './styles/tokens.css';
import './styles/components.css';
import './styles/shell.css';
import './globals.css';
import { SiteFooter } from '../src/shell/site-footer';
import { THEME_BOOT_SCRIPT } from '../src/shell/theme';

// Self-hosted at build time by next/font; tokens.css reads these names (--font-*-face).
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display-face',
});
const sans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans-face',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono-face',
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description:
    'Track your anime and manga, explore their data, and play anime quizzes and games.',
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // The boot script sets data-theme on <html> before hydration, hence suppressHydrationWarning
    // (it only covers this element's own attributes).
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <div className="sh-bg" aria-hidden="true" />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}

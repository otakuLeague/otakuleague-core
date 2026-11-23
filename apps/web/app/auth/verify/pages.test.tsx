import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import type { Metadata } from 'next';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EMAIL_LINK_LANDINGS,
  type EmailLinkLanding,
} from '../../../src/auth/email-link';
import ConfirmedPage, { metadata as confirmed } from './confirmed/page';
import ExpiredPage, { metadata as expired } from './expired/page';
import SignedInPage, { metadata as signedIn } from './signed-in/page';
import TryAgainPage, { metadata as tryAgain } from './try-again/page';

afterEach(cleanup);

const APP_DIR = path.resolve(__dirname, '../..');

// The password page is slice 1f-vi-c (ADR 0015 Addendum 1f-vi, decision 9). Until it ships, a click
// on that path meets the 404 page; vi-c deletes this exclusion and the test then holds it too.
const BUILT_IN_VI_C: readonly EmailLinkLanding[] = [
  EMAIL_LINK_LANDINGS.password,
];

/** The landings that are pages of this slice: the handler's, without `/auth` and vi-c's. */
const BUILT_LANDINGS = Object.values(EMAIL_LINK_LANDINGS).filter(
  (landing) =>
    landing !== EMAIL_LINK_LANDINGS.preview && !BUILT_IN_VI_C.includes(landing),
);

const pageOf = (landing: string) =>
  path.join(APP_DIR, ...landing.split('/').filter(Boolean), 'page.tsx');

/** Every module a file imports, `type:` in front of a type-only import. */
const importsOf = (file: string) =>
  [
    ...readFileSync(file, 'utf8').matchAll(
      /^import\s+(type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm,
    ),
  ].map(
    ([, typeOnly, from]) => `${typeOnly === undefined ? '' : 'type:'}${from}`,
  );

const SCREENS: readonly {
  readonly landing: EmailLinkLanding;
  readonly Page: ComponentType;
  readonly metadata: Metadata;
  readonly heading: string;
  readonly sentence: string;
  readonly tone: 'ok' | 'wait';
  readonly link: readonly [name: string, href: string];
  readonly look: 'primary' | 'back';
}[] = [
  {
    landing: EMAIL_LINK_LANDINGS.signedIn,
    Page: SignedInPage,
    metadata: signedIn,
    heading: 'Email confirmed',
    sentence: 'Welcome to the league.',
    tone: 'ok',
    link: ['Continue', '/'],
    look: 'primary',
  },
  {
    landing: EMAIL_LINK_LANDINGS.confirmed,
    Page: ConfirmedPage,
    metadata: confirmed,
    heading: 'Your email is confirmed',
    sentence: 'Sign in to continue.',
    tone: 'ok',
    link: ['Sign in', '/auth'],
    look: 'primary',
  },
  {
    landing: EMAIL_LINK_LANDINGS.expired,
    Page: ExpiredPage,
    metadata: expired,
    heading: "This link doesn't work anymore",
    sentence:
      'It has expired, was already used or is incomplete. Open the link in our newest email, or sign up again if it has been over 24 hours.',
    tone: 'wait',
    link: ['Back to sign in', '/auth'],
    look: 'back',
  },
  {
    landing: EMAIL_LINK_LANDINGS.tryAgain,
    Page: TryAgainPage,
    metadata: tryAgain,
    heading: "We couldn't confirm your email",
    sentence: 'Your link may still work. Open it again in a few minutes.',
    tone: 'wait',
    link: ['Back to sign in', '/auth'],
    look: 'back',
  },
];

describe('email link landing pages', () => {
  it.each(SCREENS)(
    '$heading: the heading as title only, its badge, one sentence, one link',
    ({ Page, metadata, heading, sentence, tone, link: [name, href], look }) => {
      const { container } = render(<Page />);

      expect(metadata).toEqual({ title: heading });
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
        heading,
      );
      expect(screen.getByText(sentence)).toBeTruthy();
      const links = screen.getAllByRole('link');
      expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual(
        [[name, href]],
      );
      expect(
        [...container.querySelectorAll('.au-badge[data-tone]')].map((badge) =>
          badge.getAttribute('data-tone'),
        ),
      ).toEqual([tone]);
      const [link] = links;
      expect(
        look === 'primary'
          ? link?.classList.contains('ol-btn--primary')
          : link?.parentElement?.classList.contains('au-foot') &&
              !link.classList.contains('ol-btn'),
      ).toBe(true);
    },
  );

  it('covers every built landing once', () => {
    expect(SCREENS.map(({ landing }) => landing).sort()).toEqual(
      [...BUILT_LANDINGS].sort(),
    );
  });

  it('has a page for every landing of the handler, password excepted until vi-c', () => {
    expect(
      BUILT_LANDINGS.filter((landing) => !existsSync(pageOf(landing))),
    ).toEqual([]);
    expect(
      BUILT_IN_VI_C.filter((landing) => existsSync(pageOf(landing))),
    ).toEqual([]);
  });

  // Static by construction: no request-time read or API call can arrive without a new import.
  it.each(BUILT_LANDINGS)(
    '%s imports only Next types, the screen and the link lifetime, and stays a sync server component',
    (landing) => {
      const file = pageOf(landing);
      const source = readFileSync(file, 'utf8');

      expect(
        importsOf(file).filter(
          (from) =>
            ![
              'type:next',
              '../email-link-screen',
              '../../../../src/auth/auth-cookies',
            ].includes(from),
        ),
      ).toEqual([]);
      expect(source).not.toMatch(/['"]use client['"]|\basync\b/);
    },
  );

  it('the screen imports only next/link, the focus heading and its css', () => {
    const file = path.join(APP_DIR, 'auth/verify/email-link-screen.tsx');

    expect(importsOf(file).sort()).toEqual(
      [
        '../../../src/auth/focus-heading',
        '../../styles/auth.css',
        'next/link',
      ].sort(),
    );
    expect(readFileSync(file, 'utf8')).not.toMatch(
      /['"]use client['"]|\basync\b/,
    );
  });
});

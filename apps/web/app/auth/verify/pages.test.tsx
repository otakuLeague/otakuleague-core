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

const SCREENS: readonly {
  readonly Page: ComponentType;
  readonly metadata: Metadata;
  readonly heading: string;
  readonly sentence: string;
  readonly link: readonly [name: string, href: string];
}[] = [
  {
    Page: SignedInPage,
    metadata: signedIn,
    heading: 'Email confirmed',
    sentence: "You're signed in. Welcome to the league.",
    link: ['Continue', '/'],
  },
  {
    Page: ConfirmedPage,
    metadata: confirmed,
    heading: 'Your email is confirmed',
    sentence: 'Sign in to continue.',
    link: ['Sign in', '/auth'],
  },
  {
    Page: ExpiredPage,
    metadata: expired,
    heading: "This link doesn't work anymore",
    sentence:
      'It has expired, was already used or is incomplete. Open the link in the newest email we sent you.',
    link: ['Back to sign in', '/auth'],
  },
  {
    Page: TryAgainPage,
    metadata: tryAgain,
    heading: "We couldn't confirm your email",
    sentence: 'Your link may still work. Open it again in a few minutes.',
    link: ['Back to sign in', '/auth'],
  },
];

describe('email link landing pages', () => {
  it.each(SCREENS)(
    '$heading: the heading as title only, one sentence, one link',
    ({ Page, metadata, heading, sentence, link: [name, href] }) => {
      render(<Page />);

      expect(metadata).toEqual({ title: heading });
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
        heading,
      );
      expect(screen.getByText(sentence)).toBeTruthy();
      const links = screen.getAllByRole('link');
      expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual(
        [[name, href]],
      );
    },
  );

  it('has a page for every landing of the handler, password excepted until vi-c', () => {
    const pageOf = (landing: string) =>
      path.join(APP_DIR, ...landing.split('/').filter(Boolean), 'page.tsx');
    const landings = Object.values(EMAIL_LINK_LANDINGS);

    expect(
      landings
        .filter((landing) => !BUILT_IN_VI_C.includes(landing))
        .filter((landing) => !existsSync(pageOf(landing))),
    ).toEqual([]);
    expect(
      BUILT_IN_VI_C.filter((landing) => existsSync(pageOf(landing))),
    ).toEqual([]);
  });

  it('reads nothing at request time and calls no API', () => {
    const sources = ['signed-in', 'confirmed', 'expired', 'try-again', '.']
      .map((dir) =>
        path.join(
          APP_DIR,
          'auth/verify',
          dir,
          dir === '.' ? 'email-link-screen.tsx' : 'page.tsx',
        ),
      )
      .map((file) => readFileSync(file, 'utf8'));

    for (const source of sources) {
      expect(source).not.toMatch(
        /cookies\(|headers\(|connection\(|searchParams|Suspense|apiClient|Call\(/,
      );
    }
  });
});

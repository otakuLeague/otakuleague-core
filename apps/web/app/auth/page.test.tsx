import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthSearchParams } from './auth-query-fields';
import AuthPage, { metadata } from './page';

vi.mock('../../src/auth/sign-in-action', () => ({ signInAction: vi.fn() }));
vi.mock('../../src/auth/sign-up-action', () => ({ signUpAction: vi.fn() }));
// jsdom cannot render an async Server Component inside the page; the real ones are awaited below.
vi.mock('./auth-query-fields', () => ({
  AuthQueryFields: () => <input type="hidden" name="query-fields" />,
  SignUpPanel: () => <div data-testid="sign-up-hole" />,
}));
const { AuthQueryFields, SignUpPanel } = await vi.importActual<
  typeof import('./auth-query-fields')
>('./auth-query-fields');

const renderPage = (vercelEnv: string) => {
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_ENV', vercelEnv);
  return render(<AuthPage searchParams={Promise.resolve({})} />).container;
};
const renderQueryFields = async (query: AuthSearchParams) =>
  render(await AuthQueryFields({ searchParams: Promise.resolve(query) }))
    .container;
const renderSignUpPanel = async (query: AuthSearchParams) =>
  render(await SignUpPanel({ searchParams: Promise.resolve(query) })).container;

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('Auth page', () => {
  it('shows the form, with the query fields inside it, in production', () => {
    const page = renderPage('production');

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Welcome back',
    );
    expect(page.querySelector('form input[name="password"]')).not.toBeNull();
    expect(
      page.querySelector('form input[name="query-fields"]'),
    ).not.toBeNull();
    const signIn = page.querySelector('.au-panel[data-auth-panel="sign-in"]');
    expect(signIn?.contains(page.querySelector('form'))).toBe(true);
    // The sign-up hole comes first, so the stylesheet's sibling rule can hide sign-in.
    expect(signIn?.previousElementSibling?.getAttribute('data-testid')).toBe(
      'sign-up-hole',
    );
    expect(
      screen
        .getByRole('link', { name: "Create one, it's free" })
        .getAttribute('href'),
    ).toBe('/auth?mode=sign-up');
  });

  it('hides sign-in after a sign-up panel with the stylesheet rule', () => {
    const css = readFileSync(
      join(import.meta.dirname, '../styles/auth.css'),
      'utf8',
    );
    expect(css).toMatch(
      /\.au-panel\[data-auth-panel='sign-up'\] ~ \.au-panel\[data-auth-panel='sign-in'\] \{\s*display: none;\s*\}/,
    );
  });

  it('shows the notice and no form or field on a preview deployment', () => {
    const page = renderPage('preview');

    expect(
      screen.getByText('Sign-in is off on preview deployments'),
    ).toBeTruthy();
    expect(page.querySelector('form, input, [data-auth-panel]')).toBeNull();
    expect(screen.queryByTestId('sign-up-hole')).toBeNull();
  });

  it('is its own canonical', () => {
    expect(metadata.alternates?.canonical).toBe('/auth');
  });
});

describe('AuthQueryFields', () => {
  it('passes only next, exactly as sent (only the action validates it)', async () => {
    const next = '//evil.com/"><script>alert(1)</script>';
    const fields = await renderQueryFields({ mode: 'sign-up', next });

    expect(
      [...fields.querySelectorAll('input')].map((i) => [
        i.type,
        i.name,
        i.value,
      ]),
    ).toEqual([['hidden', 'next', next]]);
    expect(fields.querySelector('script')).toBeNull();
  });

  it.each<AuthSearchParams>([
    {},
    { mode: 'sign-in', next: '' },
    { mode: ['sign-up'], next: ['/a', '/b'] },
  ])('renders nothing for %o', async (query) => {
    expect((await renderQueryFields(query)).innerHTML).toBe('');
  });
});

describe('SignUpPanel', () => {
  it.each(['sign-up', 'signup'])(
    'renders the sign-up form for mode=%s, with a way back to sign-in',
    async (mode) => {
      const panel = await renderSignUpPanel({ mode });

      expect(
        panel.querySelector('.au-panel[data-auth-panel="sign-up"] form'),
      ).not.toBeNull();
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
        'Create your account',
      );
      expect(
        screen.getByRole('link', { name: 'Sign in' }).getAttribute('href'),
      ).toBe('/auth');
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it.each<AuthSearchParams>([{}, { mode: 'sign-in' }, { mode: ['sign-up'] }])(
    'renders nothing for %o',
    async (query) => {
      expect((await renderSignUpPanel(query)).innerHTML).toBe('');
    },
  );
});

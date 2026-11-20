import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthSearchParams } from './auth-query-fields';
import AuthPage, { metadata } from './page';

vi.mock('../../src/auth/sign-in-action', () => ({ signInAction: vi.fn() }));
// jsdom cannot render an async Server Component inside the page; the real one is awaited below.
vi.mock('./auth-query-fields', () => ({
  AuthQueryFields: () => <input type="hidden" name="query-fields" />,
}));
const { AuthQueryFields } = await vi.importActual<
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
  });

  it('shows the notice and no form or field on a preview deployment', () => {
    const page = renderPage('preview');

    expect(
      screen.getByText('Sign-in is off on preview deployments'),
    ).toBeTruthy();
    expect(page.querySelector('form, input')).toBeNull();
  });

  it('is its own canonical', () => {
    expect(metadata.alternates?.canonical).toBe('/auth');
  });
});

describe('AuthQueryFields', () => {
  it('passes next exactly as sent (only the action validates it) and says sign-up is closed', async () => {
    const next = '//evil.com/"><script>alert(1)</script>';
    const fields = await renderQueryFields({ mode: 'sign-up', next });

    expect(screen.getByText(/New accounts aren.t open yet/)).toBeTruthy();
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

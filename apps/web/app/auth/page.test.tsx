import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthSearchParams } from './auth-query-fields';
import AuthPage, { metadata } from './page';

// The action is server code; the form around it is tested in src/auth/sign-in-form.test.tsx.
vi.mock('../../src/auth/sign-in-action', () => ({ signInAction: vi.fn() }));
// AuthQueryFields is an async Server Component, which jsdom cannot render inside the page; the
// real one is awaited directly below.
vi.mock('./auth-query-fields', () => ({
  AuthQueryFields: () => <input type="hidden" name="query-fields" />,
}));
const { AuthQueryFields } = await vi.importActual<
  typeof import('./auth-query-fields')
>('./auth-query-fields');

const NO_QUERY = Promise.resolve({});
const renderQueryFields = async (query: AuthSearchParams) =>
  render(await AuthQueryFields({ searchParams: Promise.resolve(query) }));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('Auth page', () => {
  it('shows the form with the query fields inside it in production', () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    const { container } = render(<AuthPage searchParams={NO_QUERY} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Welcome back',
    );
    expect(
      container.querySelector('form input[name="password"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('form input[name="query-fields"]'),
    ).not.toBeNull();
  });

  it('shows the preview notice and no password field on a preview deployment', () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    const { container } = render(<AuthPage searchParams={NO_QUERY} />);

    expect(
      screen.getByText('Sign-in is off on preview deployments'),
    ).toBeTruthy();
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });

  it('is its own canonical', () => {
    expect(metadata.alternates?.canonical).toBe('/auth');
  });
});

describe('AuthQueryFields', () => {
  it('passes next to the form exactly as sent: only the action validates it', async () => {
    const next = '//evil.com/"><script>alert(1)</script>';
    const { container } = await renderQueryFields({ next });

    const inputs = container.querySelectorAll('input');
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.type).toBe('hidden');
    expect(inputs[0]?.name).toBe('next');
    expect(inputs[0]?.value).toBe(next);
    expect(container.querySelector('script')).toBeNull();
  });

  it.each<AuthSearchParams>([
    {},
    { next: '' },
    { next: ['/a', '/b'] },
    { next: `/${'a'.repeat(2048)}` },
  ])('adds no next field for %o', async (query) => {
    const { container } = await renderQueryFields(query);

    expect(container.querySelector('input')).toBeNull();
  });

  it.each(['signup', 'sign-up'])(
    'says sign-up is closed for mode=%s',
    async (mode) => {
      await renderQueryFields({ mode });

      expect(screen.getByText(/New accounts aren.t open yet/)).toBeTruthy();
    },
  );

  it.each<AuthSearchParams>([{}, { mode: 'sign-in' }, { mode: ['sign-up'] }])(
    'shows no sign-up note for %o',
    async (query) => {
      const { container } = await renderQueryFields(query);

      expect(container.textContent).toBe('');
    },
  );
});

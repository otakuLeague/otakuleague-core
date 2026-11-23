import { act, cleanup, render, screen } from '@testing-library/react';
import { use } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CheckEmailPage, { metadata } from './page';

const readFlashEmail = vi.hoisted(() =>
  vi.fn<() => Promise<string | undefined>>(),
);
vi.mock('../../../src/auth/flash-email', () => ({ readFlashEmail }));
// jsdom cannot render an async Server Component: inside the page the hole never resolves, so the
// page renders exactly what the static shell holds. The real one is awaited below.
const { NEVER, addressStub } = vi.hoisted(() => {
  const never = new Promise<never>(() => undefined);
  return { NEVER: never, addressStub: vi.fn() };
});
vi.mock('./check-email-lede', async (importActual) => ({
  ...(await importActual<typeof import('./check-email-lede')>()),
  CheckEmailAddress: addressStub,
}));
addressStub.mockImplementation(() => use(NEVER));
const { CheckEmailAddress, CheckEmailLede } =
  await vi.importActual<typeof import('./check-email-lede')>(
    './check-email-lede',
  );

const ADDRESS =
  'kaito.tanaka.the.longest.address@university-of-kyoto.example.ac.jp';
const NO_ADDRESS =
  'Open the confirmation link we sent to the address you signed up with. It works for 24 hours.';

afterEach(() => {
  cleanup();
  readFlashEmail.mockReset();
});

describe('Check email page', () => {
  it('prerenders the whole screen without an address, a form or a field', () => {
    const page = render(<CheckEmailPage />).container;

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Check your email');
    expect(heading.tabIndex).toBe(-1);
    expect(screen.getByText(NO_ADDRESS)).toBeTruthy();
    expect(
      screen.getByText(
        'Not there after a few minutes? Check spam and promotions.',
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Back to sign in' })
        .getAttribute('href'),
    ).toBe('/auth');
    expect(page.querySelector('strong, form, input, button')).toBeNull();
    expect(page.innerHTML).not.toContain('@');
    expect(addressStub).toHaveBeenCalledOnce();
  });

  it('focuses its h1 on arrival', async () => {
    // A sync act defers passive effects while a sibling suspends; the browser runs them at commit.
    await act(() => {
      render(<CheckEmailPage />);
      return Promise.resolve();
    });
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Check your email' }),
    );
  });

  it('has a title only: no canonical, no description, no robots key', () => {
    expect(metadata).toEqual({ title: 'Check your email' });
  });
});

describe('CheckEmailLede', () => {
  it('names nobody without an address', () => {
    const lede = render(<CheckEmailLede email={undefined} />).container;

    expect(lede.textContent).toBe(NO_ADDRESS);
    expect(lede.querySelector('strong')).toBeNull();
  });

  it('shows a long address only as text in one strong', () => {
    const lede = render(<CheckEmailLede email={ADDRESS} />).container;

    expect(lede.textContent).toBe(
      `We sent a confirmation link to ${ADDRESS}. Open it to finish signing up. It works for 24 hours.`,
    );
    const strongs = lede.querySelectorAll('strong');
    expect([...strongs].map((s) => s.textContent)).toEqual([ADDRESS]);
    expect(lede.innerHTML.split(ADDRESS)).toHaveLength(2);
  });
});

describe('CheckEmailLede markup in the address', () => {
  it('renders it as text only, never as an element', () => {
    const planted = '<img/src=x/onerror=alert(1)>@x';
    const lede = render(<CheckEmailLede email={planted} />).container;

    expect(lede.querySelector('img')).toBeNull();
    expect(lede.querySelector('strong')?.textContent).toBe(planted);
  });
});

describe('CheckEmailAddress', () => {
  it('shows the address the flash reader answers', async () => {
    readFlashEmail.mockResolvedValue('a@b.c');
    const lede = render(await CheckEmailAddress()).container;

    expect(lede.querySelector('strong')?.textContent).toBe('a@b.c');
  });

  it('falls back to the sentence without an address when there is no flash', async () => {
    readFlashEmail.mockResolvedValue(undefined);
    const lede = render(await CheckEmailAddress()).container;

    expect(lede.textContent).toBe(NO_ADDRESS);
  });
});

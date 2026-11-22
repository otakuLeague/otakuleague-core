// @vitest-environment node
import { IDENTIFIER_MAX } from '@otakuleague/shared-types';
import { notFound } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plausibleFlashEmail, readFlashEmail } from './flash-email';

const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  reads: [] as string[],
  cookies: vi.fn(),
  writes: vi.fn(),
  report: vi.fn(),
}));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('./auth-reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./auth-reports')>()),
  reportAuthCallFault: mocks.report,
  reportClientIpUnknown: mocks.report,
}));

const ADDRESS = 'frieren@example.com';
const PLANTED = 'attacker@evil.example';
const LONGEST = `${'f'.repeat(64)}@${'e'.repeat(IDENTIFIER_MAX - 65)}`;
const NEXT_SIGNAL: unknown = (() => {
  try {
    notFound();
  } catch (signal) {
    return signal;
  }
})();

describe('plausibleFlashEmail', () => {
  it.each([
    ['a plain address', ADDRESS],
    ['the shortest, 3 characters', 'a@b'],
    ['the longest, IDENTIFIER_MAX characters', LONGEST],
    ['the edges of the allowed ranges', '!?@[~'],
  ])('answers %s unchanged', (_, value) => {
    expect(value.length).toBeLessThanOrEqual(IDENTIFIER_MAX);
    expect(plausibleFlashEmail(value)).toBe(value);
  });

  it.each([
    ['a capital letter', 'Frieren@example.com'],
    ['a capital Z, the last before "["', 'a@Z'],
    ['a space', 'frieren @example.com'],
    ['a tab', 'frieren\t@example.com'],
    ['a NUL', 'frieren\u0000@example.com'],
    ['a trailing newline', `${ADDRESS}\n`],
    ['DEL (U+007F)', `${ADDRESS}\u007f`],
    ['a non-ASCII letter', 'frieren@ex\u00e4mple.com'],
    ['a Cyrillic look-alike', 'fr\u0456eren@example.com'],
    ['a bidi override', 'frieren@\u202eexample.com'],
    ['a no-break space', 'frieren\u00a0@example.com'],
    ['two "@"', 'frieren@elf@example.com'],
    ['a leading "@"', '@example.com'],
    ['a trailing "@"', 'frieren@'],
    ['only "@"', '@'],
    ['no "@"', 'frieren.example.com'],
    ['IDENTIFIER_MAX + 1 characters', `${LONGEST}e`],
    ['an empty string', ''],
    ['undefined', undefined],
    ['null', null],
    ['a number', 42],
    ['an array holding an address', [ADDRESS]],
  ])('answers nothing for %s', (_, value: unknown) => {
    expect(plausibleFlashEmail(value)).toBeUndefined();
  });
});

describe('readFlashEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('WEB_PUBLIC_URL', 'https://beta.otakuleague.com');
    mocks.jar = new Map([['__Host-ol_flash', ADDRESS]]);
    mocks.reads = [];
    mocks.cookies.mockImplementation(() =>
      Promise.resolve({
        get: (name: string) => {
          mocks.reads.push(name);
          const value = mocks.jar.get(name);
          return value === undefined ? undefined : { name, value };
        },
        has: (name: string) => mocks.jar.has(name),
        set: mocks.writes,
        delete: mocks.writes,
      }),
    );
  });

  afterEach(() => {
    // Rendering never writes or clears a cookie and never reports, whatever the outcome.
    expect([mocks.writes.mock.calls, mocks.report.mock.calls]).toEqual([[], []]);
    vi.unstubAllEnvs();
  });

  it.each([
    ['__Host-ol_flash', [['__Host-ol_flash', ADDRESS]], ADDRESS],
    [
      '__Host-ol_flash beside a planted plain ol_flash',
      [
        ['__Host-ol_flash', ADDRESS],
        ['ol_flash', PLANTED],
      ],
      ADDRESS,
    ],
    [
      'only a plain ol_flash, which a sibling host could plant',
      [['ol_flash', PLANTED]],
      undefined,
    ],
    ['no flash cookie', [], undefined],
    [
      'a flash that fails the check',
      [['__Host-ol_flash', 'Frieren@example.com']],
      undefined,
    ],
  ] as const)(
    'on https, with %s, reads __Host-ol_flash only',
    async (_, jar, address) => {
      mocks.jar = new Map(jar);

      expect(await readFlashEmail()).toBe(address);
      expect(mocks.reads).toEqual(['__Host-ol_flash']);
    },
  );

  it.each([
    ['ol_flash', [['ol_flash', ADDRESS]], ADDRESS],
    ['only __Host-ol_flash', [['__Host-ol_flash', ADDRESS]], undefined],
  ] as const)(
    'on http://localhost:3000, with %s, reads ol_flash only',
    async (_, jar, address) => {
      vi.stubEnv('VERCEL', undefined);
      vi.stubEnv('VERCEL_ENV', undefined);
      vi.stubEnv('WEB_PUBLIC_URL', 'http://localhost:3000');
      mocks.jar = new Map(jar);

      expect(await readFlashEmail()).toBe(address);
      expect(mocks.reads).toEqual(['ol_flash']);
    },
  );

  it.each([
    ['missing', undefined],
    ['http off loopback', 'http://beta.otakuleague.com'],
    ['an origin with a path', 'https://beta.otakuleague.com/auth'],
    ['loopback http on Vercel', 'http://localhost:3000'],
  ])(
    'answers nothing, unreported and unthrown, when WEB_PUBLIC_URL is %s',
    async (_, webPublicUrl) => {
      vi.stubEnv('WEB_PUBLIC_URL', webPublicUrl);
      mocks.jar = new Map([
        ['__Host-ol_flash', ADDRESS],
        ['ol_flash', ADDRESS],
      ]);

      expect(await readFlashEmail()).toBeUndefined();
      expect(mocks.reads).toEqual([]);
    },
  );

  it("lets Next's signal from cookies() pass, before WEB_PUBLIC_URL is read", async () => {
    vi.stubEnv('WEB_PUBLIC_URL', undefined);
    mocks.cookies.mockRejectedValue(NEXT_SIGNAL);

    await expect(readFlashEmail()).rejects.toBe(NEXT_SIGNAL);
  });
});

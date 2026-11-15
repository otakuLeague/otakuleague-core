// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchFunction } from '../api/client';

/** The incoming request seen by `headers()`, and how often it was read. */
const incoming = vi.hoisted(() => ({ headers: new Headers(), reads: 0 }));
vi.mock('next/headers', () => ({
  headers: () => {
    incoming.reads += 1;
    return Promise.resolve(incoming.headers);
  },
}));

interface RecordedRequest {
  readonly url: string;
  readonly headers: Record<string, string>;
}

/** The real apiClient() over a stubbed global fetch that answers 200 with `body`. */
async function loadDataWith(
  body: unknown,
  {
    baseUrl = 'http://api.test:4000',
    internalApiKey = '',
    status = 200,
  } = {},
) {
  const requests: RecordedRequest[] = [];
  const fetchFunction: FetchFunction = (input, init) => {
    requests.push({
      url: input instanceof Request ? input.url : input.toString(),
      headers: Object.fromEntries(new Headers(init?.headers)),
    });
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  vi.stubEnv('API_BASE_URL', baseUrl);
  vi.stubEnv('INTERNAL_API_KEY', internalApiKey);
  vi.stubGlobal('fetch', fetchFunction);
  vi.resetModules();
  const data = await import('./data');
  return { data, requests };
}

async function loadAnimeListWith(body: unknown) {
  const { data, requests } = await loadDataWith(body);
  return {
    loadAnimeList: data.loadAnimeList,
    loadAnimeListPage: data.loadAnimeListPage,
    requests,
  };
}

const page = {
  kind: 'top',
  season: null,
  entries: [
    {
      anilistId: 19,
      slug: 'monster',
      titleEnglish: 'Monster',
      titleRomaji: 'MONSTER',
      coverImageUrl: null,
    },
  ],
  nextCursor: null,
  freshness: 'fresh',
  fetchedAt: '2026-11-13T00:00:00.000Z',
};

describe('loadAnimeList', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('asks for one page of the list with the given limit', async () => {
    const { loadAnimeList, requests } = await loadAnimeListWith(page);

    expect(await loadAnimeList('top', 12)).toEqual({ ok: true, data: page });
    expect(requests.map((request) => request.url)).toEqual([
      'http://api.test:4000/anime/lists/top?limit=12',
    ]);
  });

  it('maps a body the guard rejects to invalid_response', async () => {
    const { loadAnimeList } = await loadAnimeListWith({
      ...page,
      entries: [{ ...page.entries[0], slug: '../admin' }],
    });

    expect(await loadAnimeList('airing', 12)).toEqual({
      ok: false,
      failure: { kind: 'invalid_response', status: 200 },
    });
  });
});

describe('loadAnimeListPage', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends the season upper case with its year, and the cursor encoded', async () => {
    const { loadAnimeListPage, requests } = await loadAnimeListWith(page);

    await loadAnimeListPage('seasonal', {
      season: { season: 'FALL', year: 2025 },
      cursor: 'a+b/c=',
      limit: 48,
    });

    expect(requests.map((request) => request.url)).toEqual([
      'http://api.test:4000/anime/lists/seasonal?season=FALL&year=2025&cursor=a%2Bb%2Fc%3D&limit=48',
    ]);
  });

  it('leaves out the season and a null cursor', async () => {
    const { loadAnimeListPage, requests } = await loadAnimeListWith(page);

    await loadAnimeListPage('top', { cursor: null, limit: 24 });

    expect(requests.map((request) => request.url)).toEqual([
      'http://api.test:4000/anime/lists/top?limit=24',
    ]);
  });
});

// Obviously fake: 47 characters of the allowed alphabet, never a real key.
const FAKE_KEY = 'fake-internal-api-key-for-tests-only-0123456789';
const VISITOR_IP = '203.0.113.7';

type DataModule = typeof import('./data');

describe('internal key and client IP (ADR 0019 rollout gate)', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    incoming.headers = new Headers();
    incoming.reads = 0;
  });

  const withKey = { baseUrl: 'https://api.test', internalApiKey: FAKE_KEY };

  const visitorChargedLoaders: [
    string,
    (data: DataModule) => Promise<unknown>,
  ][] = [
    ['loadAnime', (data) => data.loadAnime('frieren')],
    ['loadAnimeByAnilistId', (data) => data.loadAnimeByAnilistId(154587)],
    ['loadAnimeList', (data) => data.loadAnimeList('top', 12)],
    [
      'loadAnimeListPage',
      (data) => data.loadAnimeListPage('seasonal', { cursor: 'c1', limit: 48 }),
    ],
  ];

  const storedDataLoaders: [string, (data: DataModule) => Promise<unknown>][] =
    [
      ['resolveAnimeSlug', (data) => data.resolveAnimeSlug('frieren')],
      ['loadFranchise', (data) => data.loadFranchise('frieren')],
    ];

  it.each(visitorChargedLoaders)(
    '%s sends the key and the visitor IP: it can call AniList for the visitor',
    async (_name, load) => {
      incoming.headers = new Headers({ 'x-forwarded-for': VISITOR_IP });
      const { data, requests } = await loadDataWith({}, withKey);

      await load(data);

      expect(requests).toHaveLength(1);
      expect(requests[0]?.headers).toMatchObject({
        'x-internal-api-key': FAKE_KEY,
        'x-client-ip': VISITOR_IP,
      });
    },
  );

  it.each(storedDataLoaders)(
    '%s sends the key only and never reads request headers',
    async (_name, load) => {
      incoming.headers = new Headers({ 'x-forwarded-for': VISITOR_IP });
      const { data, requests } = await loadDataWith({}, withKey);

      await load(data);

      expect(requests[0]?.headers['x-internal-api-key']).toBe(FAKE_KEY);
      expect(requests[0]?.headers).not.toHaveProperty('x-client-ip');
      expect(incoming.reads).toBe(0);
    },
  );

  it('covers every loader data.ts exports, so a new one must pick a list', async () => {
    const { data } = await loadDataWith({});

    expect(Object.keys(data).sort()).toEqual(
      [...visitorChargedLoaders, ...storedDataLoaders].map(([name]) => name).sort(),
    );
  });

  it.each(visitorChargedLoaders)(
    '%s sends neither header without a key, as before slice 2',
    async (_name, load) => {
      incoming.headers = new Headers({ 'x-forwarded-for': VISITOR_IP });
      const { data, requests } = await loadDataWith({});

      await load(data);

      expect(requests[0]?.headers).toEqual({ accept: 'application/json' });
    },
  );
});

describe('loadAnimeListPage client IP', () => {
  const withKey = { baseUrl: 'https://api.test', internalApiKey: FAKE_KEY };
  const load = (data: DataModule) =>
    data.loadAnimeListPage('seasonal', { cursor: null, limit: 48 });

  beforeEach(() => {
    vi.stubEnv('VERCEL', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    incoming.headers = new Headers();
    incoming.reads = 0;
  });

  it('sends the key without an IP when there is no x-forwarded-for', async () => {
    const { data, requests } = await loadDataWith(page, withKey);

    await load(data);

    expect(requests[0]?.headers['x-internal-api-key']).toBe(FAKE_KEY);
    expect(requests[0]?.headers).not.toHaveProperty('x-client-ip');
  });

  it.each(['203.0.113.7, 10.0.0.1', '', 'not-an-ip', 'fe80::1%eth0'])(
    'leaves x-client-ip out for x-forwarded-for %j',
    async (forwardedFor) => {
      incoming.headers = new Headers({ 'x-forwarded-for': forwardedFor });
      const { data, requests } = await loadDataWith(page, withKey);

      await load(data);

      expect(requests[0]?.headers['x-internal-api-key']).toBe(FAKE_KEY);
      expect(requests[0]?.headers).not.toHaveProperty('x-client-ip');
    },
  );

  it('sends x-client-ip for one valid address', async () => {
    incoming.headers = new Headers({ 'x-forwarded-for': VISITOR_IP });
    const { data, requests } = await loadDataWith(page, withKey);

    await load(data);

    expect(requests[0]?.headers['x-client-ip']).toBe(VISITOR_IP);
  });

  it('leaves x-client-ip out off Vercel', async () => {
    vi.stubEnv('VERCEL', '');
    incoming.headers = new Headers({ 'x-forwarded-for': VISITOR_IP });
    const { data, requests } = await loadDataWith(page, withKey);

    await load(data);

    expect(requests[0]?.headers).not.toHaveProperty('x-client-ip');
  });

  it('reads the request headers exactly once per call', async () => {
    incoming.headers = new Headers({ 'x-forwarded-for': VISITOR_IP });
    const { data } = await loadDataWith(page, withKey);

    await load(data);

    expect(incoming.reads).toBe(1);
  });

  it('returns a visitor-limit 429 as an api_error without throwing', async () => {
    incoming.headers = new Headers({ 'x-forwarded-for': VISITOR_IP });
    const { data } = await loadDataWith(
      {
        error: {
          code: 'ANIME_LIST_VISITOR_LIMIT_REACHED',
          message: 'Too many list requests, try again shortly.',
        },
      },
      { ...withKey, status: 429 },
    );

    expect(await load(data)).toMatchObject({
      ok: false,
      failure: { kind: 'api_error', status: 429 },
    });
  });
});

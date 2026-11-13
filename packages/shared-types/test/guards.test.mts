import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isAnimeFranchise,
  isAnimeListPage,
  isApiError,
  isHealthResponse,
} from '@otakuleague/shared-types';

// Shapes that no guard may accept, whatever it checks.
const NOT_OBJECTS: readonly unknown[] = [
  null,
  undefined,
  'error',
  42,
  true,
  [],
];

void describe('isApiError', () => {
  void it('accepts an envelope with a known code and a message', () => {
    assert.equal(
      isApiError({ error: { code: 'NOT_FOUND', message: 'Cannot GET /x' } }),
      true,
    );
  });

  void it('accepts VALIDATION_FAILED with details, including an empty list', () => {
    const issue = { field: 'studio.name', message: 'must be a string' };

    assert.equal(
      isApiError({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid',
          details: [issue],
        },
      }),
      true,
    );
    assert.equal(
      isApiError({
        error: { code: 'VALIDATION_FAILED', message: 'Invalid', details: [] },
      }),
      true,
    );
  });

  void it('rejects non-objects, null and arrays', () => {
    for (const candidate of NOT_OBJECTS) {
      assert.equal(isApiError(candidate), false, String(candidate));
    }
    assert.equal(isApiError({ error: null }), false);
    assert.equal(isApiError({ error: [] }), false);
  });

  void it('rejects an unknown code, a missing code and a non-string message', () => {
    assert.equal(
      isApiError({ error: { code: 'TEAPOT', message: 'x' } }),
      false,
    );
    assert.equal(isApiError({ error: { message: 'x' } }), false);
    assert.equal(
      isApiError({ error: { code: 'NOT_FOUND', message: 404 } }),
      false,
    );
    assert.equal(isApiError({ error: { code: 'NOT_FOUND' } }), false);
  });

  void it('rejects VALIDATION_FAILED without details or with malformed issues', () => {
    const base = { code: 'VALIDATION_FAILED', message: 'Invalid' };

    assert.equal(isApiError({ error: base }), false);
    assert.equal(isApiError({ error: { ...base, details: 'name' } }), false);
    assert.equal(isApiError({ error: { ...base, details: [null] } }), false);
    assert.equal(
      isApiError({ error: { ...base, details: [{ field: 1, message: 'x' }] } }),
      false,
    );
    assert.equal(
      isApiError({ error: { ...base, details: [{ field: 'name' }] } }),
      false,
    );
  });

  void it('rejects details on any code other than VALIDATION_FAILED', () => {
    assert.equal(
      isApiError({ error: { code: 'NOT_FOUND', message: 'x', details: [] } }),
      false,
    );
  });

  void it('rejects a health body, which is not an envelope', () => {
    assert.equal(
      isApiError({ status: 'error', checks: { database: 'down' } }),
      false,
    );
  });
});

void describe('isHealthResponse', () => {
  void it('accepts the healthy and the database-down bodies', () => {
    assert.equal(
      isHealthResponse({ status: 'ok', checks: { database: 'up' } }),
      true,
    );
    assert.equal(
      isHealthResponse({ status: 'error', checks: { database: 'down' } }),
      true,
    );
  });

  void it('rejects non-objects, null and arrays', () => {
    for (const candidate of NOT_OBJECTS) {
      assert.equal(isHealthResponse(candidate), false, String(candidate));
    }
    assert.equal(isHealthResponse({ status: 'ok', checks: null }), false);
    assert.equal(isHealthResponse({ status: 'ok', checks: ['up'] }), false);
  });

  void it('rejects a status that contradicts the database check', () => {
    assert.equal(
      isHealthResponse({ status: 'ok', checks: { database: 'down' } }),
      false,
    );
    assert.equal(
      isHealthResponse({ status: 'error', checks: { database: 'up' } }),
      false,
    );
  });

  void it('rejects unknown values and wrong field types', () => {
    assert.equal(
      isHealthResponse({ status: 'degraded', checks: { database: 'up' } }),
      false,
    );
    assert.equal(
      isHealthResponse({ status: 'ok', checks: { database: true } }),
      false,
    );
    assert.equal(isHealthResponse({ status: 'ok' }), false);
    assert.equal(
      isHealthResponse({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'x' },
      }),
      false,
    );
  });
});

void describe('isAnimeFranchise', () => {
  const season = {
    anilistId: 16498,
    slug: null,
    label: 'Season 1',
    isCurrent: true,
    status: 'FINISHED',
    startDate: { year: 2013, month: null, day: null },
  };
  const franchise = { state: 'complete', mainLine: [season], related: [] };

  void it('accepts a franchise, with or without seasons, slug or start date', () => {
    assert.equal(isAnimeFranchise(franchise), true);
    assert.equal(isAnimeFranchise({ ...franchise, mainLine: [] }), true);
    assert.equal(
      isAnimeFranchise({
        ...franchise,
        mainLine: [{ ...season, slug: 'aot', startDate: null, status: null }],
      }),
      true,
    );
  });

  void it('rejects an unknown state, a malformed season or missing lists', () => {
    for (const value of [
      ...NOT_OBJECTS,
      { ...franchise, state: 'done' },
      { ...franchise, mainLine: [{ ...season, anilistId: '16498' }] },
      { ...franchise, mainLine: [{ ...season, isCurrent: 'yes' }] },
      { ...franchise, mainLine: [{ ...season, status: 'AIRING' }] },
      { ...franchise, mainLine: [{ ...season, startDate: {} }] },
      { state: 'complete', related: [] },
      { state: 'complete', mainLine: [] },
    ]) {
      assert.equal(isAnimeFranchise(value), false, JSON.stringify(value));
    }
  });
});

void describe('isAnimeListPage', () => {
  const entry = {
    anilistId: 16498,
    slug: 'attack-on-titan',
    titleEnglish: 'Attack on Titan',
    titleRomaji: 'Shingeki no Kyojin',
    coverImageUrl: 'https://s4.anilist.co/cover.jpg',
  };
  const page = {
    kind: 'top',
    season: null,
    entries: [entry],
    nextCursor: null,
    freshness: 'fresh',
    fetchedAt: '2026-11-13T00:00:00.000Z',
  };

  void it('accepts a page, empty or with unclaimed slugs, missing titles and covers', () => {
    assert.equal(isAnimeListPage(page), true);
    assert.equal(isAnimeListPage({ ...page, entries: [], nextCursor: 'c' }), true);
    assert.equal(
      isAnimeListPage({
        ...page,
        entries: [
          { ...entry, slug: null, titleEnglish: null, titleRomaji: null, coverImageUrl: null },
        ],
      }),
      true,
    );
  });

  void it('rejects an unknown kind, a malformed entry or a missing list', () => {
    for (const value of [
      ...NOT_OBJECTS,
      { ...page, kind: 'popular' },
      { ...page, entries: [{ ...entry, anilistId: '16498' }] },
      { ...page, entries: [{ ...entry, slug: 7 }] },
      { ...page, entries: [{ ...entry, titleEnglish: undefined }] },
      { ...page, nextCursor: 3 },
      { ...page, entries: undefined },
    ]) {
      assert.equal(isAnimeListPage(value), false, JSON.stringify(value));
    }
  });
});

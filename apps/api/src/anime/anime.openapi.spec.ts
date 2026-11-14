import type { INestApplication } from '@nestjs/common';
import { type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import type {
  AnimeDetails,
  AnimeListPage,
  AnimeSearchHit,
  FranchiseSeason,
} from '@otakuleague/shared-types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../testing/test-app';

/** Every AnimeDetails key, checked by the compiler: a new field must be listed here. */
const ANIME_DETAILS_KEYS = {
  id: true,
  canonicalSlug: true,
  externalIds: true,
  titleRomaji: true,
  titleEnglish: true,
  titleNative: true,
  synonyms: true,
  format: true,
  status: true,
  startDate: true,
  endDate: true,
  season: true,
  seasonYear: true,
  episodes: true,
  durationMinutes: true,
  synopsis: true,
  coverImageUrl: true,
  bannerImageUrl: true,
  trailer: true,
  genres: true,
  tags: true,
  studios: true,
  links: true,
  nextEpisode: true,
  creators: true,
  favourites: true,
  rankRated: true,
  rankPopular: true,
  coverColor: true,
  scores: true,
  attributions: true,
} satisfies Record<keyof AnimeDetails, true>;

const ANIME_LIST_PAGE_KEYS = {
  kind: true,
  season: true,
  entries: true,
  nextCursor: true,
  freshness: true,
  fetchedAt: true,
} satisfies Record<keyof AnimeListPage, true>;

interface Schema {
  properties?: Record<string, Schema & { $ref?: string; items?: Schema }>;
  nullable?: boolean;
  required?: string[];
}

describe('anime OpenAPI schema', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  const schema = (name: string): Schema =>
    document.components?.schemas?.[name] as Schema;

  beforeAll(async () => {
    app = await createTestApp();
    document = SwaggerModule.createDocument(app, {
      openapi: '3.0.0',
      info: { title: 'test', version: '0' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents every AnimeDetails field, all required', () => {
    const details = schema('AnimeDetailsSchema');
    const keys = Object.keys(ANIME_DETAILS_KEYS).toSorted();

    expect(Object.keys(details.properties ?? {}).toSorted()).toEqual(keys);
    expect(details.required?.toSorted()).toEqual(keys);
    expect(details.properties?.canonicalSlug?.nullable).toBe(true);
  });

  it('documents every AnimeListPage field, all required, and declares the list route before the two-segment anime route', () => {
    const page = schema('AnimeListPageSchema');
    const keys = Object.keys(ANIME_LIST_PAGE_KEYS).toSorted();

    expect(Object.keys(page.properties ?? {}).toSorted()).toEqual(keys);
    expect(page.required?.toSorted()).toEqual(keys);
    expect(page.properties?.nextCursor?.nullable).toBe(true);
    expect(page.properties?.season?.nullable).toBe(true);
    expect(page.properties?.entries?.items).toEqual({
      $ref: '#/components/schemas/AnimeListEntrySchema',
    });
    expect(
      Object.keys(document.paths['/anime/lists/{kind}']?.get?.responses ?? {}),
    ).toEqual(expect.arrayContaining(['200', '400', '429', '503']));
    const paths = Object.keys(document.paths);
    expect(paths).toContain('/anime/lists/{kind}');
    expect(paths.indexOf('/anime/lists/{kind}')).toBeLessThan(
      paths.indexOf('/anime/{idSource}/{externalId}'),
    );
  });

  it('gives each Sourced shape its own schema', () => {
    const tags = schema('SourcedTags').properties?.value;

    expect(tags?.items).toEqual({
      $ref: '#/components/schemas/AnimeTagSchema',
    });
    expect(Object.keys(schema('SourcedString').properties ?? {})).toEqual([
      'value',
      'source',
      'fetchedAt',
    ]);
  });

  it('documents both anime routes, the slug one answering a union', () => {
    const bySlug = document.paths['/anime/slugs/{slug}']?.get?.responses[
      '200'
    ] as { content: Record<string, { schema: unknown }> };

    expect(document.paths['/anime/{idSource}/{externalId}']).toBeDefined();
    expect(bySlug.content['application/json']?.schema).toMatchObject({
      oneOf: [
        { $ref: '#/components/schemas/AnimeBySlugAnimeSchema' },
        { $ref: '#/components/schemas/AnimeBySlugRedirectSchema' },
      ],
      discriminator: {
        propertyName: 'kind',
        mapping: {
          anime: '#/components/schemas/AnimeBySlugAnimeSchema',
          redirect: '#/components/schemas/AnimeBySlugRedirectSchema',
        },
      },
    });
    const params = (path: string) =>
      (document.paths[path]?.get?.parameters ?? []).map((param) =>
        'name' in param ? param.name : param.$ref,
      );
    expect(params('/anime/slugs/{slug}')).toEqual(['slug']);
    expect(params('/anime/{idSource}/{externalId}').toSorted()).toEqual([
      'externalId',
      'idSource',
    ]);
  });

  it('documents the search route and every hit field', () => {
    const hitKeys = {
      slug: true,
      ref: true,
      title: true,
      matchedTitle: true,
      format: true,
      episodes: true,
      season: true,
      seasonYear: true,
      startYear: true,
      coverImageUrl: true,
      coverColor: true,
      score: true,
    } satisfies Record<keyof AnimeSearchHit, true>;
    const params = (document.paths['/anime/search']?.get?.parameters ?? []).map(
      (param) => ('name' in param ? param.name : param.$ref),
    );

    expect(params.toSorted()).toEqual(['page', 'pageSize', 'q']);
    expect(
      Object.keys(schema('AnimeSearchHitSchema').properties ?? {}).toSorted(),
    ).toEqual(Object.keys(hitKeys).toSorted());
    expect(schema('AnimeSearchPageSchema').required?.toSorted()).toEqual([
      'hits',
      'page',
      'pageSize',
      'total',
    ]);
  });

  it('documents the franchise route and every season field', () => {
    const route = document.paths['/anime/slugs/{slug}/franchise']?.get;
    const ok = route?.responses['200'] as {
      content: Record<string, { schema: unknown }>;
    };
    const seasonKeys = {
      anilistId: true,
      mediaType: true,
      slug: true,
      imported: true,
      title: true,
      format: true,
      status: true,
      startDate: true,
      coverImageUrl: true,
      label: true,
      isCurrent: true,
    } satisfies Record<keyof FranchiseSeason, true>;
    // Swagger copies the inherited entry fields into the season schema.
    const season = schema('FranchiseSeasonSchema');

    expect(ok.content['application/json']?.schema).toEqual({
      $ref: '#/components/schemas/AnimeFranchiseSchema',
    });
    expect(Object.keys(season.properties ?? {}).toSorted()).toEqual(
      Object.keys(seasonKeys).toSorted(),
    );
  });
});

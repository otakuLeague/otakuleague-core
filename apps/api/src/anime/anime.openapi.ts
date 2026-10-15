import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger';
import {
  ANIME_DATA_SOURCES,
  ANIME_FORMATS,
  ANIME_ID_SOURCES,
  ANIME_SEASONS,
  ANIME_STATUSES,
  type AnimeAttribution,
  type AnimeBySlug,
  type AnimeDataSource,
  type AnimeDetails,
  type AnimeIdSource,
  type AnimeLink,
  type AnimeNextEpisode,
  type AnimeScore,
  type AnimeStudio,
  type AnimeTag,
  type AnimeTrailer,
  type PartialDate,
  type Sourced,
} from '@otakuleague/shared-types';

/**
 * OpenAPI schemas for the anime responses. Swagger cannot read the shared-types interfaces,
 * so each class `implements` its interface: a field added there fails the build here until
 * it is declared (its @ApiProperty is checked by anime.openapi.spec.ts for the top level
 * only). Response classes only, never used for validation.
 */

const NULLABLE_INTEGER = { nullable: true, type: 'integer' } as const;

class PartialDateSchema implements PartialDate {
  @ApiProperty({ type: 'integer' }) readonly year!: number;
  @ApiProperty(NULLABLE_INTEGER) readonly month!: number | null;
  @ApiProperty(NULLABLE_INTEGER) readonly day!: number | null;
}

class AnimeTagSchema implements AnimeTag {
  @ApiProperty() readonly name!: string;
  @ApiProperty({ ...NULLABLE_INTEGER, description: '0-100' }) readonly rank!:
    number | null;
  @ApiProperty() readonly spoiler!: boolean;
}

class AnimeStudioSchema implements AnimeStudio {
  @ApiProperty() readonly name!: string;
  @ApiProperty() readonly main!: boolean;
}

class AnimeLinkSchema implements AnimeLink {
  @ApiProperty() readonly site!: string;
  @ApiProperty() readonly url!: string;
  @ApiProperty({ enum: ['streaming', 'other'] }) readonly kind!:
    'streaming' | 'other';
}

class AnimeTrailerSchema implements AnimeTrailer {
  @ApiProperty({ enum: ['youtube', 'dailymotion'] }) readonly site!:
    'youtube' | 'dailymotion';
  @ApiProperty() readonly id!: string;
}

class AnimeNextEpisodeSchema implements AnimeNextEpisode {
  @ApiProperty({ type: 'integer' }) readonly episode!: number;
  @ApiProperty({ format: 'date-time' }) readonly airingAt!: string;
}

class AnimeScoreSchema implements AnimeScore {
  @ApiProperty({ enum: ANIME_DATA_SOURCES }) readonly source!: AnimeDataSource;
  @ApiProperty({ format: 'date-time' }) readonly fetchedAt!: string;
  @ApiProperty({ description: 'Out of `scale`; never averaged across sources' })
  readonly score!: number;
  @ApiProperty({ enum: [10, 100] }) readonly scale!: 10 | 100;
  @ApiProperty(NULLABLE_INTEGER) readonly scoredBy!: number | null;
  @ApiProperty(NULLABLE_INTEGER) readonly rank!: number | null;
  @ApiProperty(NULLABLE_INTEGER) readonly members!: number | null;
}

class AnimeAttributionSchema implements AnimeAttribution {
  @ApiProperty({ enum: ANIME_DATA_SOURCES }) readonly source!: AnimeDataSource;
  @ApiProperty() readonly url!: string;
  @ApiProperty({ format: 'date-time' }) readonly fetchedAt!: string;
}

class AnimeExternalIdSchema implements AnimeExternalId {
  @ApiProperty({ enum: ANIME_ID_SOURCES }) readonly source!: AnimeIdSource;
  @ApiProperty() readonly id!: string;
}

type AnimeExternalId = AnimeDetails['externalIds'][number];

const SOURCED_NAMES = new Set<string>();

/** One schema per Sourced<T> shape: OpenAPI has no generics. */
function sourced(name: string, value: ApiPropertyOptions): ApiPropertyOptions {
  class SourcedSchema {
    @ApiProperty(value) readonly value!: unknown;
    @ApiProperty({ enum: ANIME_DATA_SOURCES })
    readonly source!: AnimeDataSource;
    @ApiProperty({ format: 'date-time' }) readonly fetchedAt!: string;
  }
  // Swagger keys schemas by class name: a repeated name would silently replace the first.
  if (SOURCED_NAMES.has(name)) throw new Error(`Sourced${name} declared twice`);
  SOURCED_NAMES.add(name);
  Object.defineProperty(SourcedSchema, 'name', { value: `Sourced${name}` });
  return { type: SourcedSchema, nullable: true };
}

const SOURCED_STRING = sourced('String', { type: String });
const SOURCED_INTEGER = sourced('Integer', { type: 'integer' });
const SOURCED_STRINGS = sourced('Strings', { type: [String] });
const SOURCED_DATE = sourced('PartialDate', { type: PartialDateSchema });

export class AnimeDetailsSchema implements AnimeDetails {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null until the anime has an AniList identity (ADR 0007)',
  })
  readonly canonicalSlug!: string | null;
  @ApiProperty({ type: [AnimeExternalIdSchema] })
  readonly externalIds!: AnimeDetails['externalIds'];
  @ApiProperty(SOURCED_STRING) readonly titleRomaji!: Sourced<string> | null;
  @ApiProperty(SOURCED_STRING) readonly titleEnglish!: Sourced<string> | null;
  @ApiProperty(SOURCED_STRING) readonly titleNative!: Sourced<string> | null;
  @ApiProperty(SOURCED_STRINGS) readonly synonyms!: AnimeDetails['synonyms'];
  @ApiProperty(sourced('Format', { enum: ANIME_FORMATS }))
  readonly format!: AnimeDetails['format'];
  @ApiProperty(sourced('Status', { enum: ANIME_STATUSES }))
  readonly status!: AnimeDetails['status'];
  @ApiProperty(SOURCED_DATE) readonly startDate!: Sourced<PartialDate> | null;
  @ApiProperty(SOURCED_DATE) readonly endDate!: Sourced<PartialDate> | null;
  @ApiProperty(sourced('Season', { enum: ANIME_SEASONS }))
  readonly season!: AnimeDetails['season'];
  @ApiProperty(SOURCED_INTEGER) readonly seasonYear!: Sourced<number> | null;
  @ApiProperty(SOURCED_INTEGER) readonly episodes!: Sourced<number> | null;
  @ApiProperty(SOURCED_INTEGER)
  readonly durationMinutes!: Sourced<number> | null;
  @ApiProperty({ ...SOURCED_STRING, description: 'Plain text, never HTML' })
  readonly synopsis!: Sourced<string> | null;
  @ApiProperty(SOURCED_STRING) readonly coverImageUrl!: Sourced<string> | null;
  @ApiProperty(SOURCED_STRING) readonly bannerImageUrl!: Sourced<string> | null;
  @ApiProperty(sourced('Trailer', { type: AnimeTrailerSchema }))
  readonly trailer!: AnimeDetails['trailer'];
  @ApiProperty(SOURCED_STRINGS) readonly genres!: AnimeDetails['genres'];
  @ApiProperty(sourced('Tags', { type: [AnimeTagSchema] }))
  readonly tags!: AnimeDetails['tags'];
  @ApiProperty(sourced('Studios', { type: [AnimeStudioSchema] }))
  readonly studios!: AnimeDetails['studios'];
  @ApiProperty(sourced('Links', { type: [AnimeLinkSchema] }))
  readonly links!: AnimeDetails['links'];
  @ApiProperty(sourced('NextEpisode', { type: AnimeNextEpisodeSchema }))
  readonly nextEpisode!: AnimeDetails['nextEpisode'];
  @ApiProperty({ type: [AnimeScoreSchema] })
  readonly scores!: readonly AnimeScore[];
  @ApiProperty({ type: [AnimeAttributionSchema] })
  readonly attributions!: readonly AnimeAttribution[];
}

export class AnimeBySlugAnimeSchema implements Extract<
  AnimeBySlug,
  { kind: 'anime' }
> {
  @ApiProperty({ enum: ['anime'] }) readonly kind!: 'anime';
  @ApiProperty({ type: AnimeDetailsSchema }) readonly anime!: AnimeDetails;
}

export class AnimeBySlugRedirectSchema implements Extract<
  AnimeBySlug,
  { kind: 'redirect' }
> {
  @ApiProperty({ enum: ['redirect'] }) readonly kind!: 'redirect';
  @ApiProperty({ description: 'The web app answers a 301 to this slug' })
  readonly canonicalSlug!: string;
}

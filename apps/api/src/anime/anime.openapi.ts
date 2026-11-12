import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger';
import {
  ANIME_DATA_SOURCES,
  ANIME_FORMATS,
  ANIME_ID_SOURCES,
  ANIME_SEASONS,
  ANIME_STATUSES,
  ANIME_TITLE_KINDS,
  type AnimeAttribution,
  type AnimeBySlug,
  type AnimeDataSource,
  type AnimeDetails,
  type AnimeIdSource,
  type AnimeLink,
  type AnimeNextEpisode,
  type AnimeScore,
  type AnimeSearchHit,
  type AnimeSearchPage,
  type AnimeTitleKind,
  type AnimeStudio,
  type AnimeTag,
  type AnimeTrailer,
  type AnimeFranchise,
  type AnimeSlugResolution,
  FRANCHISE_RELATED_GROUPS,
  type FranchiseEntry,
  type FranchiseRelatedGroup,
  type FranchiseSeason,
  type MediaFormat,
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
  @ApiProperty({
    ...SOURCED_STRINGS,
    description:
      'Original creators ("Original Creator" / "Original Story" staff)',
  })
  readonly creators!: AnimeDetails['creators'];
  @ApiProperty({
    ...SOURCED_INTEGER,
    description: 'AniList users who favourited it (not MyAnimeList)',
  })
  readonly favourites!: Sourced<number> | null;
  @ApiProperty({
    ...SOURCED_INTEGER,
    description:
      'AniList all-time rank by score among anime of the same format; unrelated to scores[].rank',
  })
  readonly rankRated!: Sourced<number> | null;
  @ApiProperty({
    ...SOURCED_INTEGER,
    description:
      'AniList all-time rank by popularity among anime of the same format',
  })
  readonly rankPopular!: Sourced<number> | null;
  @ApiProperty({ ...SOURCED_STRING, description: 'Cover colour, "#rrggbb"' })
  readonly coverColor!: Sourced<string> | null;
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

const MEDIA_FORMATS = [
  ...ANIME_FORMATS,
  'MANGA',
  'NOVEL',
  'ONE_SHOT',
] satisfies readonly MediaFormat[];

class FranchiseEntrySchema implements FranchiseEntry {
  @ApiProperty({ type: 'integer' }) readonly anilistId!: number;
  @ApiProperty({ enum: ['ANIME', 'MANGA'] }) readonly mediaType!:
    'ANIME' | 'MANGA';
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Null until the anime is imported (link /anime/anilist/{id} then); always null for manga',
  })
  readonly slug!: string | null;
  @ApiProperty({ description: 'English, else romaji' }) readonly title!: string;
  @ApiProperty({ enum: MEDIA_FORMATS, nullable: true })
  readonly format!: MediaFormat | null;
  @ApiProperty({ enum: ANIME_STATUSES, nullable: true })
  readonly status!: FranchiseEntry['status'];
  @ApiProperty({ type: PartialDateSchema, nullable: true })
  readonly startDate!: PartialDate | null;
  @ApiProperty({ type: String, nullable: true })
  readonly coverImageUrl!: string | null;
}

class FranchiseSeasonSchema
  extends FranchiseEntrySchema
  implements FranchiseSeason
{
  @ApiProperty() readonly label!: string;
  @ApiProperty({ description: 'The entry the request named' })
  readonly isCurrent!: boolean;
}

class FranchiseRelatedGroupSchema implements FranchiseRelatedGroup {
  @ApiProperty({ enum: FRANCHISE_RELATED_GROUPS })
  readonly group!: FranchiseRelatedGroup['group'];
  @ApiProperty({
    type: [FranchiseEntrySchema],
    description: 'At most 50, by air date',
  })
  readonly entries!: readonly FranchiseEntry[];
  @ApiProperty({ type: 'integer' }) readonly total!: number;
}

export class AnimeFranchiseSchema implements AnimeFranchise {
  @ApiProperty({
    enum: ['complete', 'walking', 'partial', 'truncated', 'unavailable'],
    description:
      'walking: entries still being fetched, ask again later; partial: AniList just left an entry out, the list may be incomplete for a while; unavailable: AniList is switched off',
  })
  readonly state!: AnimeFranchise['state'];
  @ApiProperty({ type: [FranchiseSeasonSchema] })
  readonly mainLine!: readonly FranchiseSeason[];
  @ApiProperty({ type: [FranchiseRelatedGroupSchema] })
  readonly related!: readonly FranchiseRelatedGroup[];
}

export class AnimeSlugResolutionSchema implements AnimeSlugResolution {
  @ApiProperty({ type: 'integer' }) readonly anilistId!: number;
  @ApiProperty({ example: 'attack-on-titan' }) readonly canonicalSlug!: string;
}

type AnimeSearchRef = AnimeSearchHit['ref'];
type AnimeSearchMatchedTitle = AnimeSearchHit['matchedTitle'];
type AnimeSearchScore = NonNullable<AnimeSearchHit['score']>;

class AnimeSearchRefSchema implements AnimeSearchRef {
  @ApiProperty({ enum: ANIME_ID_SOURCES }) readonly source!: AnimeIdSource;
  @ApiProperty({ example: '16498' }) readonly id!: string;
}

class AnimeSearchMatchedTitleSchema implements AnimeSearchMatchedTitle {
  @ApiProperty({ enum: ANIME_TITLE_KINDS }) readonly kind!: AnimeTitleKind;
  @ApiProperty() readonly text!: string;
}

class AnimeSearchScoreSchema implements AnimeSearchScore {
  @ApiProperty({ enum: ANIME_DATA_SOURCES }) readonly source!: AnimeDataSource;
  @ApiProperty() readonly score!: number;
  @ApiProperty({ enum: [10, 100] }) readonly scale!: 10 | 100;
}

export class AnimeSearchHitSchema implements AnimeSearchHit {
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Canonical slug; null without an AniList identity: link by ref',
  })
  readonly slug!: string | null;
  @ApiProperty({ type: AnimeSearchRefSchema })
  readonly ref!: AnimeSearchHit['ref'];
  @ApiProperty({
    description: 'English, else romaji, else native, else the matched title',
  })
  readonly title!: string;
  @ApiProperty({ type: AnimeSearchMatchedTitleSchema })
  readonly matchedTitle!: AnimeSearchHit['matchedTitle'];
  @ApiProperty({ enum: ANIME_FORMATS, nullable: true })
  readonly format!: AnimeSearchHit['format'];
  @ApiProperty(NULLABLE_INTEGER) readonly episodes!: number | null;
  @ApiProperty({ enum: ANIME_SEASONS, nullable: true })
  readonly season!: AnimeSearchHit['season'];
  @ApiProperty(NULLABLE_INTEGER) readonly seasonYear!: number | null;
  @ApiProperty(NULLABLE_INTEGER) readonly startYear!: number | null;
  @ApiProperty({ type: String, nullable: true })
  readonly coverImageUrl!: string | null;
  @ApiProperty({ type: String, nullable: true })
  readonly coverColor!: string | null;
  @ApiProperty({ type: AnimeSearchScoreSchema, nullable: true })
  readonly score!: AnimeSearchHit['score'];
}

export class AnimeSearchPageSchema implements AnimeSearchPage {
  @ApiProperty({ type: [AnimeSearchHitSchema] })
  readonly hits!: readonly AnimeSearchHit[];
  @ApiProperty({ type: 'integer' }) readonly page!: number;
  @ApiProperty({ type: 'integer' }) readonly pageSize!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Anime matching the query, across all pages',
  })
  readonly total!: number;
}

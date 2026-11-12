import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiServiceUnavailableResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  ANIME_ID_SOURCES,
  ANIME_LIST_DEFAULT_LIMIT,
  ANIME_LIST_KINDS,
  ANIME_LIST_MAX_LIMIT,
  type AnimeBySlug,
  type AnimeDetails,
  type AnimeFranchise,
  type AnimeIdSource,
  type AnimeListKind,
  type AnimeListPage,
  type AnimeSlugResolution,
} from '@otakuleague/shared-types';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AnimeBySlugAnimeSchema,
  AnimeBySlugRedirectSchema,
  AnimeDetailsSchema,
  AnimeFranchiseSchema,
  AnimeListPageSchema,
  AnimeSlugResolutionSchema,
} from './anime.openapi';
import { AnimeListService } from './anime-list.service';
import { AnimeService } from './anime.service';
import { AnimeFranchiseService } from './franchise.service';

const ID_PATTERN = /^[1-9]\d{0,8}$/;
const SLUG_PATTERN = /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/;

class AnimeLookupParams {
  @ApiProperty({ enum: ANIME_ID_SOURCES })
  @IsIn(ANIME_ID_SOURCES, {
    message: `idSource must be one of: ${ANIME_ID_SOURCES.join(', ')}`,
  })
  readonly idSource!: AnimeIdSource;

  // Digits only, no sign, exponent, hex or padding: one URL per anime. 9 digits fit int4.
  @ApiProperty({ pattern: ID_PATTERN.source, example: '16498' })
  @Matches(ID_PATTERN, {
    message: 'externalId must be a positive integer of at most 9 digits',
  })
  readonly externalId!: string;
}

class AnimeSlugParams {
  // Any letter case: the lookup lowercases it, then redirects to the canonical spelling.
  @ApiProperty({
    maxLength: 80,
    pattern: SLUG_PATTERN.source,
    example: 'attack-on-titan',
  })
  @MaxLength(80)
  @Matches(SLUG_PATTERN, {
    message: 'slug must be letters and digits joined by single hyphens',
  })
  readonly slug!: string;
}

class AnimeListParams {
  @ApiProperty({ enum: ANIME_LIST_KINDS })
  @IsIn(ANIME_LIST_KINDS, {
    message: `kind must be one of: ${ANIME_LIST_KINDS.join(', ')}`,
  })
  readonly kind!: AnimeListKind;
}

class AnimeListQuery {
  @ApiPropertyOptional({
    description: 'The nextCursor of the previous page; opaque.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  readonly cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: ANIME_LIST_MAX_LIMIT,
    default: ANIME_LIST_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ANIME_LIST_MAX_LIMIT)
  readonly limit?: number;
}

@ApiTags('anime')
@ApiExtraModels(AnimeBySlugAnimeSchema, AnimeBySlugRedirectSchema)
@Controller('anime')
export class AnimeController {
  constructor(
    private readonly anime: AnimeService,
    private readonly franchises: AnimeFranchiseService,
    private readonly lists: AnimeListService,
  ) {}

  // Declared before ':idSource/:externalId': both have two segments.
  @Get('lists/:kind')
  @ApiOkResponse({
    type: AnimeListPageSchema,
    description:
      'One page of a catalog list (ADR 0016), from stored AniList pages. A stale page is served at once and refreshed in the background.',
  })
  @ApiBadRequestResponse({
    description: 'Unknown list, malformed cursor or limit out of range.',
  })
  @ApiServiceUnavailableResponse({
    description:
      'AniList is switched off, or we do not hold this page and AniList is down or rate-limited.',
  })
  getList(
    @Param() params: AnimeListParams,
    @Query() query: AnimeListQuery,
  ): Promise<AnimeListPage> {
    return this.lists.getList(params.kind, query.cursor, query.limit);
  }

  // Declared before ':idSource/:externalId': both have two segments, and Express takes the
  // first route that matches.
  @Get('slugs/:slug')
  @ApiOkResponse({
    description:
      'The anime when the slug is its canonical one; otherwise (alias, former canonical, other letter case) the canonical slug to redirect to.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(AnimeBySlugAnimeSchema) },
        { $ref: getSchemaPath(AnimeBySlugRedirectSchema) },
      ],
      discriminator: {
        propertyName: 'kind',
        mapping: {
          anime: getSchemaPath(AnimeBySlugAnimeSchema),
          redirect: getSchemaPath(AnimeBySlugRedirectSchema),
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Not a well-formed slug.' })
  @ApiNotFoundResponse({
    description: 'No anime has this slug, or it was removed.',
  })
  @ApiServiceUnavailableResponse({
    description:
      'The anime is not cached any more and its sources are down or rate-limited.',
  })
  getBySlug(@Param() params: AnimeSlugParams): Promise<AnimeBySlug> {
    return this.anime.getBySlug(params.slug);
  }

  // Three segments: cannot clash with the two-segment routes.
  @Get('slugs/:slug/resolve')
  @ApiOkResponse({
    type: AnimeSlugResolutionSchema,
    description:
      'Which anime a slug names (any slug of it, any letter case), from the database only: never an import, so it is fast even for a purged anime. The web app redirects to canonicalSlug before rendering.',
  })
  @ApiBadRequestResponse({ description: 'Not a well-formed slug.' })
  @ApiNotFoundResponse({
    description: 'No anime has this slug, or it was removed.',
  })
  resolveSlug(@Param() params: AnimeSlugParams): Promise<AnimeSlugResolution> {
    return this.anime.resolveSlug(params.slug);
  }

  @Get('slugs/:slug/franchise')
  @ApiOkResponse({
    type: AnimeFranchiseSchema,
    description:
      'The season selector and Related tab, from stored data only (ADR 0008). Any slug of the anime answers, without a redirect.',
  })
  @ApiBadRequestResponse({ description: 'Not a well-formed slug.' })
  @ApiNotFoundResponse({
    description: 'No anime has this slug, or it was removed.',
  })
  getFranchise(@Param() params: AnimeSlugParams): Promise<AnimeFranchise> {
    return this.franchises.getBySlug(params.slug);
  }

  @Get(':idSource/:externalId')
  @ApiOkResponse({
    type: AnimeDetailsSchema,
    description:
      'The core anime. Imported on first request; each field carries its source and fetch time; scores are listed per source.',
  })
  @ApiNotFoundResponse({
    description: 'No source knows this id, or it is adult content.',
  })
  @ApiServiceUnavailableResponse({
    description:
      'We do not have this anime yet and its sources are down or rate-limited.',
  })
  get(@Param() params: AnimeLookupParams): Promise<AnimeDetails> {
    return this.anime.getByExternalId({
      source: params.idSource,
      externalId: Number(params.externalId),
    });
  }
}

import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  ANIME_ID_SOURCES,
  type AnimeBySlug,
  type AnimeDetails,
  type AnimeFranchise,
  type AnimeIdSource,
} from '@otakuleague/shared-types';
import { IsIn, Matches, MaxLength } from 'class-validator';
import {
  AnimeBySlugAnimeSchema,
  AnimeBySlugRedirectSchema,
  AnimeDetailsSchema,
  AnimeFranchiseSchema,
} from './anime.openapi';
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

@ApiTags('anime')
@ApiExtraModels(AnimeBySlugAnimeSchema, AnimeBySlugRedirectSchema)
@Controller('anime')
export class AnimeController {
  constructor(
    private readonly anime: AnimeService,
    private readonly franchises: AnimeFranchiseService,
  ) {}

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

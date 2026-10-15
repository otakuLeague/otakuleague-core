import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ANIME_ID_SOURCES,
  type AnimeDetails,
  type AnimeIdSource,
} from '@otakuleague/shared-types';
import { IsIn, Matches } from 'class-validator';
import { AnimeService } from './anime.service';

class AnimeLookupParams {
  @IsIn(ANIME_ID_SOURCES, {
    message: `idSource must be one of: ${ANIME_ID_SOURCES.join(', ')}`,
  })
  readonly idSource!: AnimeIdSource;

  // Digits only, no sign, exponent, hex or padding: one URL per anime. 9 digits fit int4.
  @Matches(/^[1-9]\d{0,8}$/, {
    message: 'externalId must be a positive integer of at most 9 digits',
  })
  readonly externalId!: string;
}

@ApiTags('anime')
@Controller('anime')
export class AnimeController {
  constructor(private readonly anime: AnimeService) {}

  // No slugs yet (OTA-94): an anime is addressed by its AniList or MyAnimeList id.
  @Get(':idSource/:externalId')
  @ApiOkResponse({
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

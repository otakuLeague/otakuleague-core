import {
  Controller,
  Get,
  Header,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { UsernameAvailabilityResponse } from '@otakuleague/shared-types';
import { ApiException } from '../common/api.exception';
import type { ClientIpKey } from './auth-rate-limit-rules';
import { ClientIp, CredentialGuard } from './credential.guard';
import { SignUpService } from './sign-up.service';
import { UsernameAvailabilityQueryDto } from './username-availability.dto';

export const AVAILABILITY_LIMITED_MESSAGE =
  'Too many username checks. Try again later.';

/** ADR 0020 Addendum (1e-iii). In the auth module: it reads sign-up's own "taken" rule. */
@ApiTags('auth')
@Controller('users')
export class UsernameAvailabilityController {
  constructor(private readonly signUps: SignUpService) {}

  @Get('availability')
  // The web server only: a preview key is refused although this is a GET.
  @UseGuards(CredentialGuard)
  // A hint that can change at any submit: no cache may keep it.
  @Header('Cache-Control', 'no-store')
  @ApiHeader({
    name: 'X-Client-Ip',
    required: true,
    description: "The visitor's IP, as the web server saw it.",
  })
  @ApiOkResponse({
    description:
      '`available: false` when sign-up of this name would answer 409 now (a member, a pending sign-up or a held name, never says which). `true` is a hint, not a reservation.',
    schema: {
      type: 'object',
      required: ['available'],
      properties: { available: { type: 'boolean' } },
    },
  })
  @ApiBadRequestResponse({
    description:
      'VALIDATION_FAILED: a missing, repeated or malformed username, or an unknown parameter (no counter spent). BAD_REQUEST: no valid X-Client-Ip.',
  })
  @ApiForbiddenResponse({
    description:
      'INTERNAL_KEY_REQUIRED: a caller other than the production web server.',
  })
  @ApiTooManyRequestsResponse({
    description:
      'TOO_MANY_REQUESTS: 60 per IP (an IPv6 counts per /64) per minute, and 120 per IPv6 /48 per minute.',
  })
  @ApiServiceUnavailableResponse({ description: 'The database is down.' })
  async availability(
    @Query() query: UsernameAvailabilityQueryDto,
    @ClientIp() ip: ClientIpKey,
  ): Promise<UsernameAvailabilityResponse> {
    const outcome = await this.signUps.usernameAvailability({
      username: query.username,
      ip,
    });
    switch (outcome.kind) {
      case 'available':
        return { available: true };
      case 'taken':
        return { available: false };
      case 'rate_limited':
        throw new ApiException(
          HttpStatus.TOO_MANY_REQUESTS,
          { code: 'TOO_MANY_REQUESTS', message: AVAILABILITY_LIMITED_MESSAGE },
          { retryAfterSeconds: outcome.retryAfterSeconds },
        );
      default: {
        const unreachable: never = outcome;
        return unreachable;
      }
    }
  }
}

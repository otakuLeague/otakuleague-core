import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
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
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { EmailVerificationConfirmResponse } from '@otakuleague/shared-types';
import { ApiException } from '../common/api.exception';
import type { ClientIpKey } from './auth-rate-limit-rules';
import { ClientIp, CredentialGuard } from './credential.guard';
import { EmailVerificationConfirmDto } from './email-verification.dto';
import { EmailVerificationService } from './email-verification.service';

/** One answer for an unknown, malformed, used or expired token: never says which. */
export const AUTH_TOKEN_INVALID_MESSAGE =
  'This confirmation link is invalid or has expired.';
export const CONFIRM_PASSWORD_INVALID_MESSAGE = 'The password is incorrect.';
export const CONFIRM_LIMITED_MESSAGE =
  'Too many confirmation attempts. Try again later.';

@ApiTags('auth')
@Controller('auth/email-verification')
export class EmailVerificationController {
  constructor(private readonly verifications: EmailVerificationService) {}

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CredentialGuard)
  // The body can carry a session token: never in any cache (ADR 0015).
  @Header('Cache-Control', 'no-store')
  @ApiHeader({
    name: 'X-Client-Ip',
    required: true,
    description: "The visitor's IP, as the web server saw it.",
  })
  @ApiOkResponse({
    description:
      '`verified` (with `session` only when the bindingToken matched, else null), `already_verified` (never a session), or `confirmation_required` (no matching binding and no password: nothing consumed).',
    schema: {
      type: 'object',
      required: ['outcome'],
      properties: {
        outcome: {
          type: 'string',
          enum: ['verified', 'already_verified', 'confirmation_required'],
        },
        session: {
          type: 'object',
          nullable: true,
          required: ['sessionToken', 'expiresAt'],
          properties: {
            sessionToken: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
            expiresAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'AUTH_TOKEN_INVALID: an unknown, malformed, used or expired token. VALIDATION_FAILED: a missing, null or over-long field, or an unknown field. BAD_REQUEST: no valid X-Client-Ip.',
  })
  @ApiUnauthorizedResponse({
    description:
      'INVALID_CREDENTIALS: the password does not match the pending sign-up; nothing consumed.',
  })
  @ApiForbiddenResponse({
    description:
      'INTERNAL_KEY_REQUIRED: a caller other than the production web server.',
  })
  @ApiTooManyRequestsResponse({
    description:
      'TOO_MANY_REQUESTS: 10 per IP per 15 min, or 10 password checks per account per hour. AUTH_BUSY: too many passwords being checked (Retry-After 1).',
  })
  @ApiServiceUnavailableResponse({ description: 'The database is down.' })
  async confirm(
    @Body() body: EmailVerificationConfirmDto,
    @ClientIp() ip: ClientIpKey,
  ): Promise<EmailVerificationConfirmResponse> {
    const outcome = await this.verifications.confirm({
      token: body.token,
      bindingToken: body.bindingToken,
      password: body.password,
      ip,
    });
    switch (outcome.kind) {
      case 'verified':
        return {
          outcome: 'verified',
          session:
            outcome.session === null
              ? null
              : {
                  sessionToken: outcome.session.sessionToken,
                  expiresAt: outcome.session.expiresAt.toISOString(),
                },
        };
      case 'already_verified':
      case 'confirmation_required':
        return { outcome: outcome.kind };
      case 'token_invalid':
        throw new ApiException(HttpStatus.BAD_REQUEST, {
          code: 'AUTH_TOKEN_INVALID',
          message: AUTH_TOKEN_INVALID_MESSAGE,
        });
      case 'invalid_credentials':
        throw new ApiException(HttpStatus.UNAUTHORIZED, {
          code: 'INVALID_CREDENTIALS',
          message: CONFIRM_PASSWORD_INVALID_MESSAGE,
        });
      case 'rate_limited':
        throw new ApiException(
          HttpStatus.TOO_MANY_REQUESTS,
          { code: 'TOO_MANY_REQUESTS', message: CONFIRM_LIMITED_MESSAGE },
          { retryAfterSeconds: outcome.retryAfterSeconds },
        );
      default: {
        const unreachable: never = outcome;
        return unreachable;
      }
    }
  }
}

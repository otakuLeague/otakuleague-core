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
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { SignInResponse, SignUpResponse } from '@otakuleague/shared-types';
import { ApiException } from '../common/api.exception';
import type { ClientIpKey } from './auth-rate-limit-rules';
import { ClientIp, CredentialGuard } from './credential.guard';
import { CurrentSession, SessionGuard } from './session.guard';
import { type SignedInSession, SessionService } from './session.service';
import { SignInDto } from './sign-in.dto';
import { SignInService } from './sign-in.service';
import { SignUpDto } from './sign-up.dto';
import { SignUpService } from './sign-up.service';
import { SIGN_UP_CLOSED_MESSAGE } from './sign-up-rules';

/** The one sign-in failure: unknown account, unverified email and wrong password alike (ADR 0015). */
export const INVALID_CREDENTIALS_MESSAGE =
  'The email, username or password is incorrect.';

export const SIGN_IN_LIMITED_MESSAGE =
  'Too many sign-in attempts. Try again later.';

function invalidCredentials(): ApiException {
  return new ApiException(HttpStatus.UNAUTHORIZED, {
    code: 'INVALID_CREDENTIALS',
    message: INVALID_CREDENTIALS_MESSAGE,
  });
}

function signInLimited(retryAfterSeconds: number): ApiException {
  return new ApiException(
    HttpStatus.TOO_MANY_REQUESTS,
    { code: 'TOO_MANY_REQUESTS', message: SIGN_IN_LIMITED_MESSAGE },
    { retryAfterSeconds },
  );
}

export const USERNAME_TAKEN_MESSAGE = 'This username is taken.';
export const SIGN_UP_LIMITED_MESSAGE =
  'Too many sign-up attempts. Try again later.';

function signUpError(
  status: HttpStatus,
  code: 'USERNAME_TAKEN' | 'TOO_MANY_REQUESTS' | 'SIGN_UP_CLOSED',
  message: string,
  retryAfterSeconds?: number,
): ApiException {
  return new ApiException(status, { code, message }, { retryAfterSeconds });
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly signIns: SignInService,
    private readonly signUps: SignUpService,
    private readonly sessions: SessionService,
  ) {}

  @Post('sign-up')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(CredentialGuard)
  // The body carries the bindingToken: never in any cache (ADR 0020).
  @Header('Cache-Control', 'no-store')
  @ApiHeader({
    name: 'X-Client-Ip',
    required: true,
    description: "The visitor's IP, as the web server saw it.",
  })
  @ApiAcceptedResponse({
    description:
      'The same answer for a new, a pending and a registered email; the email (verification, or a notice to the owner) leaves afterwards.',
    schema: {
      type: 'object',
      required: ['bindingToken'],
      properties: {
        bindingToken: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'VALIDATION_FAILED: a username, email or password outside the rules, or an unknown field. BAD_REQUEST: no valid X-Client-Ip.',
  })
  @ApiConflictResponse({
    description:
      'USERNAME_TAKEN: a member or a pending sign-up has it, a submit holds it (24 h), or the name is reserved.',
  })
  @ApiForbiddenResponse({
    description:
      'INTERNAL_KEY_REQUIRED: a caller other than the production web server. SIGN_UP_CLOSED: no email provider yet, so no account is created.',
  })
  @ApiTooManyRequestsResponse({
    description:
      'TOO_MANY_REQUESTS: 5 submits per IP (an IPv6 counts per /64) per hour, and 30 per IPv6 /48 per hour. AUTH_BUSY: too many passwords being hashed (Retry-After 1).',
  })
  @ApiServiceUnavailableResponse({ description: 'The database is down.' })
  async signUp(
    @Body() body: SignUpDto,
    @ClientIp() ip: ClientIpKey,
  ): Promise<SignUpResponse> {
    const outcome = await this.signUps.signUp({
      username: body.username,
      email: body.email,
      password: body.password,
      ip,
    });
    switch (outcome.kind) {
      case 'accepted':
        return { bindingToken: outcome.bindingToken };
      case 'username_taken':
        throw signUpError(
          HttpStatus.CONFLICT,
          'USERNAME_TAKEN',
          USERNAME_TAKEN_MESSAGE,
        );
      case 'rate_limited':
        throw signUpError(
          HttpStatus.TOO_MANY_REQUESTS,
          'TOO_MANY_REQUESTS',
          SIGN_UP_LIMITED_MESSAGE,
          outcome.retryAfterSeconds,
        );
      case 'closed':
        throw signUpError(
          HttpStatus.FORBIDDEN,
          'SIGN_UP_CLOSED',
          SIGN_UP_CLOSED_MESSAGE,
        );
      default: {
        const unreachable: never = outcome;
        return unreachable;
      }
    }
  }

  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CredentialGuard)
  // The body carries a session token: never in any cache (ADR 0015).
  @Header('Cache-Control', 'no-store')
  @ApiHeader({
    name: 'X-Client-Ip',
    required: true,
    description: "The visitor's IP, as the web server saw it.",
  })
  @ApiOkResponse({
    description:
      'Signed in: a new session. Needs the production internal key (a web caller).',
    schema: {
      type: 'object',
      required: ['sessionToken', 'expiresAt'],
      properties: {
        sessionToken: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
        expiresAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'VALIDATION_FAILED: an empty, over-long or non-string field, or an unknown field. BAD_REQUEST: no valid X-Client-Ip.',
  })
  @ApiUnauthorizedResponse({
    description:
      'INVALID_CREDENTIALS: one answer for an unknown account, an unverified email and a wrong password.',
  })
  @ApiForbiddenResponse({
    description:
      'INTERNAL_KEY_REQUIRED: a caller other than the production web server.',
  })
  @ApiTooManyRequestsResponse({
    description:
      'TOO_MANY_REQUESTS: 30 attempts per IP or 5 per (identifier, IP) in 15 min, or 30 per identifier in 1 h, counted whether or not the account exists. AUTH_BUSY: too many passwords being checked (Retry-After 1).',
    headers: {
      'Retry-After': {
        description: 'Seconds until the window that refused ends.',
        schema: { type: 'integer', minimum: 1, maximum: 3600 },
      },
    },
  })
  @ApiServiceUnavailableResponse({ description: 'The database is down.' })
  async signIn(
    @Body() body: SignInDto,
    @ClientIp() ip: ClientIpKey,
  ): Promise<SignInResponse> {
    const outcome = await this.signIns.signIn({
      identifier: body.identifier,
      password: body.password,
      ip,
    });
    switch (outcome.kind) {
      case 'signed_in':
        return {
          sessionToken: outcome.sessionToken,
          expiresAt: outcome.expiresAt.toISOString(),
        };
      case 'invalid_credentials':
        throw invalidCredentials();
      case 'rate_limited':
        throw signInLimited(outcome.retryAfterSeconds);
      default: {
        const unreachable: never = outcome;
        return unreachable;
      }
    }
  }

  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  @ApiNoContentResponse({
    description:
      'The Bearer session is deleted: the next request with its token gets 401. Other sessions of the member stay.',
  })
  @ApiUnauthorizedResponse({
    description:
      'UNAUTHORIZED: no, malformed, unknown, expired or revoked session (a second sign-out included).',
  })
  @ApiForbiddenResponse({
    description:
      'INTERNAL_KEY_REQUIRED: a caller other than the production web server.',
  })
  @ApiServiceUnavailableResponse({ description: 'The database is down.' })
  async signOut(@CurrentSession() session: SignedInSession): Promise<void> {
    await this.sessions.delete(session.sessionId);
  }

  @Post('sign-out-everywhere')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  @ApiNoContentResponse({
    description:
      "Every session of the Bearer session's member is ended, that one included, and the member's epoch is raised: the next request with any of their tokens gets 401. No new session is issued.",
  })
  @ApiUnauthorizedResponse({
    description:
      'UNAUTHORIZED: no, malformed, unknown, expired or revoked session (a replay included).',
  })
  @ApiForbiddenResponse({
    description:
      'INTERNAL_KEY_REQUIRED: a caller other than the production web server.',
  })
  @ApiServiceUnavailableResponse({ description: 'The database is down.' })
  async signOutEverywhere(
    @CurrentSession() session: SignedInSession,
  ): Promise<void> {
    await this.sessions.signOutEverywhere(
      session.userId,
      session.sessionEpoch,
    );
  }
}

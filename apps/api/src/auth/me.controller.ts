import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { MeResponse } from '@otakuleague/shared-types';
import { CurrentSession, SessionGuard } from './session.guard';
import type { SignedInSession } from './session.service';

@ApiTags('auth')
@Controller('me')
export class MeController {
  @Get()
  @UseGuards(SessionGuard)
  // A member's identity must never sit in a shared cache (ADR 0015).
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({
    description:
      'The member of the Bearer session. Needs the production internal key (a web caller).',
    schema: {
      type: 'object',
      required: ['id', 'username'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        username: { type: 'string' },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description:
      'UNAUTHORIZED: no, malformed, unknown, expired or revoked session, or a caller other than the web server.',
  })
  @ApiServiceUnavailableResponse({ description: 'The database is down.' })
  getMe(@CurrentSession() session: SignedInSession): MeResponse {
    return { id: session.userId, username: session.username };
  }
}

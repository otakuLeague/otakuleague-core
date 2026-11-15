import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { callerOf } from '../common/api-caller';
import { ApiException } from '../common/api.exception';
import { internalKeyRequired } from '../common/internal-key.guard';
import { sessionTokenFromHeader } from './session-rules';
import { type SignedInSession, SessionService } from './session.service';

/** One answer for every refusal: a caller learns nothing from the difference (ADR 0015). */
export const SESSION_REQUIRED_MESSAGE = 'Sign in to continue.';

function unauthorized(): ApiException {
  return new ApiException(HttpStatus.UNAUTHORIZED, {
    code: 'UNAUTHORIZED',
    message: SESSION_REQUIRED_MESSAGE,
  });
}

/** Request -> session, written only by SessionGuard: no header or body can write here. */
const signedInSessions = new WeakMap<object, SignedInSession>();

/** The session SessionGuard resolved. Throws (500) on a route without the guard. */
export function currentSessionOf(request: object): SignedInSession {
  const session = signedInSessions.get(request);
  if (session === undefined) {
    throw new Error('No session recorded for this request');
  }
  return session;
}

/** Handler parameter: the signed-in session of this request (SessionGuard required). */
export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SignedInSession =>
    currentSessionOf(context.switchToHttp().getRequest<object>()),
);

/**
 * Route guard (`@UseGuards(SessionGuard)`), after the global InternalKeyGuard. Only a `web`
 * caller (production key matched) may present a session, all without a lookup otherwise: `open`
 * (no key configured) gets 403 INTERNAL_KEY_REQUIRED, so a key missing on the API never looks
 * like a sign-out and the web keeps the cookie (ADR 0017); `preview` and a missing or malformed
 * header get the 401. Database errors are not caught: the filter answers 503, never 401.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const caller = callerOf(request);
    if (caller.kind === 'open') throw internalKeyRequired();
    if (caller.kind !== 'web') throw unauthorized();
    const token = sessionTokenFromHeader(request.headers.authorization);
    if (token === null) throw unauthorized();
    const resolution = await this.sessions.resolve(token);
    if (resolution.kind === 'signed_out') throw unauthorized();
    signedInSessions.set(request, resolution.session);
    return true;
  }
}

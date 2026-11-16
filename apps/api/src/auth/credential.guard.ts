import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { callerOf } from '../common/api-caller';
import { ApiException } from '../common/api.exception';
import { internalKeyRequired } from '../common/internal-key.guard';
import { type ClientIpKey, clientIpKey } from './auth-rate-limit-rules';

/** Never names or echoes the value: it is a client IP. */
export const CLIENT_IP_REQUIRED_MESSAGE =
  'A valid X-Client-Ip header is required.';

function clientIpRequired(): ApiException {
  return new ApiException(HttpStatus.BAD_REQUEST, {
    code: 'BAD_REQUEST',
    message: CLIENT_IP_REQUIRED_MESSAGE,
  });
}

/** Request -> client IP, written only by CredentialGuard: no header or body can write here. */
const clientIps = new WeakMap<object, ClientIpKey>();

/** The client IP CredentialGuard accepted. Throws (500) on a route without the guard. */
export function clientIpOf(request: object): ClientIpKey {
  const ip = clientIps.get(request);
  if (ip === undefined) {
    throw new Error('No client IP recorded for this request');
  }
  return ip;
}

/** Handler parameter: the client IP of this request (CredentialGuard required). */
export const ClientIp = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ClientIpKey =>
    clientIpOf(context.switchToHttp().getRequest<object>()),
);

/**
 * Route guard for a credential route (`@UseGuards(CredentialGuard)`), after the global
 * InternalKeyGuard and before validation, so a refusal here costs no counter and no hash. Only a
 * `web` caller (production key matched) gets through: `open` and `preview` get 403
 * INTERNAL_KEY_REQUIRED (ADR 0015: previews never see a password). A `web` caller without a
 * usable X-Client-Ip (the shared `unknown` bucket) gets 400: it is never counted in a bucket
 * every such caller shares, and never let through uncounted.
 */
@Injectable()
export class CredentialGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<object>();
    const caller = callerOf(request);
    if (caller.kind !== 'web') throw internalKeyRequired();
    const ip = clientIpKey(caller.visitorKey);
    if (ip === null) throw clientIpRequired();
    clientIps.set(request, ip);
    return true;
  }
}

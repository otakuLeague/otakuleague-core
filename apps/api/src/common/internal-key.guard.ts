import { createHash, timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  SetMetadata,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  type EnvironmentVariables,
  INTERNAL_API_KEY_MIN_LENGTH,
} from '../config/environment';
import { captureStartupWarning } from '../observability/sentry';
import {
  CLIENT_IP_HEADER,
  OPEN_CALLER,
  PREVIEW_CALLER,
  recordCaller,
  visitorKeyFromClientIp,
} from './api-caller';
import { ApiException } from './api.exception';

/** Lower case: Node lower-cases incoming header names. Sent as X-Internal-Api-Key. */
export const INTERNAL_API_KEY_HEADER = 'x-internal-api-key';

/** Longer values are refused unhashed; a valid key is at most 128 characters. */
export const MAX_INTERNAL_KEY_HEADER_LENGTH = 512;

export const PUBLIC_ROUTE_METADATA = 'otakuleague:public-route';

/** This handler answers without the internal key. Only GET /health (ADR 0019); a test lists them. */
export function PublicRoute(): MethodDecorator {
  return SetMetadata(PUBLIC_ROUTE_METADATA, true);
}

/** Whether routes need the internal key: `open` only while none is configured (ADR 0019). */
export type InternalKeyCheck =
  | { readonly kind: 'open' }
  | {
      readonly kind: 'enforced';
      readonly acceptedKeys: readonly [string, ...string[]];
      /** Vercel previews' key: passes as a `preview` caller, never as `web`. */
      readonly previewKey?: string;
    };

/** The accepted keys; tests replace this provider with their own values. */
export abstract class InternalKeySettings {
  abstract get(): InternalKeyCheck;
}

/** Logged and sent to Sentry once at start; no ":" or "=" right after a name (log redaction). */
export const OPEN_IN_PRODUCTION_WARNING =
  'INTERNAL_API_KEY is not set: the API answers any caller';

function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

/**
 * Validated at boot (`environment.ts`); an empty value counts as unset. The preview key alone
 * changes nothing: the check stays open and the preview key is dropped.
 */
function configuredKeys(
  values: readonly (string | undefined)[],
  previewKey: string | undefined,
): InternalKeyCheck {
  const [first, ...rest] = values.filter(isSet);
  if (first === undefined) return { kind: 'open' };
  const acceptedKeys: [string, ...string[]] = [first, ...rest];
  return isSet(previewKey)
    ? { kind: 'enforced', acceptedKeys, previewKey }
    : { kind: 'enforced', acceptedKeys };
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Both sides are SHA-256 digests, so timingSafeEqual always compares 32 bytes and neither
 * the key's length nor its content leaks through timing. Every key is compared: no early exit.
 * Too short for a valid key is refused too, so an empty accepted key could never match "".
 */
export function isAcceptedKey(
  header: string | readonly string[] | undefined,
  acceptedDigests: readonly Buffer[],
): boolean {
  if (
    typeof header !== 'string' ||
    header.length < INTERNAL_API_KEY_MIN_LENGTH ||
    header.length > MAX_INTERNAL_KEY_HEADER_LENGTH
  ) {
    return false;
  }
  const presented = sha256(header);
  return acceptedDigests.reduce(
    (accepted, digest) => timingSafeEqual(presented, digest) || accepted,
    false,
  );
}

type GuardState =
  | { readonly kind: 'open' }
  | {
      readonly kind: 'enforced';
      readonly acceptedDigests: readonly Buffer[];
      readonly previewDigest: Buffer | null;
    };

/** Global guard (APP_GUARD): every route needs the internal key once one is configured. */
@Injectable()
export class InternalKeyGuard implements CanActivate {
  private readonly state: GuardState;

  constructor(
    private readonly reflector: Reflector,
    settings: InternalKeySettings,
  ) {
    const check = settings.get();
    // Digests only: the raw keys are never kept or compared here.
    this.state =
      check.kind === 'open'
        ? check
        : {
            kind: 'enforced',
            acceptedDigests: check.acceptedKeys.map(sha256),
            previewDigest:
              check.previewKey === undefined ? null : sha256(check.previewKey),
          };
  }

  /**
   * Also records who is calling (ADR 0019 item 7): `open` while no key is configured, without
   * reading X-Client-Ip; `web` with its visitor key once the key matched; `preview` for the
   * preview key, without reading X-Client-Ip (preview code is unreviewed). A @PublicRoute()
   * handler (in either mode) and a refused request record nothing.
   */
  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.get<unknown>(
        PUBLIC_ROUTE_METADATA,
        context.getHandler(),
      ) === true
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    if (this.state.kind === 'open') {
      recordCaller(request, OPEN_CALLER);
      return true;
    }
    const { headers } = request;
    const presented = headers[INTERNAL_API_KEY_HEADER];
    if (isAcceptedKey(presented, this.state.acceptedDigests)) {
      // Trusted only now: the key proves the web server wrote this header, not a browser.
      recordCaller(request, {
        kind: 'web',
        visitorKey: visitorKeyFromClientIp(headers[CLIENT_IP_HEADER]),
      });
      return true;
    }
    const { previewDigest } = this.state;
    if (previewDigest !== null && isAcceptedKey(presented, [previewDigest])) {
      recordCaller(request, PREVIEW_CALLER);
      return true;
    }
    // One answer for missing, wrong, repeated and over-long: a prober learns nothing from the
    // difference. 403, never 401: on this API a 401 will mean "signed out" (ADR 0015, 0017).
    throw new ApiException(HttpStatus.FORBIDDEN, {
      code: 'INTERNAL_KEY_REQUIRED',
      message: 'This API answers only the OtakuLeague web server.',
    });
  }
}

@Injectable()
export class EnvironmentInternalKeySettings
  extends InternalKeySettings
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(EnvironmentInternalKeySettings.name);
  private readonly check: InternalKeyCheck;
  private readonly production: boolean;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super();
    this.check = configuredKeys(
      [
        config.get('INTERNAL_API_KEY', { infer: true }),
        config.get('INTERNAL_API_KEY_PREVIOUS', { infer: true }),
      ],
      config.get('INTERNAL_API_KEY_PREVIEW', { infer: true }),
    );
    this.production = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  get(): InternalKeyCheck {
    return this.check;
  }

  // Production still starts unless INTERNAL_API_KEY_REQUIRED=true (environment.ts): a refused
  // boot would fail Railway's health gate on every deploy. Never logs the key or a header, only
  // that none is set. Sentry too, so an API reopened by a deleted variable raises an issue.
  onApplicationBootstrap(): void {
    if (this.production && this.check.kind === 'open') {
      this.logger.warn(OPEN_IN_PRODUCTION_WARNING);
      captureStartupWarning(OPEN_IN_PRODUCTION_WARNING);
    }
  }
}

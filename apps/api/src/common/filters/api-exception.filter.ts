import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiError, ApiErrorCode } from '@otakuleague/shared-types';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { captureServerError } from '../../observability/sentry';
import { ApiException } from '../api.exception';

export interface ErrorResponse {
  readonly status: number;
  readonly body: ApiError;
}

const CLIENT_ERROR_CODES: Readonly<
  Partial<Record<number, Exclude<ApiErrorCode, 'VALIDATION_FAILED'>>>
> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
};

// Documented "can't reach / lost the database" codes.
const UNAVAILABLE_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1017', 'P2024']);

// With a driver adapter, connection failures arrive as P2010 (raw query) with
// the adapter's error kind in meta, not as the codes above (checked on 7.10.0).
const UNAVAILABLE_ADAPTER_KINDS = new Set([
  'DatabaseNotReachable',
  'ConnectionClosed',
  'SocketTimeout',
  'TooManyConnections',
  'TlsConnectionError',
  'AuthenticationFailed',
  'DatabaseDoesNotExist',
  'DatabaseAccessDenied',
]);

// pg raises a bare Error when connectionTimeoutMillis expires; nothing else identifies it.
const PG_CONNECT_TIMEOUT_MESSAGE =
  'Connection terminated due to connection timeout';

function driverAdapterErrorKind(meta: unknown): unknown {
  if (typeof meta !== 'object' || meta === null) return undefined;
  const adapterError: unknown = Reflect.get(meta, 'driverAdapterError');
  if (typeof adapterError !== 'object' || adapterError === null) {
    return undefined;
  }
  const cause: unknown = Reflect.get(adapterError, 'cause');
  if (typeof cause !== 'object' || cause === null) return undefined;
  return Reflect.get(cause, 'kind');
}

export function isDatabaseUnavailable(exception: unknown): boolean {
  if (exception instanceof Prisma.PrismaClientInitializationError) return true;
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    const kind = driverAdapterErrorKind(exception.meta);
    return (
      UNAVAILABLE_PRISMA_CODES.has(exception.code) ||
      (typeof kind === 'string' && UNAVAILABLE_ADAPTER_KINDS.has(kind))
    );
  }
  return (
    exception instanceof Error &&
    exception.message === PG_CONNECT_TIMEOUT_MESSAGE
  );
}

const SERVICE_UNAVAILABLE: ErrorResponse = {
  status: HttpStatus.SERVICE_UNAVAILABLE,
  body: {
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'The service is temporarily unavailable. Try again later.',
    },
  },
};

const INTERNAL_ERROR: ErrorResponse = {
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  body: {
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  },
};

/** Maps any thrown value to the envelope. Server faults never expose their message. */
export function toErrorResponse(exception: unknown): ErrorResponse {
  if (exception instanceof ApiException) {
    return { status: exception.getStatus(), body: { error: exception.error } };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status === SERVICE_UNAVAILABLE.status) return SERVICE_UNAVAILABLE;
    // Written as a positive range so NaN or a 3xx falls through to 500.
    if (!(status >= 400 && status <= 499)) return INTERNAL_ERROR;
    return {
      status,
      body: {
        error: {
          code: CLIENT_ERROR_CODES[status] ?? 'CLIENT_ERROR',
          message: exception.message,
        },
      },
    };
  }
  if (isDatabaseUnavailable(exception)) return SERVICE_UNAVAILABLE;
  return INTERNAL_ERROR;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = toErrorResponse(exception);
    const http = host.switchToHttp();
    if (status >= 500) {
      // The real cause stays server-side; the client only gets the generic body.
      this.logger.error(
        exception instanceof Error ? exception.message : String(exception),
        exception instanceof Error ? exception.stack : undefined,
      );
    }
    // Only real faults: a 503 means the database is down, once per request during an outage (ADR 0004).
    if (status === INTERNAL_ERROR.status) {
      captureServerError(exception, http.getRequest<Request>());
    }
    const response = http.getResponse<Response>();
    if (response.headersSent) {
      // Too late for an envelope; close the response so the client is not left hanging.
      response.end();
      return;
    }
    response.status(status).json(body);
  }
}

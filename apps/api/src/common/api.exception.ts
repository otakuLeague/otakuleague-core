import { HttpException, type HttpStatus } from '@nestjs/common';
import type { ApiError } from '@otakuleague/shared-types';

/** Typed extras the filter turns into response headers; no free-form headers (ADR 0019). */
export interface ApiExceptionOptions {
  /** Sent as `Retry-After` (seconds) when a positive integer; anything else sends no header. */
  readonly retryAfterSeconds?: number;
}

/** An error whose envelope is safe to send to the client as-is. */
export class ApiException extends HttpException {
  readonly retryAfterSeconds: number | undefined;

  constructor(
    status: HttpStatus,
    readonly error: ApiError['error'],
    options: ApiExceptionOptions = {},
  ) {
    super(error.message, status);
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

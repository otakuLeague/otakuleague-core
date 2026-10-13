import { HttpException, type HttpStatus } from '@nestjs/common';
import type { ApiError } from '@otakuleague/shared-types';

/** An error whose envelope is safe to send to the client as-is. */
export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly error: ApiError['error'],
  ) {
    super(error.message, status);
  }
}

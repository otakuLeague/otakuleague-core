import { HttpException, HttpStatus } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ApiException } from './api.exception';

interface BodyParserError {
  readonly type: string;
  readonly status: number;
  readonly message: string;
}

// body-parser errors are http-errors objects tagged with a `type`.
function isBodyParserError(error: unknown): error is BodyParserError {
  return (
    error instanceof Error &&
    'type' in error &&
    typeof error.type === 'string' &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status <= 599
  );
}

/**
 * Express adapter that keeps body-parser failures distinguishable. The stock
 * adapter turns invalid JSON into a plain BadRequestException (losing the cause)
 * and passes the others (413, 415) through raw, where they would become 500s.
 */
export class ApiExpressAdapter extends ExpressAdapter {
  override mapException(error: unknown): unknown {
    if (!isBodyParserError(error)) {
      return super.mapException(error);
    }
    if (error.type === 'entity.parse.failed') {
      return new ApiException(HttpStatus.BAD_REQUEST, {
        code: 'MALFORMED_REQUEST',
        message: 'Request body must be valid JSON (an object or an array).',
      });
    }
    return new HttpException(error.message, error.status);
  }
}

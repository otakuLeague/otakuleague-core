import { BadRequestException, HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ApiExpressAdapter } from './api-express.adapter';
import { ApiException } from './api.exception';
import { toErrorResponse } from './filters/api-exception.filter';

// Shaped like body-parser's http-errors: an Error tagged with `type` and `status`.
function bodyParserError(
  type: string,
  status: number,
  message: string,
  base: Error = new Error(message),
): Error {
  return Object.assign(base, { type, status, expose: status < 500 });
}

const adapter = new ApiExpressAdapter();

describe('ApiExpressAdapter.mapException', () => {
  it('maps invalid JSON to 400 MALFORMED_REQUEST without the parser message', () => {
    const mapped = adapter.mapException(
      bodyParserError(
        'entity.parse.failed',
        400,
        'Unexpected end of JSON input',
        new SyntaxError('Unexpected end of JSON input'),
      ),
    );

    expect(mapped).toBeInstanceOf(ApiException);
    expect(toErrorResponse(mapped)).toEqual({
      status: 400,
      body: {
        error: {
          code: 'MALFORMED_REQUEST',
          message: 'Request body must be valid JSON (an object or an array).',
        },
      },
    });
  });

  it.each([
    ['entity.too.large', 413, 'request entity too large'],
    ['charset.unsupported', 415, 'unsupported charset "LATIN-9"'],
    ['encoding.unsupported', 415, 'unsupported content encoding "br"'],
    ['request.aborted', 400, 'request aborted'],
  ])(
    'keeps the status and message of the body-parser error %s',
    (type, status, message) => {
      const mapped = adapter.mapException(
        bodyParserError(type, status, message),
      );

      expect(mapped).toBeInstanceOf(HttpException);
      expect(mapped).not.toBeInstanceOf(ApiException);
      expect((mapped as HttpException).getStatus()).toBe(status);
      expect((mapped as HttpException).message).toBe(message);
    },
  );

  it('turns a 5xx body-parser error into the generic 500 envelope', () => {
    const mapped = adapter.mapException(
      bodyParserError('stream.not.readable', 500, 'stream is not readable'),
    );

    expect(toErrorResponse(mapped)).toEqual({
      status: 500,
      body: {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred.',
        },
      },
    });
  });

  it('leaves an untagged SyntaxError to the stock adapter (400 BadRequest)', () => {
    const mapped = adapter.mapException(new SyntaxError('Unexpected token'));

    expect(mapped).toBeInstanceOf(BadRequestException);
    expect(mapped).not.toBeInstanceOf(ApiException);
    expect((mapped as BadRequestException).message).toBe('Unexpected token');
  });

  it('leaves a URIError from a bad path encoding to the stock adapter (400 BadRequest)', () => {
    const mapped = adapter.mapException(new URIError('URI malformed'));

    expect(mapped).toBeInstanceOf(BadRequestException);
    expect((mapped as BadRequestException).getStatus()).toBe(400);
  });

  it.each([
    [
      'a non-string type',
      Object.assign(new Error('x'), { type: 42, status: 400 }),
    ],
    [
      'a type but no status',
      Object.assign(new Error('x'), { type: 'entity.parse.failed' }),
    ],
    [
      'a non-numeric status',
      Object.assign(new Error('x'), {
        type: 'entity.parse.failed',
        status: '400',
      }),
    ],
    [
      'a plain object, not an Error',
      { type: 'entity.parse.failed', status: 400, message: 'x' },
    ],
  ])('passes through unchanged an error with %s', (_label, error) => {
    expect(adapter.mapException(error)).toBe(error);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a thrown string', 'boom'],
  ])('passes %s through unchanged', (_label, error) => {
    expect(adapter.mapException(error)).toBe(error);
  });
});

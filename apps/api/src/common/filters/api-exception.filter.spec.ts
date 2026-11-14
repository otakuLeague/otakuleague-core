import {
  type ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client';
import { ApiException } from '../api.exception';
import {
  ApiExceptionFilter,
  isDatabaseUnavailable,
  toErrorResponse,
} from './api-exception.filter';

const CLIENT_VERSION = '7.10.0';
const LEAKY_MESSAGE =
  'relation "users" does not exist: SELECT * FROM users WHERE password = \'hunter2\' (/srv/apps/api/src/users.ts:42)';

function adapterError(kind: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(LEAKY_MESSAGE, {
    code: 'P2010',
    clientVersion: CLIENT_VERSION,
    meta: {
      driverAdapterError: { name: 'DriverAdapterError', cause: { kind } },
    },
  });
}

const SERVICE_UNAVAILABLE = {
  status: 503,
  body: {
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'The service is temporarily unavailable. Try again later.',
    },
  },
};

const INTERNAL_ERROR = {
  status: 500,
  body: {
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  },
};

describe('toErrorResponse', () => {
  it('maps a validation ApiException to 400 VALIDATION_FAILED with details', () => {
    const details = [{ field: 'title', message: 'title must be a string' }];

    expect(
      toErrorResponse(
        new ApiException(HttpStatus.BAD_REQUEST, {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          details,
        }),
      ),
    ).toEqual({
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          details,
        },
      },
    });
  });

  it('maps a malformed-body ApiException to 400 MALFORMED_REQUEST without details', () => {
    const response = toErrorResponse(
      new ApiException(HttpStatus.BAD_REQUEST, {
        code: 'MALFORMED_REQUEST',
        message: 'Request body must be valid JSON (an object or an array).',
      }),
    );

    expect(response).toEqual({
      status: 400,
      body: {
        error: {
          code: 'MALFORMED_REQUEST',
          message: 'Request body must be valid JSON (an object or an array).',
        },
      },
    });
    expect(response.body.error).not.toHaveProperty('details');
  });

  const limited = (retryAfterSeconds?: number) =>
    new ApiException(
      HttpStatus.TOO_MANY_REQUESTS,
      { code: 'ANIME_IMPORT_LIMIT_REACHED', message: 'Busy.' },
      retryAfterSeconds === undefined ? {} : { retryAfterSeconds },
    );

  it.each([1, 20, 40])('keeps a Retry-After of %i seconds', (seconds) => {
    expect(toErrorResponse(limited(seconds))).toEqual({
      status: 429,
      body: { error: { code: 'ANIME_IMPORT_LIMIT_REACHED', message: 'Busy.' } },
      retryAfterSeconds: seconds,
    });
  });

  it.each([
    ['none', undefined],
    ['zero', 0],
    ['a negative number', -5],
    ['a fraction', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['an unsafe integer', Number.MAX_SAFE_INTEGER + 1],
  ])('drops a Retry-After of %s', (_, seconds) => {
    expect(toErrorResponse(limited(seconds))).not.toHaveProperty(
      'retryAfterSeconds',
    );
  });

  it.each([
    [
      new NotFoundException('Cannot GET /nope'),
      404,
      'NOT_FOUND',
      'Cannot GET /nope',
    ],
    [
      new BadRequestException('Failed to decode param'),
      400,
      'BAD_REQUEST',
      'Failed to decode param',
    ],
    [
      new PayloadTooLargeException('request entity too large'),
      413,
      'PAYLOAD_TOO_LARGE',
      'request entity too large',
    ],
    [new ForbiddenException('Forbidden'), 403, 'CLIENT_ERROR', 'Forbidden'],
    [
      new HttpException('Unsupported', HttpStatus.UNSUPPORTED_MEDIA_TYPE),
      415,
      'CLIENT_ERROR',
      'Unsupported',
    ],
  ])(
    'maps the client error %s to its status and a stable code',
    (exception, status, code, message) => {
      expect(toErrorResponse(exception)).toEqual({
        status,
        body: { error: { code, message } },
      });
    },
  );

  it('maps a 503 HttpException to SERVICE_UNAVAILABLE with a generic message', () => {
    expect(
      toErrorResponse(new ServiceUnavailableException(LEAKY_MESSAGE)),
    ).toEqual(SERVICE_UNAVAILABLE);
  });

  it.each([
    new HttpException(LEAKY_MESSAGE, Number.NaN),
    new InternalServerErrorException(LEAKY_MESSAGE),
    new HttpException(LEAKY_MESSAGE, HttpStatus.BAD_GATEWAY),
    new HttpException(LEAKY_MESSAGE, HttpStatus.FOUND),
  ])('maps a non-4xx HttpException (%s) to a generic 500', (exception) => {
    expect(toErrorResponse(exception)).toEqual(INTERNAL_ERROR);
  });

  it.each([
    'DatabaseNotReachable',
    'ConnectionClosed',
    'SocketTimeout',
    'TooManyConnections',
    'AuthenticationFailed',
    'DatabaseDoesNotExist',
  ])('maps a driver adapter %s error to 503', (kind) => {
    expect(toErrorResponse(adapterError(kind))).toEqual(SERVICE_UNAVAILABLE);
  });

  it.each(['P1001', 'P1002', 'P1017', 'P2024'])(
    'maps Prisma connection code %s to 503',
    (code) => {
      const error = new Prisma.PrismaClientKnownRequestError(LEAKY_MESSAGE, {
        code,
        clientVersion: CLIENT_VERSION,
      });

      expect(toErrorResponse(error)).toEqual(SERVICE_UNAVAILABLE);
    },
  );

  it('maps a Prisma initialization error to 503', () => {
    expect(
      toErrorResponse(
        new Prisma.PrismaClientInitializationError(
          LEAKY_MESSAGE,
          CLIENT_VERSION,
        ),
      ),
    ).toEqual(SERVICE_UNAVAILABLE);
  });

  it("maps pg's connect timeout to 503", () => {
    expect(
      toErrorResponse(
        new Error('Connection terminated due to connection timeout'),
      ),
    ).toEqual(SERVICE_UNAVAILABLE);
  });

  it('maps a Prisma query error that is not about connectivity to a generic 500', () => {
    expect(toErrorResponse(adapterError('UniqueConstraintViolation'))).toEqual(
      INTERNAL_ERROR,
    );
    expect(
      toErrorResponse(
        new Prisma.PrismaClientKnownRequestError(LEAKY_MESSAGE, {
          code: 'P2002',
          clientVersion: CLIENT_VERSION,
        }),
      ),
    ).toEqual(INTERNAL_ERROR);
  });

  it.each([
    ['an Error', new Error(LEAKY_MESSAGE)],
    ['a TypeError', new TypeError(LEAKY_MESSAGE)],
    ['a thrown string', LEAKY_MESSAGE],
    ['undefined', undefined],
    ['null', null],
    ['a plain object', { message: LEAKY_MESSAGE, status: 400 }],
  ])('maps %s to a generic 500 that leaks nothing', (_label, exception) => {
    const response = toErrorResponse(exception);

    expect(response).toEqual(INTERNAL_ERROR);
    const serialized = JSON.stringify(response.body);
    for (const fragment of [
      'hunter2',
      'SELECT',
      'users',
      '/srv/',
      '.ts:',
      '    at ',
    ]) {
      expect(serialized).not.toContain(fragment);
    }
  });
});

describe('isDatabaseUnavailable', () => {
  it('ignores a known request error with no meta', () => {
    expect(
      isDatabaseUnavailable(
        new Prisma.PrismaClientKnownRequestError('x', {
          code: 'P2010',
          clientVersion: CLIENT_VERSION,
        }),
      ),
    ).toBe(false);
  });

  it.each([
    { driverAdapterError: null },
    { driverAdapterError: { cause: 'DatabaseNotReachable' } },
    { driverAdapterError: { cause: { kind: 42 } } },
  ])('ignores malformed adapter meta %j', (meta) => {
    expect(
      isDatabaseUnavailable(
        new Prisma.PrismaClientKnownRequestError('x', {
          code: 'P2010',
          clientVersion: CLIENT_VERSION,
          meta,
        }),
      ),
    ).toBe(false);
  });
});

describe('ApiExceptionFilter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function httpHost(headersSent = false) {
    const response = {
      headersSent,
      setHeader: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      end: vi.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', originalUrl: '/test' }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    return { host, response };
  }

  it('sends the envelope with the mapped status', () => {
    const { host, response } = httpHost();

    new ApiExceptionFilter().catch(
      new NotFoundException('Cannot GET /nope'),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'Cannot GET /nope' },
    });
  });

  it('sets Retry-After from a typed ApiException', () => {
    const { host, response } = httpHost();

    new ApiExceptionFilter().catch(
      new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        { code: 'ANIME_IMPORT_VISITOR_LIMIT_REACHED', message: 'Wait.' },
        { retryAfterSeconds: 37 },
      ),
      host,
    );

    expect(response.setHeader).toHaveBeenCalledExactlyOnceWith(
      'Retry-After',
      '37',
    );
    expect(response.status).toHaveBeenCalledWith(429);
  });

  it.each([
    [
      'an ApiException without one',
      new ApiException(HttpStatus.TOO_MANY_REQUESTS, {
        code: 'ANIME_IMPORT_LIMIT_REACHED',
        message: 'Busy.',
      }),
    ],
    [
      'an ApiException with a zero',
      new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        { code: 'ANIME_IMPORT_LIMIT_REACHED', message: 'Busy.' },
        { retryAfterSeconds: 0 },
      ),
    ],
    ['a Nest exception', new NotFoundException()],
  ])('sets no Retry-After for %s', (_, exception) => {
    const { host, response } = httpHost();

    new ApiExceptionFilter().catch(exception, host);

    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('logs the real error server-side for a 500 but sends only the generic body', () => {
    const logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { host, response } = httpHost();
    const error = new Error(LEAKY_MESSAGE);

    new ApiExceptionFilter().catch(error, host);

    expect(logError).toHaveBeenCalledWith(LEAKY_MESSAGE, error.stack);
    expect(response.json).toHaveBeenCalledWith(INTERNAL_ERROR.body);
  });

  it('does not log client errors', () => {
    const logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { host } = httpHost();

    new ApiExceptionFilter().catch(new NotFoundException(), host);

    expect(logError).not.toHaveBeenCalled();
  });

  it('ends the response without a second body when headers were already sent', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, response } = httpHost(true);

    new ApiExceptionFilter().catch(new Error('late failure'), host);

    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
    expect(response.end).toHaveBeenCalledOnce();
  });
});

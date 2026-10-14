import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

interface RequestContext {
  readonly requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();
const logger = new Logger('HTTP');

/** The id of the request being handled, or undefined outside a request (startup, shutdown). */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * Express middleware, registered before the body parser so even a 413 or malformed JSON gets an id.
 * Always generates the id: no caller sends a trusted one yet (ADR 0004).
 */
export function requestContext(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = randomUUID();
  const startedAt = performance.now();
  response.setHeader('X-Request-Id', requestId);
  storage.run({ requestId }, () => {
    // "close" fires for finished and aborted requests alike; bind keeps the request id on the line.
    response.on(
      'close',
      AsyncResource.bind(() => {
        logger.log('request completed', {
          method: request.method,
          path: request.originalUrl.split('?')[0],
          statusCode: response.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
          aborted: !response.writableFinished,
        });
      }),
    );
    next();
  });
}

import { execFileSync } from 'node:child_process';
import {
  PRIVATE_DATA_COLLECTION,
  scrubErrorEvent,
} from '@otakuleague/shared-types';
import * as Sentry from '@sentry/nestjs';
import type { Request } from 'express';
import { isInsideRepo, REPO_ROOT } from '../config/environment';
import { currentRequestId } from './request-context';

export interface SentrySettings {
  readonly dsn: string | undefined;
  readonly environment: string;
  readonly release: string | undefined;
}

// Local runs have no SENTRY_RELEASE; the commit is the release, as in the web app (ADR 0004).
function gitHeadSha(): string | undefined {
  if (!isInsideRepo()) return undefined;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      // A held lock or a slow disk must not block boot; the catch falls back.
      timeout: 2000,
    }).trim();
  } catch {
    return undefined;
  }
}

/** Starts Sentry, or does nothing without a DSN: every capture is then a no-op. Returns whether it started. */
export function initSentry({
  dsn,
  environment,
  release,
}: SentrySettings): boolean {
  if (dsn === undefined) return false;
  Sentry.init({
    dsn,
    environment,
    // Undefined lets the SDK read SENTRY_RELEASE or a CI commit variable.
    release: release ?? gitHeadSha(),
    includeServerName: false,
    // Initialised after the app is built, so scopes are not isolated per request:
    // breadcrumbs could mix two users' requests. Logs carry the context instead.
    maxBreadcrumbs: 0,
    dataCollection: PRIVATE_DATA_COLLECTION,
    beforeSend: (event) => scrubErrorEvent(event),
  });
  return true;
}

/**
 * A configuration problem that leaves production unsafe, sent at start as an error-level message
 * (a no-op without a DSN), so the default alert rules fire. The text must hold no secret: it
 * goes through the same scrubbing, not around it.
 */
export function captureStartupError(message: string): void {
  Sentry.captureMessage(message, 'error');
}

/** Queues the error for Sentry and returns at once: the request never waits for Sentry. */
export function captureServerError(exception: unknown, request: Request): void {
  Sentry.captureException(exception, {
    tags: { request_id: currentRequestId() },
    contexts: {
      request: {
        method: request.method,
        path: request.originalUrl.split('?')[0],
      },
    },
  });
}

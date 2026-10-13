import type { HealthResponse } from '@otakuleague/shared-types';
import { apiClient, type ApiFailure, type ApiResult } from '../src/api/client';

/**
 * What the home page knows about the backend. Replaces ApiResult's `ok`, which is true for both
 * "all up" and "database down" (ADR 0003, addendum).
 */
export type HomeHealth =
  | { readonly kind: 'healthy' }
  | { readonly kind: 'degraded' }
  | { readonly kind: 'unknown'; readonly failure: ApiFailure };

function assertNever(value: never): never {
  throw new Error(`Unhandled state: ${typeof value}`);
}

function toHomeHealth(result: ApiResult<HealthResponse>): HomeHealth {
  if (!result.ok) {
    return { kind: 'unknown', failure: result.failure };
  }
  return result.data.status === 'ok'
    ? { kind: 'healthy' }
    : { kind: 'degraded' };
}

/** A visitor-facing reason. Never the API's own message, which is internal. */
function describeFailure(failure: ApiFailure): string {
  switch (failure.kind) {
    case 'network':
      return 'The API is unreachable.';
    case 'timeout':
      return 'The API did not answer in time.';
    case 'api_error':
    case 'invalid_response':
      return 'The API sent an unexpected answer.';
    default:
      return assertNever(failure);
  }
}

function HealthStatusView({ health }: { readonly health: HomeHealth }) {
  switch (health.kind) {
    case 'healthy':
      return <p>All systems up: API and database.</p>;
    case 'degraded':
      return <p>The API is up, but the database is down.</p>;
    case 'unknown':
      return <p>Status unknown. {describeFailure(health.failure)}</p>;
    default:
      return assertNever(health);
  }
}

/** Uncached on purpose: rendered per request inside a Suspense boundary, never in the static shell. */
export async function HealthStatus() {
  const result = await apiClient().getHealth();
  return <HealthStatusView health={toHomeHealth(result)} />;
}

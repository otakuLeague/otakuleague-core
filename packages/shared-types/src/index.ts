import {
  ANIME_LIST_KINDS,
  ANIME_LIST_MAX_LIMIT,
  ANIME_STATUSES,
  CANONICAL_SLUG_PATTERN,
  type AnimeFranchise,
  type AnimeListCardPage,
} from './anime';

export const APP_NAME = 'OtakuLeague';

/** Every ApiErrorCode, at runtime, so isApiError can check the code. */
export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'MALFORMED_REQUEST',
  'BAD_REQUEST',
  'NOT_FOUND',
  'ANIME_NOT_FOUND',
  'PAYLOAD_TOO_LARGE',
  'CLIENT_ERROR',
  'SERVICE_UNAVAILABLE',
  'ANIME_SOURCES_UNAVAILABLE',
  'ANIME_IMPORT_LIMIT_REACHED',
  'ANIME_LIST_FETCH_LIMIT_REACHED',
  'INTERNAL_ERROR',
] as const;

/** Stable, machine-readable error codes. Clients branch on these, never on messages. */
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** One rejected input field. `field` is a dotted path for nested values. */
export interface ValidationIssue {
  readonly field: string;
  readonly message: string;
}

/** Body of every error response, except the 503 from GET /health. Only validation errors carry details. */
export interface ApiError {
  readonly error:
    | {
        readonly code: 'VALIDATION_FAILED';
        readonly message: string;
        readonly details: readonly ValidationIssue[];
      }
    | {
        readonly code: Exclude<ApiErrorCode, 'VALIDATION_FAILED'>;
        readonly message: string;
      };
}

export type HealthResponse =
  | { readonly status: 'ok'; readonly checks: { readonly database: 'up' } }
  | {
      readonly status: 'error';
      readonly checks: { readonly database: 'down' };
    };

// Runtime guards for clients: TypeScript types vanish at runtime, and no schema
// library is shared (ADR 0002), so response bodies are checked by hand (ADR 0003).

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return API_ERROR_CODES.some((code) => code === value);
}

function isValidationIssue(value: unknown): value is ValidationIssue {
  return (
    isRecord(value) &&
    typeof value.field === 'string' &&
    typeof value.message === 'string'
  );
}

/** True when `value` is an error envelope with a known code; `details` is required on VALIDATION_FAILED and absent otherwise. */
export function isApiError(value: unknown): value is ApiError {
  if (!isRecord(value) || !isRecord(value.error)) {
    return false;
  }
  const { code, message, details } = value.error;
  if (!isApiErrorCode(code) || typeof message !== 'string') {
    return false;
  }
  if (code === 'VALIDATION_FAILED') {
    return Array.isArray(details) && details.every(isValidationIssue);
  }
  return details === undefined;
}

/** True when `value` is a GET /health body, with a status that matches the database check. */
export function isHealthResponse(value: unknown): value is HealthResponse {
  if (!isRecord(value) || !isRecord(value.checks)) {
    return false;
  }
  const { database } = value.checks;
  return (
    (value.status === 'ok' && database === 'up') ||
    (value.status === 'error' && database === 'down')
  );
}

const FRANCHISE_STATES: readonly unknown[] = [
  'complete',
  'walking',
  'partial',
  'truncated',
  'unavailable',
];

/** The main-line fields the season selector reads; the rest is display data. */
function isFranchiseSeason(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { anilistId, slug, label, isCurrent, status, startDate } = value;
  return (
    Number.isInteger(anilistId) &&
    (slug === null || typeof slug === 'string') &&
    typeof label === 'string' &&
    typeof isCurrent === 'boolean' &&
    (status === null || ANIME_STATUSES.some((known) => known === status)) &&
    (startDate === null ||
      (isRecord(startDate) && Number.isInteger(startDate.year)))
  );
}

/** True when `value` is a GET /anime/slugs/:slug/franchise body (ADR 0008). */
export function isAnimeFranchise(value: unknown): value is AnimeFranchise {
  return (
    isRecord(value) &&
    FRANCHISE_STATES.includes(value.state) &&
    Array.isArray(value.mainLine) &&
    value.mainLine.every(isFranchiseSeason) &&
    Array.isArray(value.related)
  );
}

function isStringOrNull(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

/** An AnimeListCard: a positive id and a well-formed slug, since both end up in a link. */
function isListCard(value: unknown): boolean {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.anilistId) &&
    Number(value.anilistId) > 0 &&
    (value.slug === null ||
      (typeof value.slug === 'string' &&
        CANONICAL_SLUG_PATTERN.test(value.slug))) &&
    isStringOrNull(value.titleEnglish) &&
    isStringOrNull(value.titleRomaji) &&
    isStringOrNull(value.coverImageUrl)
  );
}

/** True when `value` is a GET /anime/lists/:kind body, card fields only (ADR 0016). */
export function isAnimeListPage(value: unknown): value is AnimeListCardPage {
  return (
    isRecord(value) &&
    ANIME_LIST_KINDS.some((kind) => kind === value.kind) &&
    Array.isArray(value.entries) &&
    value.entries.length <= ANIME_LIST_MAX_LIMIT &&
    value.entries.every(isListCard) &&
    isStringOrNull(value.nextCursor)
  );
}

export {
  PRIVATE_DATA_COLLECTION,
  redactText,
  redactValue,
  scrubBreadcrumb,
  scrubErrorEvent,
} from './redaction';
export * from './anime';

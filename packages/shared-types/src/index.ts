export const APP_NAME = 'OtakuLeague';

/** Stable, machine-readable error codes. Clients branch on these, never on messages. */
export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'MALFORMED_REQUEST'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'CLIENT_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

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

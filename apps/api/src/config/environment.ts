// class-transformer reads property types through Reflect metadata; don't rely on Nest loading it first.
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateBy,
  validateSync,
  type ValidationError,
} from 'class-validator';

// Same depth from src/config and dist/config, so this resolves to the repo root
// whether the API starts from the repo root, from apps/api, or from dist.
export const REPO_ROOT = resolve(__dirname, '../../../..');
export const REPO_ROOT_ENV_FILE = resolve(REPO_ROOT, '.env');

/**
 * Outside the monorepo (a deployed dist/), REPO_ROOT is some unrelated folder such
 * as `/`; reading a stray .env there could switch on Swagger or swap the database.
 */
export function isInsideRepo(): boolean {
  return existsSync(resolve(REPO_ROOT, 'pnpm-workspace.yaml'));
}

const POSTGRES_PROTOCOLS = ['postgres:', 'postgresql:'];

// WHATWG URL rather than @IsUrl: validator.js rejects valid connection strings
// (underscores in host names, Unix sockets via ?host=).
export function isPostgresUrl(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    URL.canParse(value) &&
    POSTGRES_PROTOCOLS.includes(new URL(value).protocol)
  );
}

// A DSN carries the project's public key as the URL user name and ends with the project id.
export function isSentryDsn(value: unknown): boolean {
  if (typeof value !== 'string' || !URL.canParse(value)) return false;
  const { protocol, username, pathname } = new URL(value);
  return (
    ['https:', 'http:'].includes(protocol) &&
    username !== '' &&
    /\/\d+$/.test(pathname)
  );
}

export function isHttpUrl(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    URL.canParse(value) &&
    ['https:', 'http:'].includes(new URL(value).protocol)
  );
}

// 43 characters of base64url is 256 bits; `openssl rand -hex 32` gives 64 hex characters (ADR 0019).
export const INTERNAL_API_KEY_MIN_LENGTH = 43;
const INTERNAL_API_KEY_PATTERN = new RegExp(
  `^[A-Za-z0-9_-]{${String(INTERNAL_API_KEY_MIN_LENGTH)},128}$`,
);

export function isInternalApiKey(value: unknown): boolean {
  return typeof value === 'string' && INTERNAL_API_KEY_PATTERN.test(value);
}

/** Another variable of the object being validated; undefined when unset (empty counts as unset). */
function variableOf(
  environment: unknown,
  name: keyof EnvironmentVariables,
): unknown {
  return typeof environment === 'object' && environment !== null
    ? Reflect.get(environment, name)
    : undefined;
}

function hasInternalApiKey(environment: unknown): boolean {
  return variableOf(environment, 'INTERNAL_API_KEY') !== undefined;
}

/**
 * Plain ===, not timingSafeEqual: both sides are our own variables, compared once at boot and
 * never against a request. A shared value would let preview code hold a production key.
 */
function differsFromProductionKeys(
  value: unknown,
  environment: unknown,
): boolean {
  return (
    value !== variableOf(environment, 'INTERNAL_API_KEY') &&
    value !== variableOf(environment, 'INTERNAL_API_KEY_PREVIOUS')
  );
}

const INTERNAL_API_KEY_RULE =
  'must be 43 to 128 characters of A-Z, a-z, 0-9, _ or - (openssl rand -hex 32)';

const BOOLEAN_STRINGS = ['true', 'false'] as const;

const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;

export class EnvironmentVariables {
  @IsIn(NODE_ENVIRONMENTS, {
    message: `NODE_ENV must be one of: ${NODE_ENVIRONMENTS.join(', ')}`,
  })
  readonly NODE_ENV!: (typeof NODE_ENVIRONMENTS)[number];

  // class-validator runs these bottom-up; IsInt goes first so "abc" reports as not an integer.
  @Min(1, { message: 'PORT must be at least 1' })
  @Max(65535, { message: 'PORT must be at most 65535' })
  @IsInt({ message: 'PORT must be an integer' })
  readonly PORT: number = 3001;

  @ValidateBy(
    { name: 'isPostgresUrl', validator: { validate: isPostgresUrl } },
    { message: 'DATABASE_URL must be a postgres:// or postgresql:// URL' },
  )
  readonly DATABASE_URL!: string;

  // Optional: without it Sentry stays off (ADR 0004).
  @IsOptional()
  @ValidateBy(
    { name: 'isSentryDsn', validator: { validate: isSentryDsn } },
    {
      message:
        'SENTRY_DSN must be a Sentry DSN, like https://<public key>@o0.ingest.sentry.io/<project id>',
    },
  )
  readonly SENTRY_DSN?: string;

  // Defaults to NODE_ENV.
  @IsOptional()
  @IsString()
  readonly SENTRY_ENVIRONMENT?: string;

  // Defaults to the git commit, or a CI commit variable.
  @IsOptional()
  @IsString()
  readonly SENTRY_RELEASE?: string;

  // Kill switches, one per anime data source (ADR 0006 update). Default on. "false" hides
  // everything that source ever stored and stops calling it; the data stays in the database.
  @IsOptional()
  @IsIn(BOOLEAN_STRINGS, {
    message: 'ANIME_SOURCE_ANILIST_ENABLED must be true or false',
  })
  readonly ANIME_SOURCE_ANILIST_ENABLED?: (typeof BOOLEAN_STRINGS)[number];

  @IsOptional()
  @IsIn(BOOLEAN_STRINGS, {
    message: 'ANIME_SOURCE_JIKAN_ENABLED must be true or false',
  })
  readonly ANIME_SOURCE_JIKAN_ENABLED?: (typeof BOOLEAN_STRINGS)[number];

  // Base URLs, overridable for a mirror or a self-hosted Jikan; tests use local fakes.
  @IsOptional()
  @ValidateBy(
    { name: 'isHttpUrl', validator: { validate: isHttpUrl } },
    { message: 'ANILIST_API_URL must be an http(s) URL' },
  )
  readonly ANILIST_API_URL?: string;

  @IsOptional()
  @ValidateBy(
    { name: 'isHttpUrl', validator: { validate: isHttpUrl } },
    { message: 'JIKAN_API_URL must be an http(s) URL' },
  )
  readonly JIKAN_API_URL?: string;

  // Shared with the web server (ADR 0019). Optional: unset, every route is open, unless
  // INTERNAL_API_KEY_REQUIRED=true refuses the boot (below).
  @IsOptional()
  @ValidateBy(
    { name: 'isInternalApiKey', validator: { validate: isInternalApiKey } },
    { message: `INTERNAL_API_KEY ${INTERNAL_API_KEY_RULE}` },
  )
  readonly INTERNAL_API_KEY?: string;

  // Accepted too during a rotation; refused without INTERNAL_API_KEY. Bottom-up, like PORT.
  @ValidateBy(
    {
      name: 'needsInternalApiKey',
      validator: { validate: (_, args) => hasInternalApiKey(args?.object) },
    },
    {
      message:
        // No ":" or "=" after a variable name: the log redaction would mask the words after it.
        'INTERNAL_API_KEY_PREVIOUS is set without INTERNAL_API_KEY; set the new key too, or unset both',
    },
  )
  @IsOptional()
  @ValidateBy(
    { name: 'isInternalApiKey', validator: { validate: isInternalApiKey } },
    { message: `INTERNAL_API_KEY_PREVIOUS ${INTERNAL_API_KEY_RULE}` },
  )
  readonly INTERNAL_API_KEY_PREVIOUS?: string;

  // Vercel previews' own key: a `preview` caller, one shared visitor bucket, never trusted for
  // X-Client-Ip. Inert while INTERNAL_API_KEY is unset (the check stays open). Bottom-up, like PORT.
  @ValidateBy(
    {
      name: 'differsFromProductionKeys',
      validator: {
        validate: (value, args) =>
          differsFromProductionKeys(value, args?.object),
      },
    },
    {
      message:
        'INTERNAL_API_KEY_PREVIEW is the same as INTERNAL_API_KEY or INTERNAL_API_KEY_PREVIOUS; give previews their own key',
    },
  )
  @IsOptional()
  @ValidateBy(
    { name: 'isInternalApiKey', validator: { validate: isInternalApiKey } },
    { message: `INTERNAL_API_KEY_PREVIEW ${INTERNAL_API_KEY_RULE}` },
  )
  readonly INTERNAL_API_KEY_PREVIEW?: string;

  // "true" refuses to boot without INTERNAL_API_KEY, in any NODE_ENV; the preview key alone does
  // not count. Unset or "false": the API starts open while no key is set. Bottom-up, like PORT.
  @ValidateBy(
    {
      name: 'requiredKeyIsSet',
      validator: {
        validate: (value, args) =>
          value !== 'true' || hasInternalApiKey(args?.object),
      },
    },
    {
      message:
        'INTERNAL_API_KEY_REQUIRED is true but INTERNAL_API_KEY is not set (the preview key does not count); set the key, or unset INTERNAL_API_KEY_REQUIRED to start open',
    },
  )
  @IsOptional()
  @IsIn(BOOLEAN_STRINGS, {
    message: 'INTERNAL_API_KEY_REQUIRED must be true or false',
  })
  readonly INTERNAL_API_KEY_REQUIRED?: (typeof BOOLEAN_STRINGS)[number];
}

// Messages name the variable and the rule, never the value: DATABASE_URL holds a password.
function describeProblem(error: ValidationError): string {
  if (error.value === undefined) {
    return `${error.property} is missing`;
  }
  return Object.values(error.constraints ?? {}).join('; ');
}

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  // `KEY=` in .env means unset: otherwise implicit conversion turns PORT='' into 0.
  const setVariables = Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== ''),
  );
  const environment = plainToInstance(EnvironmentVariables, setVariables, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(environment, { stopAtFirstError: true });
  if (errors.length > 0) {
    const problems = errors.map((error) => `  - ${describeProblem(error)}`);
    const error = new Error(
      `Invalid environment configuration:\n${problems.join('\n')}`,
    );
    // Nest logs the stack at startup; frames from Nest and Node internals only bury the list.
    error.stack = `${error.name}: ${error.message}`;
    throw error;
  }
  return environment;
}

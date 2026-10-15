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

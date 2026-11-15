// OTA-200: @prisma/adapter-pg drops the offset on `timestamptz` reads and writes, so a session
// in any zone other than UTC shifts every instant by that zone's offset. Pinning the zone in
// the startup packet beats `ALTER DATABASE ... SET timezone` and `ALTER ROLE` settings.

/** Sent as the startup `options` of every connection: the session time zone is UTC. */
export const UTC_SESSION_OPTIONS = '-c timezone=UTC';

/** The part of a pg pool config this module owns; callers spread their own limits beside it. */
export interface DatabasePoolConfig {
  readonly connectionString: string;
  readonly options: string;
}

/**
 * The pool config every Prisma client is built from. pg copies each query parameter of the URL
 * over the config (`Object.assign({}, config, parse(url))`), so `?options=` would silently drop
 * the pin: refused, as is a string that is not a URL (it could not be checked). The messages
 * name the variable and the rule, never the value: it holds the password.
 */
export function databasePoolConfig(
  connectionString: string,
): DatabasePoolConfig {
  if (!URL.canParse(connectionString)) {
    throw new Error('DATABASE_URL must be a URL.');
  }
  if (new URL(connectionString).searchParams.has('options')) {
    throw new Error(
      'DATABASE_URL must not set the `options` parameter: every pool pins the session time zone to UTC (OTA-200).',
    );
  }
  return { connectionString, options: UTC_SESSION_OPTIONS };
}

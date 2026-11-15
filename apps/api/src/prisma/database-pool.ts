// OTA-200: @prisma/adapter-pg drops the offset on `timestamptz` reads and writes, so a session
// in any zone other than UTC shifts every instant by that zone's offset. Pinning the zone in
// the startup packet beats `ALTER DATABASE ... SET timezone` and `ALTER ROLE` settings.

/** Sent as the startup `options` of every connection: the session time zone is UTC. */
export const UTC_SESSION_OPTIONS = '-c timezone=UTC';

/** One message for the boot validation and this module's backstop; it never quotes the value. */
export const DATABASE_URL_OPTIONS_RULE =
  'DATABASE_URL must not set the `options` parameter: every pool pins the session time zone to UTC (OTA-200).';

/** The part of a pg pool config this module owns; callers spread their own limits beside it. */
export interface DatabasePoolConfig {
  readonly connectionString: string;
  readonly options: string;
}

/**
 * True when pg would read an `options` query parameter from this URL: pg copies each query
 * parameter over the config (`Object.assign({}, config, parse(url))`), so it would drop the pin.
 * False for a string that is not a URL (the URL rule reports that).
 */
export function hasOptionsParameter(connectionString: string): boolean {
  return (
    URL.canParse(connectionString) &&
    new URL(connectionString).searchParams.has('options')
  );
}

/**
 * The pool config every Prisma client is built from. Environment validation already refuses
 * both cases at boot; this is the backstop for any other caller. A string that is not a URL is
 * refused because it could not be checked. The messages name the variable and the rule, never
 * the value: it holds the password.
 */
export function databasePoolConfig(
  connectionString: string,
): DatabasePoolConfig {
  if (!URL.canParse(connectionString)) {
    throw new Error('DATABASE_URL must be a URL.');
  }
  if (hasOptionsParameter(connectionString)) {
    throw new Error(DATABASE_URL_OPTIONS_RULE);
  }
  return { connectionString, options: UTC_SESSION_OPTIONS };
}

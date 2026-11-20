import type { NormalisedIdentifier } from './credential-rules';

/**
 * Usernames no one may take (ADR 0020 Addendum 1f gate G4): static siblings of a future
 * `/users/:username` (a test fails when a `users` route segment is missing here), and names that
 * would pass for the site, its staff or a missing value. Lower case, each matching
 * USERNAME_PATTERN. Reserving later cannot free a name a member already holds.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  // Routes under /users/, now or planned.
  'availability',
  'search',
  'new',
  'top',
  'random',
  'all',
  'settings',
  'leaderboard',
  'edit',
  'login',
  'signup',
  'sign_up',
  'profile',
  'account',
  'api',
  'user',
  'users',
  // The site and its staff.
  'admin',
  'admins',
  'administrator',
  'moderator',
  'moderators',
  'mod',
  'mods',
  'staff',
  'support',
  'help',
  'system',
  'official',
  'security',
  'root',
  'owner',
  'team',
  'bot',
  'otakuleague',
  'otaku_league',
  'otaku',
  // Values a page or a log could show for a missing member, or a JavaScript property name.
  'null',
  'undefined',
  'anonymous',
  'deleted',
  'everyone',
  'guest',
  'unknown',
  'nobody',
  'none',
  'self',
  '__proto__',
  'constructor',
  'prototype',
]);

/** Whole-key match on the normalised username: `Admin` is reserved, `admin_1` is not. Pure. */
export function isReservedUsername(usernameKey: NormalisedIdentifier): boolean {
  return RESERVED_USERNAMES.has(usernameKey);
}

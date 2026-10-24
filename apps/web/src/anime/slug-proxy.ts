import type { AnimeSlugResolution } from '@otakuleague/shared-types';
import { type NextRequest, NextResponse } from 'next/server';
import type { ApiResult } from '../api/client';
import { ANIME_TABS } from './tabs';

/** What the proxy learned about a slug: found, no such anime, or no answer in time. */
type SlugLookup =
  | { readonly kind: 'found'; readonly canonicalSlug: string }
  | { readonly kind: 'missing' }
  | { readonly kind: 'unknown' };

/** A canonical slug can move when a title changes: keep answers about a minute. */
const FOUND_TTL_MS = 60_000;
/** A slug can appear when its anime is imported: forget a miss sooner. */
const MISSING_TTL_MS = 10_000;
/** Answers kept at most; the oldest go first. */
const MAX_ENTRIES = 1_000;
/** The page shown, with a real 404 status, for a slug no anime has. */
export const ANIME_NOT_FOUND_PATH = '/anime-not-found';

export interface SlugProxyOptions {
  /** GET /anime/slugs/:slug/resolve, with a short timeout. */
  readonly resolve: (slug: string) => Promise<ApiResult<AnimeSlugResolution>>;
  readonly now?: () => number;
}

const TAB_SEGMENTS = ANIME_TABS.map(({ segment }) => segment).filter(
  (segment) => segment !== '',
);
/** /anime/<slug>[/<tab>]: only the real tabs, so random paths cost no lookup. */
const ANIME_PATH = new RegExp(
  `^/anime/([^/]+)(/(?:${TAB_SEGMENTS.join('|')}))?/?$`,
);

/** /anime/<slug>[/<tab>]: the slug and the rest of the path ("" or "/cast"). */
function splitAnimePath(
  pathname: string,
): { readonly slug: string; readonly rest: string } | null {
  const match = ANIME_PATH.exec(pathname);
  if (!match?.[1]) return null;
  try {
    return { slug: decodeURIComponent(match[1]), rest: match[2] ?? '' };
  } catch {
    return null;
  }
}

/**
 * The anime pages' front door (OTA-97). Next serves a prerendered App Shell before a page can
 * resolve its slug (Partial Prefetching), so an HTTP redirect or 404 has to be decided here,
 * before rendering: another slug of the anime gets a 308 to its canonical slug on the same
 * tab; a slug no anime has gets the not-found page with a real 404. It never blocks a page:
 * when the API is slow or down the request goes through and the page shows its own state.
 */
export function createSlugProxy({
  resolve,
  now = Date.now,
}: SlugProxyOptions): (request: NextRequest) => Promise<NextResponse> {
  // ponytail: per process; a shared cache only if several web instances ever need it.
  const cache = new Map<
    string,
    { readonly lookup: SlugLookup; readonly until: number }
  >();
  // The seven tab links prefetch at once: one resolve per slug in flight, shared.
  const inFlight = new Map<string, Promise<SlugLookup>>();

  function lookUp(slug: string): Promise<SlugLookup> {
    const key = slug.toLowerCase();
    const cached = cache.get(key);
    if (cached && cached.until > now()) return Promise.resolve(cached.lookup);
    const running = inFlight.get(key);
    if (running) return running;
    const lookup = fetchLookup(slug, key).finally(() => inFlight.delete(key));
    inFlight.set(key, lookup);
    return lookup;
  }

  async function fetchLookup(slug: string, key: string): Promise<SlugLookup> {
    const result = await resolve(slug);
    const lookup: SlugLookup = result.ok
      ? { kind: 'found', canonicalSlug: result.data.canonicalSlug }
      : result.failure.kind === 'api_error' &&
          (result.failure.status === 404 || result.failure.status === 400)
        ? { kind: 'missing' }
        : { kind: 'unknown' };
    // No answer (API slow or down) is not cached: during an outage each anime request waits
    // the resolve timeout (300 ms) before going through. Accepted (owner decision).
    if (lookup.kind !== 'unknown') {
      cache.delete(key);
      if (cache.size >= MAX_ENTRIES) {
        const oldest = cache.keys().next();
        if (oldest.done !== true) cache.delete(oldest.value);
      }
      cache.set(key, {
        lookup,
        until:
          now() + (lookup.kind === 'found' ? FOUND_TTL_MS : MISSING_TTL_MS),
      });
    }
    return lookup;
  }

  return async (request) => {
    const path = splitAnimePath(request.nextUrl.pathname);
    if (path === null) return NextResponse.next();
    const lookup = await lookUp(path.slug);
    if (lookup.kind === 'found' && lookup.canonicalSlug !== path.slug) {
      // Built anew rather than cloned: a clone would keep a trailing slash, costing a second hop.
      const target = new URL(
        `/anime/${encodeURIComponent(lookup.canonicalSlug)}${path.rest}${request.nextUrl.search}`,
        request.url,
      );
      return NextResponse.redirect(target, 308);
    }
    if (lookup.kind === 'missing') {
      const target = request.nextUrl.clone();
      target.pathname = ANIME_NOT_FOUND_PATH;
      // The 404 status comes from that page (it calls notFound()), not from the rewrite.
      return NextResponse.rewrite(target);
    }
    return NextResponse.next();
  };
}

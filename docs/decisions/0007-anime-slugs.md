# 0007: Readable anime URLs (slugs)
Status: accepted

## Context
OTA-94. Anime pages live at `/anime/<slug>` so a fan can type or edit the URL (`/anime/attack-on-titan`) instead of an opaque id. The site targets fans outside Japan, so the slug uses the English title.

Constraints from ADR 0006: an anime is a disposable cache row, deleted when nobody opened it for 30 days, and the same delete path serves takedowns. A source can be switched off at any time, and Jikan's titles replace AniList's in the merged anime when AniList is off. A URL, once published, must keep working.

## Options
1. **Slug columns on `anime`.** Rejected: the purge deletes them, so every link breaks after 30 days of no views.
2. **One `anime_slug` table with a `kind` column (canonical | alias) and a unique `slug`.** Rejected: one canonical per anime needs a partial unique index (Prisma support unverified), and a unique slug with one target cannot record that a second anime also claims an alias, so "ambiguous alias" could never be detected anyway.
3. **An identity table plus a slug table, keyed on the AniList id, with no foreign key to `anime`.** Chosen.
4. **Slugs keyed on `(source, external_id)`.** Rejected: an anime imported first by its MAL id, then linked to its AniList id, could end up with two canonical slugs.

## Decision
**Identity.** A slug points to the anime's AniList id, never to our cached row. Slugs are permanent; the cache is disposable.

- `anime_identity`: `anilist_id` (primary key), `canonical_slug` (unique), `removed_at` (first removal only), `created_at`. One row per AniList anime that ever had a slug.
- `anime_slug`: `slug` (primary key), `anilist_id`. Every slug ever claimed: the current canonical, former canonicals and the romaji alias. The primary key makes "one owner per slug, forever" a database rule. A CHECK constraint holds the format (lowercase words, single hyphens, 80 characters at most), so no bug can write a malformed slug that would then live forever; Prisma leaves it alone in later diffs (checked with an empty `migrate dev --create-only`).
- Neither table references `anime`, so the purge never touches them. A purged anime keeps its slugs and is re-imported on the next visit, with the same canonical slug.
- Anime with no AniList id get no slug; they keep `/anime/myanimelist/:id`. The slug is built from the AniList snapshot only (`titleEnglish`, else `titleRomaji`), never from the merged anime, so switching a source off never changes a slug. Resolving a slug goes through the identity, so a switched-off source never breaks it either.

**Lookup rule** (`GET /anime/slugs/:slug`): the requested slug, lowercased for the lookup, is matched; when the request is exactly the identity's canonical slug, the anime is served. Any other slug of that identity, or the canonical one in another letter case: redirect to the canonical one. A removed identity is a 404, with no source call. The route is declared before `/anime/:idSource/:externalId`: both have two segments, and Express takes the first match. That single rule covers the romaji alias and former canonicals; there is no `kind` column. When serving re-imports a purged anime whose title changed meanwhile, the canonical moves during the request, and the answer is a redirect to the new one.

**`canonicalSlug`** is in every anime response: `string | null`, null when the anime has no AniList identity yet (local caches from before OTA-94 until their next AniList refresh; anime known only through Jikan). No slug is claimed during a GET, and an anime that exists is never a 404 for lack of a slug.

**Slug generation**, in this order:
1. NFKD, then strip combining marks (`é` -> `e`).
2. Explicit mapping: `×` -> `x` (AniList writes `HUNTER×HUNTER`), `&` -> `and`; `'`, `’` and `°` are deleted (`JoJo's` -> `jojos`, `Gintama°` -> `gintama`); Latin letters NFKD leaves whole are spelled out (`ß` -> `ss`, `æ` -> `ae`, `œ` -> `oe`, `ø` -> `o`, `ł` -> `l`, `đ` -> `d`), so `Weiß Kreuz` -> `weiss-kreuz`, not `wei-kreuz`. Changing a rule later changes the slugs of new imports only.
3. Lowercase, every run of other characters -> one hyphen, trim hyphens. `Re:ZERO` -> `re-zero`, `86` -> `86`.
4. Empty result (a title with no Latin letters or digits): the romaji title, then `anime-<anilistId>`.

**Collisions.** The first anime to claim a slug keeps it; a slug is never reassigned. The candidates, tried in order:
`base`, `base-<year>`, `base-<year>-<format>`, `base-<anilistId>`. A rung whose value is missing is skipped (a not-yet-aired anime with no year goes `base`, `base-<format>`, `base-<anilistId>`). The last rung is unique in practice (another title would have to end in this exact id); if even it is taken, the import fails loudly instead of guessing. Slugs are at most 80 characters: the base is cut, on a hyphen when it has one, so that base plus suffix fits. `year` is the start year, else the season year; `format` is lowercase with hyphens (`tv-short`).

A canonical candidate taken by another anime, as its alias or its canonical, moves down the ladder. A candidate this anime already owns (its romaji alias, a former canonical) is not taken: it is reused, never skipped for a lower rung. Stability beats a prettier URL: no URL ever changes its target. The known downside: the less famous of two same-title anime may get the bare slug. The admin override and precomputed slugs for popular titles are future work, not built.

**Reserved words.** `anilist`, `myanimelist`, `search` and `new` can never be slugs: they are, or will be, siblings of the slug under `/anime/`. Tab names (`episodes`, `cast`, ...) come after the slug and cannot collide. Adding a reserved word later cannot free a slug already claimed, so the list errs on the side of reserving.

**Aliases.** The romaji slug (`shingeki-no-kyojin`), created only when free, and every former canonical. No synonyms: AniList's synonyms are abbreviations many anime share (`SnK`, `AoT`) and titles in other languages. Abbreviations are search's job (OTA-98). A romaji slug already owned by another anime is simply not created; the anime stays reachable by its canonical slug and search.

**Title changes.** When a refresh brings a usable English title whose candidates no longer include the current canonical, a new canonical is claimed and the old one redirects. A title that disappears (English title null, or with nothing Latin in it) never moves the canonical: a vandal edit to null that gets reverted claims no slug at any step, and the canonical stays put. Accepted consequence: an anime with no English title keeps its canonical when only its romaji title changes; its URL still works, and a later English title moves it. Typically an announced anime gets its English title; a new or corrected start year or format can also move a canonical that sat on a year or format rung. A canonical that is still one of the candidates stays, even if a better rung became free.

**Claiming** happens inside the import transaction that stores the AniList snapshot. A free canonical is inserted with a plain insert: when another import takes it at the same moment, the unique violation aborts the transaction and `store()` runs again (up to 3 attempts, so three imports racing for one base all succeed) and sees it taken. The romaji alias uses insert-or-skip.

**Removed anime.** `removed_at` is set when an anime is deleted for being adult (and later by takedowns). The delete and the mark run in one transaction. An identity with `removed_at` is never imported again and costs no source call, so a bookmark or a crawler cannot bring a removed page back the next day. If another source stored it meanwhile (AniList down at import, MAL id only), the next AniList answer deletes it again. An anime with no identity yet cannot be marked (`canonical_slug` is required); the adult flag is still checked on every import.

**Scope.** OTA-94 PR1: tables, generation, claiming, `removed_at`. PR2: `GET /anime/slugs/:slug` (a union of `anime`, `redirect`; unknown slug is a plain 404 `ANIME_NOT_FOUND`), `canonicalSlug` in the anime responses, the OpenAPI schema. The unknown-slug lookup on AniList and "did you mean" belong to OTA-98; the web 301 that keeps the tab belongs to OTA-97.

## Consequences
- A purged anime cannot be served by its slug while AniList is switched off: the identity holds only the AniList id, and no other source can import by it. A cached one keeps being served from the remaining source.
- Slug rows grow forever, one identity plus about two slugs per anime ever imported. Small next to the snapshots, and nothing to purge.
- No backfill: no deployment exists yet, only local caches, and an anime gains its slugs the next time its AniList snapshot is stored (daily when airing, after 7 days otherwise, or at re-import).
- An anime re-imported through Jikan alone (AniList switched off) cannot be checked against `removed_at`: the purge deleted its MAL-to-AniList link. It still has no slug, and AniList is the primary source, so this stays a narrow gap.
- An API redirect would not reach the browser: the web client refuses redirects (`redirect: 'error'`, ADR 0003). The redirect is therefore data in a 200 response, and the web app turns it into a 301.
- Two anime whose English and romaji slugs are swapped, imported at the same instant, can deadlock; Postgres aborts one and that request fails once. Not retried: `@prisma/adapter-pg` 7.10 does not map the deadlock code to P2034, and the error shape is unverified.
- Future work: takedown flow setting `removed_at` (and maybe a 410; it will need a nullable `canonical_slug` or a removal table for anime never slugged), admin override of a slug, precomputed slugs for popular titles.

## Learnings
- A slug that outlives the cache also outlives deletions: permanence needed an explicit "removed" state, or the purge and takedowns would silently stop working.

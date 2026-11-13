-- AlterTable (OTA-192, ADR 0016): first time an anime row held this AniList id; never cleared.
-- Null = claimed by a catalog list and never imported: the only identities the ADR 0016
-- runbook may release. Nullable, no default: a catalog-only change.
ALTER TABLE "anime_identity" ADD COLUMN "imported_at" TIMESTAMPTZ(3);

-- Backfill 1: list claims began with OTA-190 (merged 2026-11-13 06:01:15 UTC), so every
-- identity created earlier was created by an import, purged or removed since included.
UPDATE "anime_identity"
SET "imported_at" = "created_at"
WHERE "imported_at" IS NULL
  AND "created_at" < TIMESTAMPTZ '2026-11-13 06:01:15+00';

-- Backfill 2: any other identity with an anime row now. (source, external_id) is the primary
-- key of anime_external_id, so each identity is updated at most once.
UPDATE "anime_identity" AS i
SET "imported_at" = a."created_at"
FROM "anime_external_id" AS e
JOIN "anime" AS a ON a."id" = e."anime_id"
WHERE e."source" = 'ANILIST'
  AND e."external_id" = i."anilist_id"
  AND i."imported_at" IS NULL;

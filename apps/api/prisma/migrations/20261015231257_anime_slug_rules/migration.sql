-- AlterTable: a temporary default fills rows written before this migration, then goes,
-- so the schema (no default) and the database agree.
ALTER TABLE "anime_identity" ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "anime_identity" ALTER COLUMN "created_at" DROP DEFAULT;

-- Slug format (ADR 0007), not modelled by Prisma: a bad slug would be a permanent row.
-- Reserved words stay in anime.slug.ts.
ALTER TABLE "anime_slug" ADD CONSTRAINT "anime_slug_format_check"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("slug") <= 80);

-- CreateEnum
CREATE TYPE "franchise_role" AS ENUM ('SEASON', 'RELATED', 'BOUNDARY');

-- CreateTable
CREATE TABLE "anime_relation_node" (
    "anilist_id" INTEGER NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL,
    "title_english" TEXT,
    "title_romaji" TEXT,
    "format" "anime_format",
    "status" "anime_status",
    "start_year" INTEGER,
    "start_month" INTEGER,
    "start_day" INTEGER,
    "cover_image_url" TEXT,
    "edges" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "anime_relation_node_pkey" PRIMARY KEY ("anilist_id")
);

-- CreateTable
CREATE TABLE "anime_franchise_override" (
    "anilist_id" INTEGER NOT NULL,
    "role" "franchise_role",
    "label" TEXT,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "anime_franchise_override_pkey" PRIMARY KEY ("anilist_id")
);

-- CreateIndex
CREATE INDEX "anime_relation_node_last_used_at_idx" ON "anime_relation_node"("last_used_at");

-- Not modelled by Prisma (ADR 0008).
ALTER TABLE "anime_franchise_override"
  ADD CONSTRAINT "anime_franchise_override_label_check" CHECK ("label" IS NULL OR char_length("label") BETWEEN 1 AND 60),
  ADD CONSTRAINT "anime_franchise_override_effect_check" CHECK ("role" IS NOT NULL OR "label" IS NOT NULL),
  ADD CONSTRAINT "anime_franchise_override_note_check" CHECK (char_length(btrim("note")) > 0);

-- Owner decisions of 2026-10-16 (OTA-95). Ids and formats from the recorded walks
-- (apps/api/src/anime/sources/fixtures/anilist-walk-*.json).
INSERT INTO "anime_franchise_override" ("anilist_id", "role", "label", "note", "created_at") VALUES
  (167404, 'RELATED', NULL, 'One Piece: MONSTERS (ONA) is linked as SEQUEL/PREQUEL but is not a season', CURRENT_TIMESTAMP),
  (146984, 'SEASON', 'The Final Chapters Part 1', 'Attack on Titan: THE FINAL CHAPTERS Special 1 (SPECIAL); fans treat it as the finale', CURRENT_TIMESTAMP),
  (162314, 'SEASON', 'The Final Chapters Part 2', 'Attack on Titan: THE FINAL CHAPTERS Special 2 (SPECIAL); fans treat it as the finale', CURRENT_TIMESTAMP),
  (356, 'BOUNDARY', NULL, 'Fate/stay night (2006): alternative route linked as a SEQUEL of Fate/Zero Season 2', CURRENT_TIMESTAMP),
  (19603, 'BOUNDARY', NULL, 'Fate/stay night: Unlimited Blade Works (TV): alternative route linked as a SEQUEL of Fate/Zero Season 2', CURRENT_TIMESTAMP),
  (6922, 'BOUNDARY', NULL, 'Fate/stay night: Unlimited Blade Works (movie): alternative route linked as a SEQUEL of Fate/Zero Season 2', CURRENT_TIMESTAMP),
  (20791, 'BOUNDARY', NULL, 'Fate/stay night [Heaven''s Feel] I: alternative route linked as a SEQUEL of Fate/Zero Season 2', CURRENT_TIMESTAMP);

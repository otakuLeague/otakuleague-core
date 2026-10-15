-- CreateEnum
CREATE TYPE "anime_data_source" AS ENUM ('ANILIST', 'JIKAN');

-- CreateEnum
CREATE TYPE "anime_id_source" AS ENUM ('ANILIST', 'MYANIMELIST');

-- CreateEnum
CREATE TYPE "anime_format" AS ENUM ('TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC');

-- CreateEnum
CREATE TYPE "anime_status" AS ENUM ('FINISHED', 'RELEASING', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS');

-- CreateEnum
CREATE TYPE "anime_season" AS ENUM ('WINTER', 'SPRING', 'SUMMER', 'FALL');

-- CreateTable
CREATE TABLE "anime" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "last_viewed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "anime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anime_external_id" (
    "source" "anime_id_source" NOT NULL,
    "external_id" INTEGER NOT NULL,
    "anime_id" UUID NOT NULL,

    CONSTRAINT "anime_external_id_pkey" PRIMARY KEY ("source","external_id")
);

-- CreateTable
CREATE TABLE "anime_source_snapshot" (
    "anime_id" UUID NOT NULL,
    "source" "anime_data_source" NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "source_url" TEXT NOT NULL,
    "title_romaji" TEXT,
    "title_english" TEXT,
    "title_native" TEXT,
    "synonyms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "format" "anime_format",
    "status" "anime_status",
    "start_year" INTEGER,
    "start_month" INTEGER,
    "start_day" INTEGER,
    "end_year" INTEGER,
    "end_month" INTEGER,
    "end_day" INTEGER,
    "season" "anime_season",
    "season_year" INTEGER,
    "episodes" INTEGER,
    "duration_minutes" INTEGER,
    "synopsis" TEXT,
    "cover_image_url" TEXT,
    "banner_image_url" TEXT,
    "trailer_site" TEXT,
    "trailer_id" TEXT,
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" JSONB NOT NULL DEFAULT '[]',
    "studios" JSONB NOT NULL DEFAULT '[]',
    "links" JSONB NOT NULL DEFAULT '[]',
    "score" DOUBLE PRECISION,
    "scored_by" INTEGER,
    "rank" INTEGER,
    "members" INTEGER,
    "next_episode" INTEGER,
    "next_episode_airing_at" TIMESTAMPTZ(3),

    CONSTRAINT "anime_source_snapshot_pkey" PRIMARY KEY ("anime_id","source")
);

-- CreateIndex
CREATE INDEX "anime_last_viewed_at_idx" ON "anime"("last_viewed_at");

-- CreateIndex
CREATE INDEX "anime_external_id_anime_id_idx" ON "anime_external_id"("anime_id");

-- AddForeignKey
ALTER TABLE "anime_external_id" ADD CONSTRAINT "anime_external_id_anime_id_fkey" FOREIGN KEY ("anime_id") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anime_source_snapshot" ADD CONSTRAINT "anime_source_snapshot_anime_id_fkey" FOREIGN KEY ("anime_id") REFERENCES "anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

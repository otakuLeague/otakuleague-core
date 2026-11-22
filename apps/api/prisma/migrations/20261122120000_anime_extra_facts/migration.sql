-- AlterTable
ALTER TABLE "anime_source_snapshot" ADD COLUMN     "country_of_origin" TEXT,
ADD COLUMN     "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "producers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "source_material" TEXT;

-- AlterTable
ALTER TABLE "anime_source_snapshot" ADD COLUMN     "cover_color" TEXT,
ADD COLUMN     "creators" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "favourites" INTEGER,
ADD COLUMN     "rank_popular" INTEGER,
ADD COLUMN     "rank_rated" INTEGER;

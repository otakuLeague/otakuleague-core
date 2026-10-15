-- CreateTable
CREATE TABLE "anime_identity" (
    "anilist_id" INTEGER NOT NULL,
    "canonical_slug" TEXT NOT NULL,
    "removed_at" TIMESTAMPTZ(3),

    CONSTRAINT "anime_identity_pkey" PRIMARY KEY ("anilist_id")
);

-- CreateTable
CREATE TABLE "anime_slug" (
    "slug" TEXT NOT NULL,
    "anilist_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "anime_slug_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE UNIQUE INDEX "anime_identity_canonical_slug_key" ON "anime_identity"("canonical_slug");

-- CreateIndex
CREATE INDEX "anime_slug_anilist_id_idx" ON "anime_slug"("anilist_id");

-- AddForeignKey
ALTER TABLE "anime_slug" ADD CONSTRAINT "anime_slug_anilist_id_fkey" FOREIGN KEY ("anilist_id") REFERENCES "anime_identity"("anilist_id") ON DELETE RESTRICT ON UPDATE CASCADE;

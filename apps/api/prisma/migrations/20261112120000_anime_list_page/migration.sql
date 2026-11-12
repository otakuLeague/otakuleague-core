-- CreateTable
CREATE TABLE "anime_list_page" (
    "list_key" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "has_next_page" BOOLEAN NOT NULL,
    "entries" JSONB NOT NULL,

    CONSTRAINT "anime_list_page_pkey" PRIMARY KEY ("list_key","page")
);

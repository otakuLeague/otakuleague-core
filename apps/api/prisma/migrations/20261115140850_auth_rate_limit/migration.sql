-- CreateTable
CREATE TABLE "auth_rate_limit" (
    "key" BYTEA NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "auth_rate_limit_pkey" PRIMARY KEY ("key")
);

-- Not modelled by Prisma (ADR 0015): a key is an HMAC-SHA256 digest, never an IP or an
-- identifier; a row exists only once an attempt was counted.
ALTER TABLE "auth_rate_limit" ADD CONSTRAINT "auth_rate_limit_key_length_check" CHECK (octet_length("key") = 32);
ALTER TABLE "auth_rate_limit" ADD CONSTRAINT "auth_rate_limit_count_check" CHECK ("count" >= 1);

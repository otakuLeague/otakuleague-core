-- CreateEnum
CREATE TYPE "auth_token_purpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "auth_token" (
    "token_hash" BYTEA NOT NULL,
    "purpose" "auth_token_purpose" NOT NULL,
    "user_id" UUID NOT NULL,
    "binding_hash" BYTEA,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "auth_token_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "auth_username_hold" (
    "username_key" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_username_hold_pkey" PRIMARY KEY ("username_key")
);

-- CreateIndex
CREATE INDEX "auth_token_user_id_idx" ON "auth_token"("user_id");

-- AddForeignKey
ALTER TABLE "auth_token" ADD CONSTRAINT "auth_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Not modelled by Prisma (ADR 0015): a token hash and a binding hash are SHA-256 digests, never
-- a token; only a verification token carries the sign-up's binding.
ALTER TABLE "auth_token" ADD CONSTRAINT "auth_token_token_hash_length_check" CHECK (octet_length("token_hash") = 32);
ALTER TABLE "auth_token" ADD CONSTRAINT "auth_token_binding_hash_length_check" CHECK ("binding_hash" IS NULL OR octet_length("binding_hash") = 32);
ALTER TABLE "auth_token" ADD CONSTRAINT "auth_token_binding_purpose_check" CHECK ("binding_hash" IS NULL OR "purpose" = 'EMAIL_VERIFICATION');

-- One token per account and purpose (ADR 0020 Addendum 1e-ii-b): a new token replaces the last
-- one in place (an upsert), so "a new token cancels the older ones" is a database rule.

-- Sign-up never left two rows, so this deletes nothing; it is here so the index cannot fail.
-- Keeps the newest row per account and purpose, the token hash breaking a tie.
DELETE FROM "auth_token" AS "older" USING "auth_token" AS "newer"
WHERE "older"."user_id" = "newer"."user_id" AND "older"."purpose" = "newer"."purpose"
  AND ("older"."created_at", "older"."token_hash") < ("newer"."created_at", "newer"."token_hash");

-- DropIndex: the unique index below starts with user_id and serves the cascade the same way.
DROP INDEX "auth_token_user_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "auth_token_user_id_purpose_key" ON "auth_token"("user_id", "purpose");

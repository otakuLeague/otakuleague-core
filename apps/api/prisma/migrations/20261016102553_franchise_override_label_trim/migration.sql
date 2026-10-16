-- A label of only spaces passed the first CHECK (migration franchise_walk); the applied
-- migration is never edited, so this one replaces the constraint (ADR 0008).
ALTER TABLE "anime_franchise_override"
  DROP CONSTRAINT "anime_franchise_override_label_check",
  ADD CONSTRAINT "anime_franchise_override_label_check" CHECK ("label" IS NULL OR (char_length("label") <= 60 AND char_length(btrim("label")) > 0));

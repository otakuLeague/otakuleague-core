-- OTA-98, ADR 0015: trigram search over stored titles. pg_trgm is a trusted extension.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- One normalisation for the stored titles and the query, so the two can never disagree.
CREATE FUNCTION anime_search_normalize(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE RETURNS NULL ON NULL INPUT
RETURN btrim(regexp_replace(
  translate(regexp_replace(lower(normalize(value, NFKD)), '[̀-ͯ''’]', '', 'g'), '×', 'x'),
  '[\x01-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+', ' ', 'g'));

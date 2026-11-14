// Runs before every unit test file. Unit tests have no database: a closed port makes
// any accidental query fail at once. Tests that need Postgres are *.integration.spec.ts.
process.env.DATABASE_URL =
  'postgresql://unit:unit@127.0.0.1:1/unit_tests_have_no_database';
// A key in a local .env must not switch the internal key check on in tests, nor
// INTERNAL_API_KEY_REQUIRED refuse their boot (ADR 0019): empty means unset, and real env vars
// win over the file.
process.env.INTERNAL_API_KEY = '';
process.env.INTERNAL_API_KEY_PREVIOUS = '';
process.env.INTERNAL_API_KEY_PREVIEW = '';
process.env.INTERNAL_API_KEY_REQUIRED = '';

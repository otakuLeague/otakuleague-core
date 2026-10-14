// Runs before every unit test file. Unit tests have no database: a closed port makes
// any accidental query fail at once. Tests that need Postgres are *.integration.spec.ts.
process.env.DATABASE_URL =
  'postgresql://unit:unit@127.0.0.1:1/unit_tests_have_no_database';

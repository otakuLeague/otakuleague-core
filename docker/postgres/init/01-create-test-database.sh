#!/usr/bin/env bash
# Creates the test database next to the dev one so tests never touch dev data.
set -euo pipefail

if [ "$POSTGRES_TEST_DB" = "$POSTGRES_DB" ]; then
  echo "POSTGRES_TEST_DB must differ from POSTGRES_DB" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v test_db="$POSTGRES_TEST_DB" <<'EOSQL'
CREATE DATABASE :"test_db";
EOSQL

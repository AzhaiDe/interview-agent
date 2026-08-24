#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
: "${DATABASE_URL:?DATABASE_URL is required}"
npm run db:migrate:postgres
npm run db:verify:postgres
if [ "${MIGRATE_SQLITE_DATA:-false}" = "true" ]; then
  npm run db:migrate:sqlite-to-postgres
fi
echo "PostgreSQL schema and LangGraph checkpointer verified."

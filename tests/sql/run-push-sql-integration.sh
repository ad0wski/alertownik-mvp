#!/usr/bin/env bash
# LR-8A.1 — runs the push SQL/RLS integration test against a THROWAWAY local
# database. Never touches Production: the only database it can reach is the
# container it starts on 127.0.0.1, which it deletes at the end.
#
#   bash tests/sql/run-push-sql-integration.sh
#
# Needs Docker. Images: supabase/postgres:17.6.1.170 (same PostgreSQL 17.6
# as Production) and postgrest/postgrest:v13.0.4 (the REST layer supabase-js
# talks to). All passwords/secrets below are random per run, local only.
set -euo pipefail
cd "$(dirname "$0")/../.."

PG_IMAGE=supabase/postgres:17.6.1.170
REST_IMAGE=postgrest/postgrest:v13.0.4
NET=lr8a1-it-net
PG=lr8a1-it-pg
REST=lr8a1-it-rest
PG_PORT=${LR8A1_PG_PORT:-54339}
REST_PORT=${LR8A1_REST_PORT:-54340}
PASS=$(node -e "console.log(require('crypto').randomBytes(18).toString('hex'))")
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

cleanup() {
  docker rm -f "$REST" "$PG" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

docker network create "$NET" >/dev/null
docker run -d --name "$PG" --network "$NET" -p "127.0.0.1:${PG_PORT}:5432" \
  -e POSTGRES_PASSWORD="$PASS" "$PG_IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$PG" psql -U supabase_admin -d postgres -Atc "select 1" >/dev/null 2>&1 && break
  sleep 2
done
sleep 3
docker exec "$PG" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -qc \
  "alter role authenticator with password '$PASS'" >/dev/null
docker exec -i "$PG" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q \
  < tests/sql/lr8a1_prod_like_baseline.sql >/dev/null

docker run -d --name "$REST" --network "$NET" -p "127.0.0.1:${REST_PORT}:3000" \
  -e PGRST_DB_URI="postgres://authenticator:${PASS}@${PG}:5432/postgres" \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$JWT_SECRET" "$REST_IMAGE" >/dev/null
for _ in $(seq 1 30); do
  curl -sf "http://127.0.0.1:${REST_PORT}/" >/dev/null 2>&1 && break
  sleep 1
done

LR8A1_SQL_IT=1 LR8A1_PG_CONTAINER="$PG" LR8A1_REST_URL="http://127.0.0.1:${REST_PORT}" \
LR8A1_JWT_SECRET="$JWT_SECRET" \
  npx playwright test --config tests/sql/playwright.sql.config.ts "$@"

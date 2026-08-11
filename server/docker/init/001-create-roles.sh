#!/bin/sh
set -eu

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set=owner_password="$TAPRA2_OWNER_PASSWORD" \
  --set=app_password="$TAPRA2_APP_PASSWORD" <<'SQL'
SELECT format(
  'CREATE ROLE tapra2_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L',
  :'owner_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tapra2_owner') \gexec

SELECT format(
  'CREATE ROLE tapra2_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L',
  :'app_password'
) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tapra2_app') \gexec

CREATE DATABASE tapra2_dev OWNER tapra2_owner;
CREATE DATABASE tapra2_test OWNER tapra2_owner;
GRANT CONNECT ON DATABASE tapra2_dev TO tapra2_app;
GRANT CONNECT ON DATABASE tapra2_test TO tapra2_app;
SQL

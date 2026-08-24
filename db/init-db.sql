-- Runs once when the postgres container's data volume is first created
-- (docker-entrypoint-initdb.d). The bootstrap user (POSTGRES_USER in
-- docker-compose.yml) is a Postgres superuser, which — per prisma/rls.sql —
-- means Row-Level Security is silently bypassed for anything it touches.
-- So: migrations run as the superuser (custodian_admin), but the running
-- API connects as this separate, non-superuser role instead.

CREATE ROLE custodian_app LOGIN PASSWORD 'custodian_dev_password' NOBYPASSRLS;
GRANT ALL ON SCHEMA public TO custodian_app;

-- Tables created later by `prisma migrate` (run as custodian_admin) need to
-- be reachable by custodian_app too — this makes every future table the
-- admin role creates automatically grant access to the app role.
ALTER DEFAULT PRIVILEGES FOR ROLE custodian_admin IN SCHEMA public
  GRANT ALL ON TABLES TO custodian_app;
ALTER DEFAULT PRIVILEGES FOR ROLE custodian_admin IN SCHEMA public
  GRANT ALL ON SEQUENCES TO custodian_app;

-- Row-Level Security: the database-enforced second layer behind the
-- application's own companyId filters (see src/prisma/tenant-context.ts).
--
-- Run this once after `prisma migrate deploy`/`migrate dev`:
--   psql "$DATABASE_URL" -f prisma/rls.sql
-- Safe to re-run — every policy is dropped and recreated, so a schema
-- change that adds a new tenant-scoped table just means re-running this
-- (after adding it to one of the lists below) rather than hand-diffing.
--
-- Prisma doesn't model RLS policies, so this lives outside the generated
-- migrations.

-- The API's Postgres role must NOT be a superuser/table owner with BYPASSRLS,
-- or every policy below is silently skipped. Create a dedicated app role:
--   CREATE ROLE custodian_app LOGIN PASSWORD '...' NOBYPASSRLS;
--   GRANT ALL ON ALL TABLES IN SCHEMA public TO custodian_app;
-- and point DATABASE_URL at custodian_app, not the migration/superuser role
-- (see db/init-db.sql, which sets exactly this up for local dev).

-- ── Tables that carry companyId directly ────────────────────────────────

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'departments', 'conversation_groups', 'clients',
    'conversations', 'whatsapp_accounts', 'message_templates', 'audit_log'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("companyId" = current_setting(''app.company_id'', true))',
      t
    );
  END LOOP;
END $$;

-- ── Tables scoped through a parent relation instead ─────────────────────
-- client_assignments -> clients, group_members -> conversation_groups,
-- conversation_participants/messages -> conversations, and
-- message_status/attachments -> messages -> conversations (two hops).

ALTER TABLE client_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_assignments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON client_assignments;
CREATE POLICY tenant_isolation ON client_assignments USING (
  EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = client_assignments."clientId"
      AND c."companyId" = current_setting('app.company_id', true)
  )
);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON group_members;
CREATE POLICY tenant_isolation ON group_members USING (
  EXISTS (
    SELECT 1 FROM conversation_groups g
    WHERE g.id = group_members."groupId"
      AND g."companyId" = current_setting('app.company_id', true)
  )
);

ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON conversation_participants;
CREATE POLICY tenant_isolation ON conversation_participants USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_participants."conversationId"
      AND c."companyId" = current_setting('app.company_id', true)
  )
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON messages;
CREATE POLICY tenant_isolation ON messages USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages."conversationId"
      AND c."companyId" = current_setting('app.company_id', true)
  )
);

ALTER TABLE message_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_status FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON message_status;
CREATE POLICY tenant_isolation ON message_status USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversations c ON c.id = m."conversationId"
    WHERE m.id = message_status."messageId"
      AND c."companyId" = current_setting('app.company_id', true)
  )
);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON attachments;
CREATE POLICY tenant_isolation ON attachments USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversations c ON c.id = m."conversationId"
    WHERE m.id = attachments."messageId"
      AND c."companyId" = current_setting('app.company_id', true)
  )
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sessions;
CREATE POLICY tenant_isolation ON sessions USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = sessions."userId"
      AND u."companyId" = current_setting('app.company_id', true)
  )
);

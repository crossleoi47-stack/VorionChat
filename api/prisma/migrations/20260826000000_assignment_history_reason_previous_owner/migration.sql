-- Add history fields to client assignments without dropping any rows.
ALTER TABLE "client_assignments"
ADD COLUMN IF NOT EXISTS "previousUserId" TEXT,
ADD COLUMN IF NOT EXISTS "reason" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_assignments_previousUserId_fkey'
  ) THEN
    ALTER TABLE "client_assignments"
    ADD CONSTRAINT "client_assignments_previousUserId_fkey"
    FOREIGN KEY ("previousUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "client_assignments_previousUserId_assignedAt_idx"
  ON "client_assignments" ("previousUserId", "assignedAt");

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "DepartmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "departments"
    ADD COLUMN IF NOT EXISTS "code" TEXT,
    ADD COLUMN IF NOT EXISTS "description" TEXT,
    ADD COLUMN IF NOT EXISTS "status" "DepartmentStatus" NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS "createdById" TEXT,
    ADD COLUMN IF NOT EXISTS "updatedById" TEXT,
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill department codes for existing rows.
WITH numbered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS rn
    FROM "departments"
)
UPDATE "departments" d
SET "code" = 'DEP-' || LPAD(numbered.rn::text, 3, '0')
FROM numbered
WHERE d.id = numbered.id AND d."code" IS NULL;

ALTER TABLE "departments"
    ALTER COLUMN "code" SET NOT NULL;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "departments_companyId_code_key" ON "departments"("companyId", "code");
CREATE INDEX IF NOT EXISTS "departments_companyId_status_idx" ON "departments"("companyId", "status");

-- Foreign keys
DO $$ BEGIN
    ALTER TABLE "departments"
      ADD CONSTRAINT "departments_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "departments"
      ADD CONSTRAINT "departments_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

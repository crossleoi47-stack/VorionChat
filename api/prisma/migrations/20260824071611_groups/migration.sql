-- AlterTable
ALTER TABLE "conversation_groups" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "group_members" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;

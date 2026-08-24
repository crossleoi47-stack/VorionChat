-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "showLastSeen" BOOLEAN NOT NULL DEFAULT true;

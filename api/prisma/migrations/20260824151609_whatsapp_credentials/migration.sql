-- CreateEnum
CREATE TYPE "WhatsappAccountStatus" AS ENUM ('UNVERIFIED', 'CONNECTED', 'ERROR');

-- AlterTable
ALTER TABLE "whatsapp_accounts" ADD COLUMN     "accessTokenEnc" TEXT,
ADD COLUMN     "appSecretEnc" TEXT,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "status" "WhatsappAccountStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "verifyTokenEnc" TEXT,
ALTER COLUMN "accessTokenRef" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "whatsapp_accounts_companyId_idx" ON "whatsapp_accounts"("companyId");

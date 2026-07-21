-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "eftDeclaredAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "eftNote" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accessActivatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accessExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "llmApiKeyEnc" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_accessExpiresAt_disabled_idx" ON "User"("accessExpiresAt", "disabled");

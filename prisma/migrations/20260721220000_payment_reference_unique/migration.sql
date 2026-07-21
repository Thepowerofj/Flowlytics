-- Short distinct EFT payment references (FL-XXXXXX); unique for admin lookup.
CREATE UNIQUE INDEX IF NOT EXISTS "User_eftReference_key" ON "User"("eftReference");

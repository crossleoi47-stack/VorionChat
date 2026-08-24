-- Login identity. Nullable so existing rows migrate cleanly; unique so it can
-- carry the tenant on its own (email + password sign-in).
ALTER TABLE "users" ADD COLUMN "email" TEXT;
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

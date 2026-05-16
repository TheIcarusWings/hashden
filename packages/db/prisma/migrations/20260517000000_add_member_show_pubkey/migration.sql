-- Add a per-(group, member) display preference. When false (the default),
-- read endpoints replace the member's pubkey with a stable per-den
-- anonymized id so visitors can't enumerate members by npub. Members can
-- opt in to publishing their npub in a given den by toggling this to true
-- via the dedicated preferences endpoint.
--
-- IF NOT EXISTS keeps this idempotent so the migration can be applied via
-- raw psql ahead of a Prisma redeploy, then no-op on db:migrate:deploy.

ALTER TABLE "Member"
  ADD COLUMN IF NOT EXISTS "showPubkey" BOOLEAN NOT NULL DEFAULT false;

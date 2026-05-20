-- Per-share worker (rig) identifier, parsed from the stratum worker name
-- `<den-slug>.<pubkey>.<rig-id>`. Nullable: miners that connect without a
-- rig-id (or via the legacy `<address>.<worker>` path) record NULL, which
-- the den-page worker count collapses into a single worker for that member.
-- Existing rows backfill to NULL, so the count stays correct (workers ==
-- members) until newly recorded shares carry rig-ids.
--
-- IF NOT EXISTS keeps the migration idempotent so it can be applied via
-- raw psql ahead of a Prisma redeploy, then no-op on db:migrate:deploy.

ALTER TABLE "Share"
  ADD COLUMN IF NOT EXISTS "workerId" TEXT;

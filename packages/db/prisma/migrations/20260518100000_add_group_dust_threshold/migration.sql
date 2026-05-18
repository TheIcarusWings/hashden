-- Per-den PPLNS dust threshold. Before this column existed, the value
-- came from the platform-wide DUST_THRESHOLD_SATS env var; now every
-- den carries its own override (default 10_000 sats matches the prior
-- env default, so behavior is unchanged for existing rows).
--
-- IF NOT EXISTS keeps the migration idempotent so it can be applied via
-- raw psql ahead of a Prisma redeploy, then no-op on db:migrate:deploy.

ALTER TABLE "Group"
  ADD COLUMN IF NOT EXISTS "dustThresholdSats" BIGINT NOT NULL DEFAULT 10000;

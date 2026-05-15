-- Add 'DELETED' to the Visibility enum so operators can soft-delete dens
-- without losing the historical share/payout records they may still need
-- for audit. Listings + new-member/share writes filter on visibility !=
-- 'DELETED' in application code.
--
-- IF NOT EXISTS makes this idempotent. The migration may be applied via
-- raw psql ahead of a Prisma redeploy (e.g. when bumping the schema on a
-- production DB before the new container image lands), and then Prisma's
-- db:migrate:deploy is a no-op on subsequent runs.
ALTER TYPE "Visibility" ADD VALUE IF NOT EXISTS 'DELETED';

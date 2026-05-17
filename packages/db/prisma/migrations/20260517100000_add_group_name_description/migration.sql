-- Add `name` and `description` columns to Group. Both live in the
-- signed kind-30078 event content already, but mirroring them on the
-- row lets the public REST API surface them without a per-request relay
-- fetch. The default '' keeps the migration safe for existing rows;
-- callers fall back to `slug` when name is empty.
--
-- IF NOT EXISTS keeps this idempotent so the SQL can be applied via
-- raw psql ahead of a Prisma redeploy, then no-op on db:migrate:deploy.

ALTER TABLE "Group"
  ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Group"
  ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';

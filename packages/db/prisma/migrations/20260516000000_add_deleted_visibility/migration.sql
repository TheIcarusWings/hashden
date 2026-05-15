-- Add 'DELETED' to the Visibility enum so operators can soft-delete dens
-- without losing the historical share/payout records they may still need
-- for audit. Listings + new-member/share writes filter on visibility !=
-- 'DELETED' in application code.
ALTER TYPE "Visibility" ADD VALUE 'DELETED';

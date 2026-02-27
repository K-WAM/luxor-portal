-- Add ACH processing tracking support for tenant bills (additive, reversible)

ALTER TABLE IF EXISTS tenant_bills
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

-- Rollback (manual):
-- ALTER TABLE IF EXISTS tenant_bills DROP COLUMN IF EXISTS processing_started_at;

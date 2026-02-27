-- Add ACH processing tracking support for owner billing invoices (additive, reversible)

ALTER TABLE IF EXISTS billing_invoices
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

-- Rollback (manual):
-- ALTER TABLE IF EXISTS billing_invoices DROP COLUMN IF EXISTS processing_started_at;

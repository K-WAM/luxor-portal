-- Add invoice_date to billing_invoices (additive, reversible)

ALTER TABLE IF EXISTS billing_invoices
  ADD COLUMN IF NOT EXISTS invoice_date date;

-- Rollback:
-- ALTER TABLE IF EXISTS billing_invoices DROP COLUMN IF EXISTS invoice_date;

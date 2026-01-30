-- Add invoice_number to billing_invoices (additive, reversible)

ALTER TABLE IF EXISTS billing_invoices
  ADD COLUMN IF NOT EXISTS invoice_number text;

-- Ensure invoice_number remains unique when set
CREATE UNIQUE INDEX IF NOT EXISTS billing_invoices_invoice_number_idx
  ON billing_invoices(invoice_number)
  WHERE invoice_number IS NOT NULL;

-- Rollback:
-- DROP INDEX IF EXISTS billing_invoices_invoice_number_idx;
-- ALTER TABLE IF EXISTS billing_invoices DROP COLUMN IF EXISTS invoice_number;

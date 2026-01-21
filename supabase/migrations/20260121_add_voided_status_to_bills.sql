-- Add voided status support to billing tables
-- This migration is ADDITIVE ONLY - no data is modified or deleted

-- ============================================
-- TENANT BILLS - Add voided tracking columns
-- ============================================

-- Add voided_at timestamp
ALTER TABLE IF EXISTS tenant_bills
  ADD COLUMN IF NOT EXISTS voided_at timestamptz;

-- Add voided_by (admin who voided the bill)
ALTER TABLE IF EXISTS tenant_bills
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add voided_reason for audit trail
ALTER TABLE IF EXISTS tenant_bills
  ADD COLUMN IF NOT EXISTS voided_reason text;

-- Create index for filtering active vs voided bills
CREATE INDEX IF NOT EXISTS idx_tenant_bills_status ON tenant_bills(status);

-- ============================================
-- BILLING INVOICES (Owner PM Fees) - Add voided tracking columns
-- ============================================

-- Add voided_at timestamp
ALTER TABLE IF EXISTS billing_invoices
  ADD COLUMN IF NOT EXISTS voided_at timestamptz;

-- Add voided_by (admin who voided the bill)
ALTER TABLE IF EXISTS billing_invoices
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add voided_reason for audit trail
ALTER TABLE IF EXISTS billing_invoices
  ADD COLUMN IF NOT EXISTS voided_reason text;

-- Add category column for expanded bill types
ALTER TABLE IF EXISTS billing_invoices
  ADD COLUMN IF NOT EXISTS category text;

-- Create index for filtering active vs voided bills
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON billing_invoices(status);

-- ============================================
-- COMMENTS for documentation
-- ============================================

COMMENT ON COLUMN tenant_bills.voided_at IS 'Timestamp when bill was voided (soft deleted)';
COMMENT ON COLUMN tenant_bills.voided_by IS 'Admin user ID who voided the bill';
COMMENT ON COLUMN tenant_bills.voided_reason IS 'Reason for voiding the bill (audit trail)';

COMMENT ON COLUMN billing_invoices.voided_at IS 'Timestamp when invoice was voided (soft deleted)';
COMMENT ON COLUMN billing_invoices.voided_by IS 'Admin user ID who voided the invoice';
COMMENT ON COLUMN billing_invoices.voided_reason IS 'Reason for voiding the invoice (audit trail)';
COMMENT ON COLUMN billing_invoices.category IS 'Bill category: maintenance, pm_fee, hoa, pool, garden, insurance, property_tax, repairs, other';

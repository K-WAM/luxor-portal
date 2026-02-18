-- Add tenant Stripe checkout tracking fields (additive, reversible)

ALTER TABLE IF EXISTS tenant_bills
  ADD COLUMN IF NOT EXISTS stripe_session_id text;

ALTER TABLE IF EXISTS tenant_bills
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

ALTER TABLE IF EXISTS tenant_bills
  ADD COLUMN IF NOT EXISTS paid_date date;

-- Rollback (manual):
-- ALTER TABLE IF EXISTS tenant_bills DROP COLUMN IF EXISTS paid_date;
-- ALTER TABLE IF EXISTS tenant_bills DROP COLUMN IF EXISTS stripe_payment_intent_id;
-- ALTER TABLE IF EXISTS tenant_bills DROP COLUMN IF EXISTS stripe_session_id;

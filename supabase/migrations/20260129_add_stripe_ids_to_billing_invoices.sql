-- Store Stripe IDs for invoice payments (optional, additive)

alter table if exists billing_invoices
  add column if not exists stripe_session_id text;

alter table if exists billing_invoices
  add column if not exists stripe_payment_intent_id text;

-- Rollback:
-- alter table if exists billing_invoices drop column if exists stripe_payment_intent_id;
-- alter table if exists billing_invoices drop column if exists stripe_session_id;

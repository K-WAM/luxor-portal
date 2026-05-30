-- Add idempotency markers for failed payment notification emails.
-- Rollback:
-- alter table if exists billing_invoices drop column if exists failed_payment_email_event_id;
-- alter table if exists billing_invoices drop column if exists failed_payment_email_last_status;
-- alter table if exists billing_invoices drop column if exists failed_payment_email_sent_at;
-- alter table if exists tenant_bills drop column if exists failed_payment_email_event_id;
-- alter table if exists tenant_bills drop column if exists failed_payment_email_last_status;
-- alter table if exists tenant_bills drop column if exists failed_payment_email_sent_at;

alter table if exists tenant_bills
  add column if not exists failed_payment_email_sent_at timestamptz,
  add column if not exists failed_payment_email_last_status text,
  add column if not exists failed_payment_email_event_id text;

alter table if exists billing_invoices
  add column if not exists failed_payment_email_sent_at timestamptz,
  add column if not exists failed_payment_email_last_status text,
  add column if not exists failed_payment_email_event_id text;

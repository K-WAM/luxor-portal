-- Add invoice PDF + payment link fields for bills

alter table if exists billing_invoices
  add column if not exists payment_link_url text;

alter table if exists tenant_bills
  add column if not exists invoice_url text;

alter table if exists tenant_bills
  add column if not exists payment_link_url text;

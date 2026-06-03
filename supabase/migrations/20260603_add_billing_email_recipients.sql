-- Add explicit billing email recipient fields and billing email audit log.
-- Rollback:
-- drop table if exists billing_email_audit_logs;
-- alter table if exists billing_invoices drop column if exists recipient_user_id;
-- alter table if exists billing_invoices drop column if exists recipient_invite_id;
-- alter table if exists billing_invoices drop column if exists recipient_source;
-- alter table if exists billing_invoices drop column if exists recipient_name;
-- alter table if exists billing_invoices drop column if exists recipient_email;
-- alter table if exists tenant_bills drop column if exists recipient_user_id;
-- alter table if exists tenant_bills drop column if exists recipient_invite_id;
-- alter table if exists tenant_bills drop column if exists recipient_source;
-- alter table if exists tenant_bills drop column if exists recipient_name;
-- alter table if exists tenant_bills drop column if exists recipient_email;

alter table if exists tenant_bills
  add column if not exists recipient_email text,
  add column if not exists recipient_name text,
  add column if not exists recipient_source text,
  add column if not exists recipient_invite_id uuid references tenant_invites(id) on delete set null,
  add column if not exists recipient_user_id uuid;

alter table if exists billing_invoices
  add column if not exists recipient_email text,
  add column if not exists recipient_name text,
  add column if not exists recipient_source text,
  add column if not exists recipient_invite_id uuid references tenant_invites(id) on delete set null,
  add column if not exists recipient_user_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenant_bills_recipient_source_check'
  ) then
    alter table tenant_bills
      add constraint tenant_bills_recipient_source_check
      check (recipient_source is null or recipient_source in ('auth_user', 'pending_invite', 'manual'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'billing_invoices_recipient_source_check'
  ) then
    alter table billing_invoices
      add constraint billing_invoices_recipient_source_check
      check (recipient_source is null or recipient_source in ('auth_user', 'pending_invite', 'manual'));
  end if;
end $$;

create index if not exists idx_tenant_bills_recipient_email on tenant_bills(recipient_email);
create index if not exists idx_tenant_bills_recipient_invite_id on tenant_bills(recipient_invite_id);
create index if not exists idx_tenant_bills_recipient_user_id on tenant_bills(recipient_user_id);

create index if not exists idx_billing_invoices_recipient_email on billing_invoices(recipient_email);
create index if not exists idx_billing_invoices_recipient_invite_id on billing_invoices(recipient_invite_id);
create index if not exists idx_billing_invoices_recipient_user_id on billing_invoices(recipient_user_id);

create table if not exists billing_email_audit_logs (
  id uuid primary key default gen_random_uuid(),
  bill_type text not null check (bill_type in ('tenant_bill', 'owner_invoice')),
  bill_id uuid not null,
  email_type text not null,
  recipient_email text,
  recipient_source text check (recipient_source is null or recipient_source in ('auth_user', 'pending_invite', 'manual')),
  status text not null check (status in ('sent', 'skipped', 'failed')),
  skip_reason text,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.billing_email_audit_logs enable row level security;

create index if not exists idx_billing_email_audit_bill on billing_email_audit_logs(bill_type, bill_id);
create index if not exists idx_billing_email_audit_created_at on billing_email_audit_logs(created_at);

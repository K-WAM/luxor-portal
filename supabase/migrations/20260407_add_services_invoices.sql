create table if not exists public.services_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  client_name text not null,
  client_email text not null,
  company_name text,
  description text not null,
  line_items jsonb not null default '[]'::jsonb,
  issue_date date not null,
  due_date date not null,
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  status text not null default 'issued',
  pdf_url text,
  hosted_page_token text not null unique,
  stripe_session_id text,
  stripe_payment_intent_id text,
  processing_started_at timestamptz,
  paid_date date,
  voided_at timestamptz,
  voided_reason text,
  invoice_type text not null default 'services',
  payment_account_scope text not null default 'luxor_platform',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_invoices_status_check check (status in ('draft', 'issued', 'processing', 'paid', 'void')),
  constraint services_invoices_scope_check check (invoice_type = 'services' and payment_account_scope = 'luxor_platform')
);

create index if not exists services_invoices_status_idx
  on public.services_invoices (status, due_date desc);

create index if not exists services_invoices_client_email_idx
  on public.services_invoices (client_email);

alter table public.services_invoices enable row level security;

drop trigger if exists set_services_invoices_updated_at on public.services_invoices;
create trigger set_services_invoices_updated_at
before update on public.services_invoices
for each row execute function public.update_updated_at_column();

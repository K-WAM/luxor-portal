-- Billing tables for owner property management fees
create table if not exists billing_invoices (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  month smallint not null check (month between 1 and 12),
  year integer not null,
  base_rent numeric(12,2),
  fee_percent numeric(6,3),
  fee_amount numeric(12,2), -- optional override
  total_due numeric(12,2),
  status text not null default 'due', -- due | paid | overdue | pending
  description text,
  due_date date,
  paid_date date,
  invoice_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists billing_invoices_property_month_year_idx
  on billing_invoices(property_id, owner_id, month, year);

-- Trigger to keep updated_at fresh
create or replace function billing_invoices_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists billing_invoices_updated_at on billing_invoices;
create trigger billing_invoices_updated_at
  before update on billing_invoices
  for each row execute procedure billing_invoices_set_updated_at();

alter table billing_invoices enable row level security;

-- RLS: admins full access
drop policy if exists "Admins all access billing" on billing_invoices;
create policy "Admins all access billing" on billing_invoices
  for all using (auth.jwt()->>'role' = 'admin');

-- RLS: owners can read their own invoices
drop policy if exists "Owners read own billing" on billing_invoices;
create policy "Owners read own billing" on billing_invoices
  for select using (
    auth.jwt()->>'role' = 'owner'
    and owner_id = auth.uid()
  );

-- Optional: allow owners to see invoices for properties they are associated to, if owner_id matches their user

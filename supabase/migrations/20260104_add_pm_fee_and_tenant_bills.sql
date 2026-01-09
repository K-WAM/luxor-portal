-- Add PM fee to monthly performance and create tenant bills table

-- PM fee column
alter table if exists property_monthly_performance
  add column if not exists pm_fee decimal(10,2) default 0;

-- Rebuild generated totals to include PM fee
alter table if exists property_monthly_performance
  drop column if exists total_expenses;

alter table if exists property_monthly_performance
  drop column if exists net_income;

alter table if exists property_monthly_performance
  add column total_expenses decimal(10,2) generated always as (
    coalesce(maintenance, 0) +
    coalesce(pool, 0) +
    coalesce(garden, 0) +
    coalesce(hoa_payments, 0) +
    coalesce(pm_fee, 0)
  ) stored;

alter table if exists property_monthly_performance
  add column net_income decimal(10,2) generated always as (
    coalesce(rent_income, 0) - (
      coalesce(maintenance, 0) +
      coalesce(pool, 0) +
      coalesce(garden, 0) +
      coalesce(hoa_payments, 0) +
      coalesce(pm_fee, 0)
    )
  ) stored;

-- Tenant bills table
create table if not exists tenant_bills (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  tenant_id uuid not null references auth.users(id) on delete cascade,
  bill_type text not null,
  description text,
  amount decimal(12,2) not null default 0,
  due_date date not null,
  status text not null default 'due',
  notify_tenant boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  month integer not null check (month >= 1 and month <= 12),
  year integer not null
);

create index if not exists idx_tenant_bills_property on tenant_bills(property_id);
create index if not exists idx_tenant_bills_tenant on tenant_bills(tenant_id);
create index if not exists idx_tenant_bills_year_month on tenant_bills(year, month);

alter table tenant_bills enable row level security;

drop policy if exists "Admins can manage all tenant bills" on tenant_bills;
create policy "Admins can manage all tenant bills" on tenant_bills
  for all
  using (auth.jwt()->>'role' = 'admin');

drop policy if exists "Tenants can view their own bills" on tenant_bills;
create policy "Tenants can view their own bills" on tenant_bills
  for select
  using (tenant_id = auth.uid());

-- Optional phone on tenant invites
alter table if exists tenant_invites
  add column if not exists phone text;

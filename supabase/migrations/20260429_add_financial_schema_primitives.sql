alter table if exists public.lease_agreements
  add column if not exists deposit numeric(12,2);

alter table if exists public.lease_agreements
  add column if not exists last_month_rent_collected boolean;

create table if not exists public.property_recurring_expense_schedules (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  expense_type text not null,
  amount numeric(12,2) not null,
  frequency text not null default 'monthly',
  effective_start_date date not null,
  effective_end_date date null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_recurring_expense_schedules_expense_type_check
    check (expense_type in ('hoa', 'pool', 'garden', 'pm_fee')),
  constraint property_recurring_expense_schedules_frequency_check
    check (frequency in ('monthly', 'annual')),
  constraint property_recurring_expense_schedules_effective_dates_check
    check (effective_end_date is null or effective_end_date >= effective_start_date)
);

create index if not exists idx_property_recurring_expense_schedules_property_id
  on public.property_recurring_expense_schedules(property_id);

create index if not exists idx_property_recurring_expense_schedules_property_type_start
  on public.property_recurring_expense_schedules(property_id, expense_type, effective_start_date desc);

alter table public.property_recurring_expense_schedules enable row level security;

drop policy if exists "Admins can manage recurring expense schedules" on public.property_recurring_expense_schedules;
create policy "Admins can manage recurring expense schedules" on public.property_recurring_expense_schedules
  for all
  using (auth.jwt()->>'role' = 'admin');

drop policy if exists "Owners can view recurring expense schedules for their properties" on public.property_recurring_expense_schedules;
create policy "Owners can view recurring expense schedules for their properties" on public.property_recurring_expense_schedules
  for select
  using (
    exists (
      select 1
      from public.user_properties up
      where up.property_id = property_recurring_expense_schedules.property_id
        and up.user_id = auth.uid()
        and up.role = 'owner'
    )
  );

drop trigger if exists set_property_recurring_expense_schedules_updated_at on public.property_recurring_expense_schedules;
create trigger set_property_recurring_expense_schedules_updated_at
before update on public.property_recurring_expense_schedules
for each row execute function public.update_updated_at_column();

alter table if exists public.property_monthly_performance
  add column if not exists rent_income_override numeric(10,2);

alter table if exists public.property_monthly_performance
  add column if not exists property_tax_override numeric(10,2);

alter table if exists public.property_monthly_performance
  add column if not exists market_value_override numeric(12,2);

alter table if exists public.property_monthly_performance
  add column if not exists notes text;

-- rollback guidance:
-- alter table if exists public.property_monthly_performance drop column if exists notes;
-- alter table if exists public.property_monthly_performance drop column if exists market_value_override;
-- alter table if exists public.property_monthly_performance drop column if exists property_tax_override;
-- alter table if exists public.property_monthly_performance drop column if exists rent_income_override;
-- drop table if exists public.property_recurring_expense_schedules;
-- alter table if exists public.lease_agreements drop column if exists last_month_rent_collected;
-- alter table if exists public.lease_agreements drop column if exists deposit;

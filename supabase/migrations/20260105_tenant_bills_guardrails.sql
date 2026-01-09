-- Guardrails for tenant bills history + backfill paid rent bills

-- Preserve tenant bill history even if a tenant account is removed
alter table if exists tenant_bills
  drop constraint if exists tenant_bills_tenant_id_fkey;

alter table if exists tenant_bills
  alter column tenant_id drop not null;

alter table if exists tenant_bills
  add constraint tenant_bills_tenant_id_fkey
  foreign key (tenant_id) references auth.users(id) on delete set null;

-- Ensure idempotent rent bill inserts
create unique index if not exists uniq_tenant_bills_tenant_property_month_type
  on tenant_bills(tenant_id, property_id, year, month, bill_type);

-- Backfill paid rent bills from historical monthly performance
insert into tenant_bills (
  property_id,
  tenant_id,
  bill_type,
  description,
  amount,
  due_date,
  status,
  notify_tenant,
  month,
  year
)
select
  pmp.property_id,
  up.user_id,
  'rent',
  null,
  pmp.rent_income,
  make_date(pmp.year, pmp.month, 1),
  'paid',
  false,
  pmp.month,
  pmp.year
from property_monthly_performance pmp
join user_properties up
  on up.property_id = pmp.property_id
  and up.role = 'tenant'
where pmp.year >= 2023
  and pmp.rent_income > 0
on conflict (tenant_id, property_id, year, month, bill_type) do nothing;

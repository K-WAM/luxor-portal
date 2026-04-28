create table if not exists public.lease_agreements (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  lease_start_date date not null,
  lease_end_date date not null,
  monthly_rent numeric(12,2) not null,
  status text not null default 'active',
  prior_lease_id uuid null references public.lease_agreements(id) on delete set null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lease_agreements_property_id on public.lease_agreements(property_id);
create index if not exists idx_lease_agreements_status on public.lease_agreements(status);
create index if not exists idx_lease_agreements_start_end on public.lease_agreements(lease_start_date, lease_end_date);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lease_agreements_status_check'
  ) then
    alter table public.lease_agreements
      add constraint lease_agreements_status_check
      check (status in ('upcoming', 'active', 'expired', 'terminated'));
  end if;
end $$;

create table if not exists public.lease_agreement_tenants (
  id uuid primary key default gen_random_uuid(),
  lease_agreement_id uuid not null references public.lease_agreements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (lease_agreement_id, user_id)
);

create index if not exists idx_lease_agreement_tenants_lease_id on public.lease_agreement_tenants(lease_agreement_id);
create index if not exists idx_lease_agreement_tenants_user_id on public.lease_agreement_tenants(user_id);

alter table public.lease_agreements enable row level security;
alter table public.lease_agreement_tenants enable row level security;

drop policy if exists "Admins can manage lease agreements" on public.lease_agreements;
create policy "Admins can manage lease agreements" on public.lease_agreements
  for all
  using (auth.jwt()->>'role' = 'admin');

drop policy if exists "Owners and tenants can view lease agreements for their properties" on public.lease_agreements;
create policy "Owners and tenants can view lease agreements for their properties" on public.lease_agreements
  for select
  using (
    exists (
      select 1
      from public.user_properties up
      where up.property_id = lease_agreements.property_id
        and up.user_id = auth.uid()
    )
    or auth.jwt()->>'role' = 'admin'
  );

drop policy if exists "Admins can manage lease agreement tenants" on public.lease_agreement_tenants;
create policy "Admins can manage lease agreement tenants" on public.lease_agreement_tenants
  for all
  using (auth.jwt()->>'role' = 'admin');

drop policy if exists "Owners and tenants can view lease agreement tenants for their properties" on public.lease_agreement_tenants;
create policy "Owners and tenants can view lease agreement tenants for their properties" on public.lease_agreement_tenants
  for select
  using (
    exists (
      select 1
      from public.lease_agreements la
      join public.user_properties up on up.property_id = la.property_id
      where la.id = lease_agreement_tenants.lease_agreement_id
        and up.user_id = auth.uid()
    )
    or auth.jwt()->>'role' = 'admin'
  );

drop trigger if exists set_lease_agreements_updated_at on public.lease_agreements;
create trigger set_lease_agreements_updated_at
before update on public.lease_agreements
for each row execute function public.update_updated_at_column();

insert into public.lease_agreements (
  property_id,
  lease_start_date,
  lease_end_date,
  monthly_rent,
  status
)
select
  p.id,
  p.lease_start,
  p.lease_end,
  coalesce(p.target_monthly_rent, 0),
  case
    when p.lease_start > current_date then 'upcoming'
    when p.lease_end < current_date then 'expired'
    else 'active'
  end
from public.properties p
where p.lease_start is not null
  and p.lease_end is not null
  and not exists (
    select 1
    from public.lease_agreements la
    where la.property_id = p.id
      and la.lease_start_date = p.lease_start
      and la.lease_end_date = p.lease_end
  );

insert into public.lease_agreement_tenants (lease_agreement_id, user_id)
select
  la.id,
  up.user_id
from public.lease_agreements la
join public.properties p
  on p.id = la.property_id
join public.user_properties up
  on up.property_id = p.id
 and up.role = 'tenant'
where la.lease_start_date = p.lease_start
  and la.lease_end_date = p.lease_end
on conflict (lease_agreement_id, user_id) do nothing;

-- rollback guidance:
-- drop table if exists public.lease_agreement_tenants;
-- drop table if exists public.lease_agreements;

alter table if exists public.tenant_bills
  add column if not exists bill_scope text not null default 'tenant';

alter table if exists public.tenant_bills
  add column if not exists lease_agreement_id uuid null references public.lease_agreements(id) on delete set null;

create index if not exists idx_tenant_bills_bill_scope
  on public.tenant_bills(bill_scope);

create index if not exists idx_tenant_bills_lease_agreement_id
  on public.tenant_bills(lease_agreement_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenant_bills_bill_scope_check'
  ) then
    alter table public.tenant_bills
      add constraint tenant_bills_bill_scope_check
      check (bill_scope in ('tenant', 'lease'));
  end if;
end $$;

create unique index if not exists uniq_tenant_bills_lease_rent_security_active
  on public.tenant_bills(lease_agreement_id, bill_type, due_date)
  where bill_scope = 'lease'
    and bill_type in ('rent', 'security_deposit')
    and status <> 'voided';

-- Rollback:
-- drop index if exists public.uniq_tenant_bills_lease_rent_security_active;
-- alter table if exists public.tenant_bills drop constraint if exists tenant_bills_bill_scope_check;
-- drop index if exists public.idx_tenant_bills_lease_agreement_id;
-- drop index if exists public.idx_tenant_bills_bill_scope;
-- alter table if exists public.tenant_bills drop column if exists lease_agreement_id;
-- alter table if exists public.tenant_bills drop column if exists bill_scope;

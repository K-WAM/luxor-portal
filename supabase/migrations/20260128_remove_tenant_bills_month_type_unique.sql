-- Allow multiple tenant bills of the same type within a month
-- This supports advance/partial rent payments within the same billing period.

-- Drop unique index enforcing one bill per tenant/property/month/type
drop index if exists uniq_tenant_bills_tenant_property_month_type;

-- Add a non-unique index for query performance
create index if not exists idx_tenant_bills_tenant_property_month_type
  on tenant_bills(tenant_id, property_id, year, month, bill_type);

-- Rollback:
-- drop index if exists idx_tenant_bills_tenant_property_month_type;
-- create unique index if not exists uniq_tenant_bills_tenant_property_month_type
--   on tenant_bills(tenant_id, property_id, year, month, bill_type);

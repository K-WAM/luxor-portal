-- Add Zelle recipient name per owner/property association (additive, reversible)
alter table if exists user_properties
  add column if not exists zelle_recipient text;

-- Rollback:
-- alter table if exists user_properties drop column if exists zelle_recipient;

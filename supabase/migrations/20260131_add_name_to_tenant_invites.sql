-- Add name field to tenant_invites
alter table if exists tenant_invites
  add column if not exists name text;

-- Rollback
-- alter table if exists tenant_invites drop column if exists name;

-- Add phone_e164 field to tenant_invites
alter table if exists tenant_invites
  add column if not exists phone_e164 text;

-- Rollback
-- alter table if exists tenant_invites drop column if exists phone_e164;

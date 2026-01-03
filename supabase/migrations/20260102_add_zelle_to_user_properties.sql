-- Add Zelle payout details per owner/property association
alter table if exists user_properties
  add column if not exists zelle_email text;

alter table if exists user_properties
  add column if not exists zelle_phone text;

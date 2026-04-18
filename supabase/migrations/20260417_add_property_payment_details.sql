alter table if exists public.properties
  add column if not exists zelle_email text,
  add column if not exists zelle_phone text,
  add column if not exists zelle_recipient text,
  add column if not exists stripe_connected_account_id text;


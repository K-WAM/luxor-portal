create table if not exists public.owner_stripe_accounts (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_connected_account_id text,
  stripe_status text not null default 'not_connected',
  charges_enabled boolean,
  payouts_enabled boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.owner_stripe_accounts enable row level security;

drop trigger if exists set_owner_stripe_accounts_updated_at on public.owner_stripe_accounts;
create trigger set_owner_stripe_accounts_updated_at
before update on public.owner_stripe_accounts
for each row execute function public.update_updated_at_column();

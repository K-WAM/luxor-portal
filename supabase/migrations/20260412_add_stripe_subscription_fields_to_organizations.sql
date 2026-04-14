-- Adds Stripe customer and subscription identifiers for self-serve organizations.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Rollback:
-- ALTER TABLE public.organizations DROP COLUMN IF EXISTS stripe_customer_id;
-- ALTER TABLE public.organizations DROP COLUMN IF EXISTS stripe_subscription_id;

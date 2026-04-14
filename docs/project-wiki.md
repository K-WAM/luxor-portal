# Luxor Project Wiki

## Overview

Luxor is now a dual-portal system built from two separate Next.js apps that share one Supabase project:

- `luxor-portal/` -> `portal.luxordev.com` -> PM portal for admins, PM-invited owners, and tenants
- `luxor-subscribe/` -> `subscribe.luxordev.com` -> Luxor Subscribe for self-registered owners, their tenants, and admin oversight

Both apps use:

- Next.js 15 App Router
- React 18
- TypeScript 5 strict mode
- Supabase Auth + Postgres + RLS
- Tailwind CSS 4
- Stripe
- Shared Luxor business logic in each app's `lib/`

## Workspace Layout

```text
LuxApp/
  luxor-portal/   PM portal app
  luxor-subscribe/ Luxor Subscribe app
  docs/           workspace docs
  supabase/       shared workspace-level Supabase assets
```

Note: in this workspace, `luxor-portal/` is the current Git repo root and `luxor-subscribe/` is the sibling Luxor Subscribe app created from the portal split.

## Portal Responsibilities

### Luxor Portal (`luxor-portal/`)

Use this app for:

- admin / PM workflows
- PM-invited owner dashboards
- tenant portal access
- PM billing, owner billing, services billing, maintenance, documents, and financial reporting

Do not use this app for:

- public self-signup
- self-serve onboarding
- Stripe subscription management for owner plans

### Luxor Subscribe (`luxor-subscribe/`)

Use this app for:

- self-registered owners
- subscription onboarding
- Stripe-hosted checkout and billing portal
- self-managed owner properties, tenants, bills, maintenance, and documents
- admin visibility into self-serve organizations and users

Do not use this app for:

- PM invite flows
- PM billing/invoice pages
- PM services billing
- PM-only admin financials pages

## User Model

### PM Portal users

- Admin / PM: platform operators
- PM-invited owners: access assigned properties and PM-managed financial data
- Tenants: pay bills, access documents, submit maintenance

### Self-Serve users

- Self-serve owners: create accounts, complete onboarding, subscribe through Stripe
- Their tenants: invited by self-serve owners
- Admin: can inspect self-serve organizations and users

## Database Model

Both apps use the same Supabase project.

### Shared organization fields

`organizations` now carries subscription context for self-serve owners:

- `product_type`
- `subscription_tier`
- `subscription_status`
- `trial_end_date`
- `stripe_customer_id`
- `stripe_subscription_id`

### Important distinction

- PM-invited owners are managed through `user_properties`
- Self-serve owners are identified through `organization_members` + `organizations`

## Auth and Routing

### Shared auth flow

- browser auth state is resolved by Supabase
- `app/api/me` returns effective role plus organization context
- middleware guards `/admin`, `/owner`, and `/tenant`

### Portal routing

- PM portal sign-in sends owners to `/owner`
- self-serve app sign-in sends owners with no org to `/onboarding`

## Billing and Stripe

### PM portal

- keeps PM billing routes and Stripe payment flows already used for invoices and tenant payments
- does not expose self-signup or self-serve plan management

### Self-serve app

- `POST /api/onboarding` creates or reuses the organization row
- `POST /api/stripe/checkout` creates a Stripe Checkout Session for `base` or `pro`
- `POST /api/stripe/portal` opens Stripe Customer Portal
- `POST /api/stripe/webhook` syncs subscription lifecycle state back to `organizations`

### Stripe status sync

Self-serve webhook handles:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

It also retains tenant bill payment webhook behavior already present in the codebase.

## Key Routes

### PM portal key routes

- `/` sign-in
- `/admin`
- `/owner`
- `/tenant`

### Self-serve key routes

- `/` sign-in
- `/signup`
- `/onboarding`
- `/owner`
- `/owner/settings?tab=plan`
- `/admin`
- `/admin/organizations`
- `/admin/tenants`

## Admin Cross-Portal Access

Each admin surface should link to the other:

- PM portal admin links to `https://subscribe.luxordev.com/admin`
- self-serve admin links to `https://portal.luxordev.com/admin`

Admins authenticate with the same Supabase-backed credentials on both apps.

## Environment Variables

### Shared across both Vercel projects

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `STRIPE_SECRET_KEY`
- `RESEND_API_KEY`
- `MAINTENANCE_EMAIL_TO`

### Different per app

- `NEXT_PUBLIC_APP_URL`
- `STRIPE_WEBHOOK_SECRET`

### Self-serve only

- `STRIPE_PRICE_BASE`
- `STRIPE_PRICE_PRO`

## Deployment Model

### PM portal Vercel project

- root directory: `luxor-portal`
- domain: `portal.luxordev.com`

### Self-serve Vercel project

- root directory: `luxor-subscribe`
- domain: `subscribe.luxordev.com`

### DNS

Both subdomains should CNAME to `cname.vercel-dns.com`.

## Maintenance Rules

Whenever the architecture, routes, billing flows, onboarding flow, environment variables, deployment steps, or user-role behavior changes:

1. update this wiki
2. update `CLAUDE.md`
3. keep both portal copies aligned if the change affects both apps

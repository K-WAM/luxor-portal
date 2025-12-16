# Copilot / AI Agent Instructions for Luxor Portal

Purpose: quick, actionable context so an AI coding agent can be productive immediately.

Big picture
- Tech stack: Next.js (app router, `app/`), TypeScript, React, Tailwind, Supabase for auth/DB.
- UI is organized by role: `app/admin`, `app/owner`, `app/tenant` — each uses `layout.tsx` + `page.tsx` conventions.
- Server/API: `app/api/**/route.ts` contains Next 13 route handlers (server functions). Use server-side Supabase client for privileged ops.

Key files & patterns (reference examples)
- Entry/layouts: `app/layout.tsx`, role sub-layouts under `app/admin/layout.tsx` etc.
- API handlers: any `app/api/*/route.ts` — handlers export HTTP methods. Example: `app/api/admin/dashboard/route.ts`.
- Supabase clients:
  - Browser client: `lib/supabase/client.ts` (uses NEXT_PUBLIC_* keys). Use in client components only.
  - Server/admin client: `lib/supabase/server.ts` (uses `SUPABASE_SERVICE_ROLE_KEY`). Never expose this key to client.
- Business logic: `lib/financial-calculations.ts` and `lib/calculations/owner-metrics.ts` contain canonical financial helpers — reuse them instead of duplicating logic.
- Auth context: `app/context/AuthContext.tsx` centralizes auth state for client components.
- Shared UI: `app/components/` (e.g., `Navbar.tsx`, `charts/GaugeChart.tsx`) — follow their naming/props patterns.

Conventions and important constraints
- App router conventions: all UI pages use `page.tsx` and layouts; prefer server components for data fetching where possible.
- API routes are file-based `route.ts` handlers (not pages/api). Methods are implemented as exported functions for HTTP verbs.
- Use `supabaseAdmin` from `lib/supabase/server.ts` in server-side API routes when you need elevated privileges; do not leak `SUPABASE_SERVICE_ROLE_KEY`.
- Financial calculations are centralized. When changing metrics, update `lib/financial-calculations.ts` and `lib/calculations/owner-metrics.ts` and ensure tests or UI remain consistent.
- Database migrations live under `supabase/migrations/` and are SQL files named by timestamp — coordinate schema changes with these files.

Run / build / debugging
- Start dev server: `npm run dev` (uses `next dev`).
- Build for prod: `npm run build` then `npm run start`.
- Lint: `npm run lint` (uses `eslint`).
- Environment: expect `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` for client; `SUPABASE_SERVICE_ROLE_KEY` for server tasks. Local `.env` not committed.

Integration points
- Supabase: DB + auth. Look at SQL migrations and API handlers for table usage patterns.
- Charts: `chart.js` + `react-chartjs-2` and `recharts` used in `components/charts`.

What AI agents should do first (practical tasks)
- When modifying data logic, search for uses of the helper in `lib/` and adjust API handlers under `app/api/**` accordingly.
- For UI changes, follow existing component props (see `Navbar.tsx`, `GaugeChart.tsx`) and reuse Tailwind classes.
- For new API endpoints, mirror existing `route.ts` structure (export GET/POST etc.) and use `supabaseAdmin` for server-only DB queries.

Examples (quick patterns)
- Server API example: open `[app/api/.../route.ts]` and import `supabaseAdmin` from `lib/supabase/server.ts` for queries that require service role.
- Client supabase example: `const supabase = createClient()` from `lib/supabase/client.ts` inside components or client hooks.

Safety & secrets
- Never commit service keys. If a PR adds `SUPABASE_SERVICE_ROLE_KEY` usage, ensure it's only referenced in server-side code (`route.ts`) and not exported to client bundles.

Editing guidance for maintainers
- Prefer updates to shared helpers over local fixes in components to keep calculations consistent.
- When adding migrations, follow timestamped naming in `supabase/migrations/` and add brief README notes if the migration requires manual steps.

If something is unclear or you need local context (env values, running migrations), ask the human: include which file you plan to edit and a one-line intent.

— End —

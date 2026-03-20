# LUXOR ENGINEERING GUARDRAILS

## 1. Purpose

Governs all development and AI-assisted changes to Luxor (Admin, Owner, Tenant portals). Applies to code changes, bug fixes, features, and DB schema modifications.

---

## 2. System Stability

Luxor is near-production. Architecture is intentional and must be preserved.
- Working code is assumed correct unless proven otherwise
- Refactoring prohibited unless explicitly requested
- All changes must integrate with existing patterns

---

## 3. Data & API Safety (Non-Negotiable)

- **No deletion** of financial records (`property_monthly_performance`, `billing_invoices`, `tenant_bills`)
- **Schema changes additive only** — new columns must be nullable or have defaults; no removals/renames
- **RLS policies immutable** without explicit approval
- **API responses** — never remove or rename existing fields; add only
- **Types** — `CanonicalMetrics`, `PropertyData`, `MonthlyDataRow` interfaces are frozen; extend with optional properties only
- **Hook signatures** — `useAuth()`, `usePeriodFilter()` return types cannot change

---

## 4. Reuse-First (Mandatory Order)

Before writing new code:
1. `app/components/` — `GaugeChart`, `PeriodToggle`, `ROISpeedometer`, `InvestmentPerformanceTable`
2. `app/hooks/` — `usePeriodFilter`, `useAuth`
3. `lib/` — `canonical-metrics.ts` (ALL financials), `date-only.ts`, `route-helpers.ts`, `supabase/`
4. Existing pattern in same portal (`app/admin/`, `app/owner/`, `app/tenant/`, `app/api/`)

**Prohibited:** New financial calc functions, new auth helpers, new date utilities, new Supabase clients, duplicating existing logic.

---

## 5. Required Workflow

1. **Investigate** — read all files to be modified, find reusable code
2. **Plan** — list files to modify/create, dependencies, DB changes
3. **Impact analysis** — downstream effects, breaking changes (must be NONE)
4. **Confirm** — present plan, wait for approval
5. **Execute** — implement, validate

---

## 6. UI Stability

Portal layouts, navigation, color scheme, and component styling are final. No moving sidebar items, changing themes, altering dimensions, or adding animations without request.

---

## 7. Locked Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Runtime | React 18, TypeScript 5 strict |
| Database | Supabase (PostgreSQL) + RLS |
| Styling | Tailwind CSS 4 |
| Charts | Chart.js, Recharts |

No state libraries, alternative auth/DB, CSS-in-JS, or ORM layers.

---

## 8. AI Boundaries

**Must:** Investigate before proposing; reuse existing patterns; present plan before executing; make minimal changes; confirm backward compatibility.

**Must NOT:** Refactor working code; add abstractions for future use; modify code outside scope; propose architectural changes; add comments/docstrings to unchanged code.

---

## 9. Enforcement

Violations → automatic rejection: missing investigation, breaking API/types, data deletion, duplicating utilities, stack changes, UI modifications without request.

---

## Appendix A: Code Patterns

### A.1 Auth (Route Handlers)
```typescript
import { getAuthContext, isAdmin } from '@/lib/auth/route-helpers';
const { user, role } = await getAuthContext();
if (!user || !isAdmin(role)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
```

### A.2 Financial Calculations
```typescript
import { calculateCanonicalMetrics } from '@/lib/calculations/canonical-metrics';
const metrics = calculateCanonicalMetrics(property, monthlyData, { estimatedAnnualPropertyTax });
```

### A.3 Date Handling
```typescript
import { parseDateOnly, formatDateOnly, getDateOnlyParts } from '@/lib/date-only';
```

### A.4 Period Filter
```typescript
import { usePeriodFilter } from '@/app/hooks/usePeriodFilter';
const { periodType, monthsInPeriod, label } = usePeriodFilter({ leaseStart, leaseEnd, currentYear });
```

### A.5 API Responses
```typescript
return NextResponse.json(data);                                         // 200
return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
```

---

## Appendix B: File Locations

| Purpose | Location |
|---------|----------|
| Page components | `app/[portal]/[feature]/page.tsx` |
| API routes | `app/api/[domain]/route.ts` |
| Reusable components | `app/components/` |
| Financial calculations | `lib/calculations/canonical-metrics.ts` |
| Date utilities | `lib/date-only.ts` |
| Auth helpers | `lib/auth/route-helpers.ts` |
| Supabase clients | `lib/supabase/` |
| SQL migrations | `supabase/migrations/` |
| Docs/planning | `docs/` |

---

## Appendix C: Operational Lessons

### C.1 Supabase Column Type Coercion
Numeric columns may return `string` or `number`. Always: `parseFloat(String(row?.col ?? 0))`

### C.2 Email: Resend Only, Non-Blocking
```typescript
sendEmail({ ... }).catch(() => {});  // non-blocking, never fatal
```
Env: `RESEND_API_KEY`, `MAINTENANCE_EMAIL_TO` (default: connect@luxordev.com).

### C.3 Computed Fields at Query Time
Derived aggregates (maintenance open/closed/red counts) computed in API routes, not stored as columns.

### C.4 Repo Cleanliness
Single logo: `public/luxor-logo.svg`. No duplicate assets. New files go in correct locations per Appendix B.

### C.5 Disabling Dead JSX
Wrap in `{false && (...)}` temporarily. Clean up in a dedicated pass.

### C.6 Batch Save Over onBlur
Multi-input forms use a single Save button. Avoid per-field `onBlur` handlers.

### C.7 Git: Verify Before Rebasing
```bash
git log --oneline origin/main -10
git show --name-only <commit-hash>
```

### C.9 Owner Dashboard Design Conventions
- **Section order:** ROI Gauges → Narrative → Metrics (InvestmentPerformanceTable) → Thresholds → Luxor AI → Charts
- **Performance thresholds:** Excellent: ROI ≥5% AND Maint <5%; Good: ROI ≥3% AND Maint <7%; Needs Attention: below these
- **Maintenance target is <5%.** Do not use 4% as the target anywhere in narratives or thresholds.
- **Projected ROI calc** (annualized from elapsed months): `(ytdNetIncome / elapsedMonths * 12) / costBasis * 100`
- **InvestmentPerformanceTable** is the single shared component for the Excel A29:I43 layout — used in owner dashboard and admin financials monthly tab. Never rebuild this table inline.
- **Investment Report narrative** reads: income vs plan, maintenance % (target <5%), projected vs expected ROI, property tax note, home value with appreciation and months owned.
- **Chart.js:** `devicePixelRatio: 2`, `borderRadius: 3-4`, grid `#f1f5f9`, tooltip `rgba(15,23,42,0.92)`.

### C.10 Context File for New Chats
Stack summary: `C:\Users\karee\.claude\projects\c--Users-karee-Desktop-LuxApp\memory\project_stack.md`

### C.11 Narrative Grammar
"is rated **{label}**" not "is **{label}**". Plan ROI in narrative = period-proportional.

### C.12 Admin Dashboard — API Conventions
- `performance_status` computed server-side in `/api/admin/dashboard`; do NOT recompute client-side.
- `current_month_rent_paid`: `monthlyData.find(r => r.month === currentMonth)?.rent_income > 0`.

### C.13 Admin Financials — Projected Summary
Reuse `annualPlan` useMemo. Do NOT recompute inline. `annualPlan.maintenance = rent * 0.05`.

### C.14 Sidebar Logos
48×48px across all 3 portals. No subtitle text.

### C.15 Tenant Payments — Future Month Status
Bills unpaid where `dueDate > now + 10 days` → show blank status badge.

### C.16 Owner Dashboard — Investment Metrics Table
5-column: label | YTD Actual | Plan (period) | YE Target | Δ vs Plan. Delta: `(actual - plan) / |plan| * 100`.

### C.17 Monthly Tab — YTD Summary Cards
- `actualYtd = canonicalMetrics.ytd`. Subtract `lastMonthRentBonus` for display; show footnote.
- `ytdAppreciation` = earliest→latest `property_market_estimate` in `performanceYear`. NOT since-purchase.

### C.18 SQL Disclosure Rule
End every response with "SQL to run" — even if none: _"No SQL required."_

### C.19 Temporal Dead Zone (TDZ)
`const` in `useMemo` callback referencing a later `const` = ReferenceError. Declare before the useMemo that uses them.

### C.20 YTD vs Since-Purchase Appreciation
- **YTD** = latest − earliest `property_market_estimate` in current year. Use cost_basis as % denominator.
- **Since Purchase** = `current_market_value − cost_basis`. Never confuse these.

---

## 11. Recurring Session Checklist

### 11.1 After Every Prompt
New files go in correct locations (Appendix B). No new files at root of `luxor-portal/` unless framework config.

### 11.2 After Any DB Schema Change
- Migration file in `supabase/migrations/` with timestamp prefix
- Uses `IF NOT EXISTS` guards; has defaults/nullable; includes rollback SQL comment
- Tell user: "Run this SQL in Supabase Dashboard > SQL Editor"

**Pending migrations:** `supabase/migrations/20241211_add_roi_and_timestamps.sql`

### 11.3 After Every Session
Stage specific files, commit with clear message, push to `origin main`, confirm success.

### 11.4 Guardrails Self-Update
Add new lessons to Appendix C. Update version and Document Control.

---

## Document Control

| Field | Value |
|-------|-------|
| Version | 1.3 |
| Status | Active |
| Last Updated | 2026-03-20 — Condensed to ultra-concise; fixed C.9 maintenance threshold to 5%; added InvestmentPerformanceTable to reuse list |

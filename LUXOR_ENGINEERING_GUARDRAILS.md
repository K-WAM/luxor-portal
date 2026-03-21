<!-- COPY-PASTE PROMPT STARTER -->
> **Start every session with:** "Read `LUXOR_ENGINEERING_GUARDRAILS.md` and apply all rules before proceeding."

---

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

## 8. AI Boundaries — Always-On Rules

**Must always:**
- Investigate before proposing; read files before modifying
- Reuse existing patterns (Section 4); place new files per Appendix B
- Present plan before executing; make minimal changes; confirm backward compatibility
- **Use the relevant Claude skill** for any task that maps to one (see C.22)
- **Eliminate dead code** created as a side-effect of any change — imports, helpers, useMemos, and IIFE blocks that are no longer referenced
- **Reconcile conflicting code** — if a change makes another calculation, constant, or branch unreachable or contradictory, fix or remove it in the same PR
- **Update `LUXOR_ENGINEERING_GUARDRAILS.md`** at the end of every session with new lessons; bump version
- **End every response** with: _"Do you have more input, or shall I push to GitHub?"_ — never push without explicit user approval

**Must NOT:**
- Refactor working code; add abstractions for future use
- Modify code outside scope; propose architectural changes
- Add comments/docstrings to unchanged code
- Leave orphaned imports, unused state, or duplicate logic after a change
- Push to GitHub without the user explicitly saying to push

---

## 9. Enforcement

Violations → automatic rejection: missing investigation, breaking API/types, data deletion, duplicating utilities, stack changes, UI modifications without request, dead code left behind, conflicting logic not reconciled, pushing to GitHub without approval.

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

### C.5 Dead Code After Changes
When a change replaces or removes a feature, immediately remove: orphaned imports, unused useMemos, helper functions, IIFE blocks, and state variables. Do not wrap in `{false && ...}` as a temporary measure — delete the code. Dead code left behind is a guardrails violation.

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

### C.21 Plan Gross Income — Deposit Is NOT Subtracted
Excel B26: `=SUMIFS(actual_monthly_rent, dates, "<="&EOMONTH(TODAY(),0)) − deposit` — this is "actual recurring rent to date", not a budget plan. Our code intentionally differs:
- **Plan** = `target_monthly_rent × elapsedMonths` (pure budget target). Never subtract deposit from plan.
- **Deposit is isolated**: canonical metrics adds it via `lastMonthRentBonus` to actual YTD; admin monthly tab subtracts it with a footnote.
- **Past incident**: Subtracting deposit from plan caused false Δ negatives in month 1 and distorted all future month comparisons.

### C.22 Always Use Relevant Claude Skills
Before writing code to process files or perform specialized tasks, check if a Claude skill applies:

| Task | Skill |
|------|-------|
| Excel formulas / spreadsheet edits | `document-skills:xlsx` — use `load_workbook(data_only=False)` to read raw formulas |
| PDF read/create/merge | `document-skills:pdf` |
| Word documents (.docx) | `document-skills:docx` |
| PowerPoint (.pptx) | `document-skills:pptx` |
| UI testing / Playwright | `document-skills:webapp-testing` |
| Claude API / Anthropic SDK | `document-skills:claude-api` |
| Internal comms / reports | `document-skills:internal-comms` |

**Never eyeball Excel cell values** — always extract formula strings via the skill and compare each formula to the equivalent code. Report matches and discrepancies explicitly.

Reference file: `docs/excel property reporting example.xlsx` (sheet "SWE 26").

Past failure: maintenance target showed as 4% in code because formulas were assumed, not read. The skill confirmed 5%.

### C.23 Admin Financials — Deposit Exclusion & ROI Consistency
- **`displayYtd`** = `actualYtd` with last-month deposit subtracted from `rent_income` and `net_income`. Always pass `displayYtd` (not `actualYtd`) to `InvestmentPerformanceTable` so gross income, net income, and ROI all match the YTD Performance cards.
- **`maintenancePct` when using `displayYtd`**: recompute inline as `displayYtd.rent_income > 0 ? (displayYtd.maintenance / displayYtd.rent_income * 100) : 0` — do NOT use `canonicalMetrics.maintenance_pct` (which still includes the deposit in rent).
- **`roi.preTax` and `roi.postTax`**: compute inline from `displayYtd.net_income / costBasis * 100`, not from `canonicalMetrics.roi_pre_tax`/`roi_post_tax`. This keeps them consistent with the YTD Income ROI card.
- **YE Target PM fee**: `(planned_pm_fee_monthly * 12)` added to `yeTargetTotalExp` so YE Target column totals reconcile.

### C.24 PM Fee Plan Input
`planned_pm_fee_monthly` (numeric, nullable) lives on the `properties` table. It powers:
- `plannedYtd.pm_fee = pmFeeMonthly * monthsElapsedPlanned` (included in `total_expenses` and `net_income`)
- `annualPlan.pmFee = pmFeeMonthly * 12` (included in `totalExpenses`)
- `yeTarget.pmFee = pmFeeMonthly * 12` for the YE Target column in `InvestmentPerformanceTable`
Pattern mirrors `planned_pool_cost` / `planned_garden_cost`. API route GET select and PUT numericFields must both include it.

---

## Appendix D: Calculation → Output Map

This is the authoritative reference for which calculation powers which UI element. When in doubt, look here first. **Do not introduce a second version of any calculation listed here.**

### D.1 Deposit / Last-Month Rent Handling

| Variable | Formula | Source |
|----------|---------|--------|
| `lastMonthRentBonus` | `target_monthly_rent` if `last_month_rent_collected`, else `deposit` | `app/admin/financials/page.tsx` |
| `actualYtd` | `canonicalMetrics.ytd` — raw totals **including** deposit in `rent_income` | canonical-metrics.ts |
| `displayYtd` | `{ ...actualYtd, rent_income: actualYtd.rent_income − lastMonthRentBonus, net_income: actualYtd.net_income − lastMonthRentBonus }` | admin financials page |

> `displayYtd` is the only version that should appear in the UI. `actualYtd` is intermediate only.

---

### D.2 Admin Financials — YTD Performance Cards (above the table)

| Card | Formula | Variable |
|------|---------|----------|
| YTD Income ROI | `displayYtd.net_income / calculatedTotalCost * 100` | admin financials page |
| YTD Home Appreciation | `(latest − earliest market_estimate in year) / cost_basis * 100` | `ytdAppreciation.pct` |
| Appreciation Since Purchase | `(current_market_value − cost_basis) / cost_basis * 100` | `purchaseAppreciation.pct` |
| Total YTD ROI (incl. Appr.) | `(displayYtd.net_income + purchaseAppreciation.value) / calculatedTotalCost * 100` | admin financials page |

---

### D.3 Admin Financials — InvestmentPerformanceTable (Income & Expenses section)

All **Actual** values come from `displayYtd` (deposit excluded). See C.23.

| Row | Actual | Plan | YE Target |
|-----|--------|------|-----------|
| Gross Income | `displayYtd.rent_income` | `plannedYtd.rent_income` = `target_monthly_rent × monthsElapsed` (lease-start prorated) | `yeTarget.rent_income` (user-entered) |
| Maintenance | `displayYtd.maintenance` | `plannedYtd.maintenance` = `plan_rent × 0.05` | `yeTarget.maintenance` (user-entered) |
| ↳ as % of rent | `displayYtd.maintenance / displayYtd.rent_income × 100` | 5.00% (fixed target) | 5.00% (fixed target) |
| HOA, Pool, Garden | `displayYtd.hoa_payments + pool + garden` | `(hoaAnnual/12 + poolMonthly + gardenMonthly) × monthsElapsed` | `yeTarget.hoa + pool + garden` (user-entered) |
| PM Fee | `displayYtd.pm_fee` (from monthly entries) | `planned_pm_fee_monthly × monthsElapsed` | `planned_pm_fee_monthly × 12` |
| Total Expenses | `displayYtd.total_expenses` (sum of above, excl. property tax) | `plannedYtd.total_expenses` | `yeTargetTotalExp` (sum of above) |
| Net Income | `displayYtd.net_income` | `plannedYtd.net_income` | `yeTargetNet` |
| Property Tax | `displayYtd.property_tax` (display only — excluded from Net Income) | — | `yeTarget.property_tax` (user-entered) |

> **Excel rule (B43):** Total Expenses excludes property tax. Net Income = Gross Income − Total Expenses. Property Tax shown separately below the line.

---

### D.4 Admin Financials — InvestmentPerformanceTable (Investment Performance section)

| Row | Actual | Plan | YE Target |
|-----|--------|------|-----------|
| Return on Investment (Net Income) | `displayYtd.net_income / costBasis × 100` | `plannedYtd.net_income / costBasis × 100` | `yeTargetNet / costBasis × 100` |
| ROI Post Property Tax | `(displayYtd.net_income − displayYtd.property_tax) / costBasis × 100` | — | — |
| Home Value Appreciation | `canonicalMetrics.appreciation_pct` = `(current_market_value − cost_basis) / cost_basis × 100` | — | — |
| ROI Post Tax + Appr − Closing Cost | `(netIncome − propertyTax − closingCosts + appreciationValue) / costBasis × 100` | — | — |

> **The ROI (Net Income) row and the YTD Income ROI card must use the same numerator (`displayYtd.net_income`) and denominator (`cost_basis`). Never use `canonicalMetrics.roi_pre_tax` for the table row — it includes the deposit.**

---

### D.5 Admin Financials — InvestmentPerformanceTable (Home Performance section)

| Row | Formula |
|-----|---------|
| Purchase Price + Repairs | `cost_basis` = `home_cost + home_repair_cost + closing_costs` |
| Current Value | `canonicalMetrics.current_market_value` (latest `property_market_estimate`) |
| Appreciation since purchase | `current_market_value − cost_basis` / `cost_basis × 100` |
| Appreciation YTD (from {Mon}) | `latest − earliest market_estimate in performanceYear` / `cost_basis × 100` |
| Monthly Gain | `appreciation_value / months_owned` / `cost_basis × 100` |
| Annualized Gain | `monthly_gain × 12` / `cost_basis × 100` |
| Months Owned | `DATEDIF(purchase_date, TODAY(), "m")` — from canonical metrics |

> All Home Performance % denominators use **cost_basis**, not current market value. Excel I-column formula: `=value/$H$30` where H30 = cost_basis.

---

### D.6 Owner Dashboard — Investment Metrics (same InvestmentPerformanceTable)

Owner page passes its own prop shapes but the same component. Key differences from admin:
- `actual.grossIncome` = `metrics.ytd_rent_income` (from canonical, may include deposit — check owner page for bonus handling)
- `roi.preTax` = `metrics.roi_pre_tax` (canonical)
- Plan values come from `planRentPeriod`, `planMaintenancePeriod` etc. (proportional to elapsed months in selected year)

### D.7 Owner Dashboard — Performance Status & Narrative

| Output | Formula |
|--------|---------|
| Performance grade | Excellent: ROI ≥5% AND maint <5%; Good: ROI ≥3% AND maint <7%; else Needs Attention |
| Projected annual ROI | `(ytdNetIncome / elapsedMonths × 12) / costBasis × 100` |
| Maintenance % display | `ytd_maintenance / ytd_rent_income × 100` |
| YTD Appreciation % | `ytdAppreciationData.value / cost_basis × 100` |

---

### D.8 Planned YTD — `plannedYtd` useMemo

Lives in `app/admin/financials/page.tsx`. Single source of plan figures for the period.

| Field | Formula |
|-------|---------|
| `rent_income` | Sum of actual monthly rent if present, else `target_monthly_rent` per month (prorated first month if lease starts mid-month). Count = `monthsElapsedPlanned` |
| `maintenance` | `rent_income × 0.05` |
| `pool` | `planned_pool_cost × monthsElapsedPlanned` |
| `garden` | `planned_garden_cost × monthsElapsedPlanned` |
| `hoa_payments` | `(calculatedAnnualHoa / 12) × monthsElapsedPlanned` |
| `pm_fee` | `planned_pm_fee_monthly × monthsElapsedPlanned` |
| `total_expenses` | `maintenance + pool + garden + hoa_payments + pm_fee` (NO property_tax) |
| `net_income` | `rent_income − total_expenses` |

---

## 11. Recurring Session Checklist

### 11.1 After Every Prompt
- New files in correct locations (Appendix B)
- No orphaned imports, unused state, or dead helpers left behind
- If a skill applies to the task, it was used (C.22)
- Conflicting or superseded logic removed
- End response with: _"Do you have more input, or shall I push to GitHub?"_

### 11.2 After Any DB Schema Change
- Migration file in `supabase/migrations/` with timestamp prefix
- Uses `IF NOT EXISTS` guards; has defaults/nullable; includes rollback SQL comment
- Tell user: "Run this SQL in Supabase Dashboard > SQL Editor"

**Pending migrations:** `supabase/migrations/20241211_add_roi_and_timestamps.sql`, `supabase/migrations/20260320_add_planned_pm_fee_monthly.sql`

### 11.3 After Every Session
Stage specific files, commit with clear message. **Ask user before pushing** — never auto-push.

### 11.4 Guardrails Self-Update
Add new lessons to Appendix C/D. Update version and Document Control table. Ask user before pushing.

---

## Document Control

| Field | Value |
|-------|-------|
| Version | 1.7 |
| Status | Active |
| Last Updated | 2026-03-20 — Never push without user approval (Section 8, 11.3); added Appendix D: full calc→output map for all financial metrics |

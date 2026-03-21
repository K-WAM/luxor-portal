<!-- COPY-PASTE PROMPT STARTER -->
> **Start every session with:** "Read `LUXOR_ENGINEERING_GUARDRAILS.md` and apply all rules before proceeding. Appendix D is the authoritative calculation → output map for every financial variable. **After any change that touches a formula, variable name, or output value, update Appendix D before ending the session.**"

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
- **Projected ROI calc** (canonical, plan-based): `calculateExpectedRoi({ ..., plannedPmFeeMonthly })` → `annualPlanNetIncome / costBasis * 100` where `annualPlanNetIncome = (rent×12) − (maintenance + pool + garden + hoa + pmFee)×12`. **This single formula is used in all three locations:** admin dashboard card, admin financials "Projected ROI (Pre-Tax)", owner dashboard gauge and InvestmentPerformanceTable YE Target row. Never annualize from elapsed months for this metric.
- **InvestmentPerformanceTable** is the single shared component for the Excel A29:I43 layout — used in owner dashboard and admin financials monthly tab. Never rebuild this table inline.
- **Investment Report narrative** reads: income vs plan, maintenance % (target <5%), projected ROI (plan-based), actual period ROI, property tax note, home value with appreciation and months owned.
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

### C.23 Admin Financials — Deposit Period Logic (Critical)
The last-month deposit is physically collected at **lease start** but conceptually covers the **last month of the lease**. Two separate booleans gate its behavior:

| Variable | True when | Effect |
|----------|-----------|--------|
| `depositInCurrentViewData` | `performanceYear === leaseStartYear` OR `periodType === "alltime"` | `displayYtd` subtracts deposit from `rent_income`/`net_income` (it's physically in this period's data) |
| `depositAppliesThisView` | `performanceYear === leaseEndYear` OR `periodType === "alltime"` | Pass `lastMonthDeposit={lastMonthRentBonus}` to table → deposit sub-rows visible |

- `displayYtd` = `actualYtd - lastMonthRentBonus` **only when** `depositInCurrentViewData`. For any other year, `displayYtd === actualYtd` (no subtraction — deposit isn't in the data).
- `lastMonthDeposit` prop to `InvestmentPerformanceTable` = `depositAppliesThisView ? lastMonthRentBonus : 0`
- **`maintenancePct`** for `displayYtd`: `displayYtd.rent_income > 0 ? (displayYtd.maintenance / displayYtd.rent_income * 100) : 0` — do NOT use `canonicalMetrics.maintenance_pct`.
- **`roi.preTax` / `roi.postTax`**: compute inline from `displayYtd.net_income / costBasis`, not `canonicalMetrics.roi_pre_tax`.

### C.24 PM Fee Plan Input
`planned_pm_fee_monthly` (numeric, nullable) lives on the `properties` table. It powers:
- `plannedYtd.pm_fee = pmFeeMonthly * monthsElapsedPlanned` (included in `total_expenses` and `net_income`)
- `annualPlan.pmFee = pmFeeMonthly * 12` (included in `totalExpenses`)
- `yeTarget.pmFee = pmFeeMonthly * 12` for the YE Target column in `InvestmentPerformanceTable`
Pattern mirrors `planned_pool_cost` / `planned_garden_cost`. API route GET select and PUT numericFields must both include it.

---

## Appendix D: Calculation → Output Map

**This is the authoritative reference.** When in doubt, look here first. **Do not introduce a second version of any calculation listed here. Update this appendix after any change that touches a formula, variable name, or output value.**

---

### D.0 Master Variable Table

Every financial variable in the app, with its Actual, Plan, and YE Target formula.

| Variable | Actual Formula | Plan Formula | YE Target Formula |
|----------|---------------|--------------|-------------------|
| **Gross Income** | `canonicalMetrics.ytd.rent_income` — sum of monthly `rent_income` (includes last-month deposit in the month received) | `target_monthly_rent × monthsElapsedPlanned` (prorated for partial first month) | `yeTarget.rent_income` (user-entered) |
| **Maintenance** | `canonicalMetrics.ytd.maintenance` — sum of monthly `maintenance` | `plannedYtd.rent_income × 0.05` | `yeTarget.maintenance` (user-entered) |
| **Maintenance %** | `ytd.maintenance / ytd.rent_income × 100` | 5.00% (fixed) | 5.00% (fixed) |
| **HOA, Pool, Garden** | `ytd.hoa_payments + ytd.pool + ytd.garden` | `(hoaAnnual/12 + poolMonthly + gardenMonthly) × monthsElapsedPlanned` | `yeTarget.hoa + yeTarget.pool + yeTarget.garden` |
| **PM Fee** | `ytd.pm_fee` — sum of monthly `pm_fee` | `planned_pm_fee_monthly × monthsElapsedPlanned` | `planned_pm_fee_monthly × 12` |
| **Total Expenses** | `ytd.total_expenses` = maint + pool + garden + hoa + pmFee (**EXCL. property_tax**) | `plannedYtd.total_expenses` (same structure) | `yeTargetTotalExp` = sum of above |
| **Net Income** | `ytd.net_income` = gross income − total_expenses (**EXCL. property_tax**) | `plannedYtd.net_income` | `yeTargetNet` = rent − expenses |
| **Property Tax** | `ytd.property_tax` — separate, NOT in net income or total_expenses | — (no plan) | `yeTarget.property_tax` (user-entered) |
| **ROI Pre-Tax** | `ytd.net_income / cost_basis × 100` | `plannedYtd.net_income / cost_basis × 100` | `yeTargetNet / cost_basis × 100` |
| **ROI Post-Tax** | `(ytd.net_income − ytd.property_tax) / cost_basis × 100` | — | — |
| **Projected ROI (annual plan)** | — | `calculateExpectedRoi({rent, pool, garden, hoa, pmFee, costBasis})` = `(rent×12 − expenses×12) / costBasis × 100` | Same formula, same value |
| **Cost Basis** | `home_cost + home_repair_cost + closing_costs` | Same | Same |
| **Appreciation (since purchase)** | `current_market_value − cost_basis` / `cost_basis × 100` | — | — |
| **Appreciation (YTD)** | `latest − earliest market_estimate in performanceYear` / `cost_basis × 100` | — | — |

> **Excel rule (B43):** `total_expenses` excludes `property_tax`. `net_income = gross_income − total_expenses`. Property tax is tracked but below the line.

---

### D.1 Last-Month Deposit Handling

The deposit is collected upfront at lease signing (lease-start year), representing the last month of rent. It IS included in `gross_income` and `net_income` for the period in which it was physically received.

| Variable | Formula | File |
|----------|---------|------|
| `lastMonthRentBonus` | `target_monthly_rent` if `last_month_rent_collected`, else `deposit` | admin financials page |
| `actualYtd` | `canonicalMetrics.ytd` — includes deposit in the month it was received | canonical-metrics.ts |
| `showDepositBreakdown` | `lastMonthRentBonus > 0 && (periodType !== "ytd" \|\| performanceYear === leaseStartYear)` — controls breakdown sub-row visibility | admin financials page |
| `lastMonthDeposit` prop | `showDepositBreakdown ? lastMonthRentBonus : 0` — passed to InvestmentPerformanceTable | admin financials page |

> **Gross income IS inclusive of the deposit in the view where it was received.** The deposit breakdown sub-row under Gross Income is informational only — it shows how much of the period's gross income came from the deposit. There is NO "recurring only" vs "incl. deposit" split in the primary rows.

> `leaseEndMonthLabel` — computed from `lease_end` date: `new Date(year, month-1).toLocaleString("default", { month: "short", year: "numeric" })`. Shown in the deposit sub-row label to indicate what month it covers.

---

### D.2 Admin Financials — YTD Performance Cards

| Card | Formula | Variable |
|------|---------|----------|
| YTD Income ROI | `actualYtd.net_income / calculatedTotalCost × 100` | admin financials page |
| YTD Home Appreciation | `(latest − earliest market_estimate in year) / cost_basis × 100` | `ytdAppreciation.pct` |
| Appreciation Since Purchase | `(current_market_value − cost_basis) / cost_basis × 100` | `purchaseAppreciation.pct` |
| Total YTD ROI (Net + YTD Appr.) | `(actualYtd.net_income + ytdAppreciation.value) / calculatedTotalCost × 100` — uses **YTD** appreciation, not since-purchase | admin financials page |

> **Total YTD ROI uses YTD appreciation** (`ytdAppreciation.value`), not since-purchase (`purchaseAppreciation.value`). These are different — do not swap them.

---

### D.3 Admin Financials — InvestmentPerformanceTable (Income & Expenses section)

All **Actual** values come from `actualYtd` (includes deposit in the month received). When `lastMonthDeposit > 0`, a breakdown sub-row appears under Gross Income showing the deposit amount — it is informational, not additive.

| Row | Actual | Plan | YE Target |
|-----|--------|------|-----------|
| Gross Income | `actualYtd.rent_income` | `plannedYtd.rent_income` | `yeTarget.rent_income` |
| ↳ incl. Last-Month Deposit (informational) | `lastMonthRentBonus` shown as breakdown — only when `showDepositBreakdown` | — | — |
| Maintenance | `actualYtd.maintenance` | `plannedYtd.maintenance` = `plan_rent × 0.05` | `yeTarget.maintenance` |
| ↳ as % of rent | `actualYtd.maintenance / actualYtd.rent_income × 100` | 5.00% (fixed) | 5.00% (fixed) |
| HOA, Pool, Garden | `actualYtd.hoa_payments + pool + garden` | `(hoaAnnual/12 + poolMonthly + gardenMonthly) × monthsElapsed` | `yeTarget.hoa + pool + garden` |
| PM Fee | `actualYtd.pm_fee` | `planned_pm_fee_monthly × monthsElapsed` | `planned_pm_fee_monthly × 12` |
| Total Expenses | `actualYtd.total_expenses` (excl. property tax) | `plannedYtd.total_expenses` | `yeTargetTotalExp` |
| Net Income | `actualYtd.net_income` | `plannedYtd.net_income` | `yeTargetNet` |
| Property Tax | `actualYtd.property_tax` (below the line) | — | `yeTarget.property_tax` |

---

### D.4 Admin Financials — InvestmentPerformanceTable (Investment Performance section)

| Row | Actual | Plan | YE Target |
|-----|--------|------|-----------|
| ROI — Net Income (Pre-Tax) | `actualYtd.net_income / costBasis × 100` | `plannedYtd.net_income / costBasis × 100` | `yeTargetNet / costBasis × 100` |
| ROI Post Property Tax | `(actualYtd.net_income − actualYtd.property_tax) / costBasis × 100` | — | — |
| Home Value Appreciation | `(current_market_value − cost_basis) / cost_basis × 100` | — | — |
| ROI Post Tax + Appr − Closing Cost | `(netIncome − propertyTax − closingCosts + appreciationValue) / costBasis × 100` | — | — |

> **ROI rows and YTD Income ROI card must share the same numerator (`actualYtd.net_income`) and denominator (`cost_basis`).**

---

### D.5 Admin Financials — InvestmentPerformanceTable (Home Performance section)

| Row | Formula |
|-----|---------|
| Purchase Price + Repairs | `cost_basis = home_cost + home_repair_cost + closing_costs` |
| Current Value | `canonicalMetrics.current_market_value` |
| Appreciation since purchase | `(current_market_value − cost_basis) / cost_basis × 100` |
| Appreciation YTD (from {Mon}) | `(latest − earliest market_estimate in performanceYear) / cost_basis × 100` |
| Monthly Gain | `appreciation_value / months_owned` → `/ cost_basis × 100` |
| Annualized Gain | `monthly_gain × 12` → `/ cost_basis × 100` |
| Months Owned | `DATEDIF(purchase_date, TODAY(), "m")` from canonical metrics |

---

### D.6 Owner Dashboard — InvestmentPerformanceTable

Same component as admin. Key prop differences:

| Prop | Formula | Notes |
|------|---------|-------|
| `actual.grossIncome` | `metrics.ytd_rent_income` (canonical, inclusive) | Same inclusive logic |
| `actual.maintenancePct` | `metrics.maintenance_pct` (canonical) | |
| `roi.preTax` | `metrics.roi_pre_tax` (canonical) | `ytd.net_income / cost_basis × 100` |
| `roi.postTax` | `metrics.roi_post_tax` (canonical) | |
| `roi.planRoi` | `planNetIncomePeriod / cost_basis × 100` | Period-proportional plan |
| `roi.yeTargetRoi` | `yeTarget.net_income / cost_basis × 100` | From annual targets table |
| `plan.pmFee` | `property.planned_pm_fee_monthly × elapsedMonths` | ✅ Included |
| `plan.totalExpenses` | `planMaintenancePeriod + planHoaPoolGardenPeriod + planPmFeePeriod` | All expense lines |

> Owner page plan calculations (`planRentPeriod`, `planHoaPoolGardenPeriod`, `planPmFeePeriod`, `planNetIncomePeriod`) are period-proportional (elapsed months), not full-year. Full-year plan is `annualPlan` in admin financials.

---

### D.7 Owner Dashboard — Gauges, Performance Status & Narrative

| Output | Formula | Variable |
|--------|---------|----------|
| Gauge 1: Projected ROI (Pre-Tax) | `calculateExpectedRoi({rent, pool, garden, hoa, pmFee, costBasis})` = `(annualPlanNet) / costBasis × 100` | `projectedRoi` |
| Gauge 2: Actual ROI (Period) | `metrics.roi_pre_tax` = `ytd.net_income / cost_basis × 100` | `metrics.roi_pre_tax` |
| Gauge 3: Total ROI (with Appreciation) | `metrics.roi_with_appreciation` = `(ytd.net_income + appreciation_value) / cost_basis × 100` | `gaugeRoiTotal` |
| Performance grade | Excellent: `projectedRoi ≥5%` AND maint <5%; Good: ≥3% AND <7%; else Needs Attention | `performanceStatus` |
| Narrative: period plan net | `planNetIncomePeriod = planRentPeriod − planMaintenancePeriod − planHoaPoolGardenPeriod − planPmFeePeriod` | Period-proportional |
| Narrative: period plan ROI | `planRoiPeriod = planNetIncomePeriod / cost_basis × 100` | Period-proportional |

---

### D.8 Planned YTD — `plannedYtd` useMemo

Lives in `app/admin/financials/page.tsx`. Single source of plan figures for the period.

| Field | Formula |
|-------|---------|
| `rent_income` | Actual monthly rent if entered, else `target_monthly_rent` per month (prorated first month). Count = `monthsElapsedPlanned` |
| `maintenance` | `rent_income × 0.05` |
| `pool` | `planned_pool_cost × monthsElapsedPlanned` |
| `garden` | `planned_garden_cost × monthsElapsedPlanned` |
| `hoa_payments` | `(calculatedAnnualHoa / 12) × monthsElapsedPlanned` |
| `pm_fee` | `planned_pm_fee_monthly × monthsElapsedPlanned` |
| `total_expenses` | `maintenance + pool + garden + hoa_payments + pm_fee` (NO property_tax) |
| `net_income` | `rent_income − total_expenses` |

---

### D.9 Annual Plan — `annualPlan` useMemo

Full-year plan (not period-proportional). Lives in `app/admin/financials/page.tsx`. Powers the Projected Income Summary table and the Projected ROI (Pre-Tax) card.

| Field | Formula |
|-------|---------|
| `rent` | `target_monthly_rent × 12` |
| `maintenance` | `rent × 0.05` |
| `pool` | `planned_pool_cost × 12` |
| `garden` | `planned_garden_cost × 12` |
| `hoa` | `calculatedAnnualHoa` (HOA1 + HOA2, adjusted for frequency) |
| `pmFee` | `planned_pm_fee_monthly × 12` |
| `totalExpenses` | `maintenance + pool + garden + hoa + pmFee` |
| `netIncome` | `rent − totalExpenses` |
| **Projected ROI (Pre-Tax)** | `netIncome / calculatedTotalCost × 100` — **canonical formula, same across all three locations** |
| **Projected ROI (Post-Tax)** | `(netIncome − propertyTax) / calculatedTotalCost × 100` |

> The three locations that must show the **same Projected ROI (Pre-Tax)** value:
> 1. Admin Dashboard card "Projected ROI %" → `calculateExpectedRoi()` with PM fee
> 2. Admin Financials "Projected ROI (pre-tax)" → `annualPlan.netIncome / calculatedTotalCost × 100`
> 3. Owner Dashboard Gauge 1 "Projected ROI (Pre-Tax)" → `projectedRoi = calculateExpectedRoi()` with PM fee

---

### D.10 Formula Accordion (Admin Financials — Monthly Performance Tab)

Collapsible reference at the bottom of the Monthly Performance tab (`app/admin/financials/page.tsx`, `showFormulas` state).

| Section | Key Formulas |
|---------|-------------|
| **Cost Basis** | `home_cost + home_repair_cost + closing_costs` |
| **Annual Plan Net Income** | `(rent×12) − (maint×12 + pool×12 + garden×12 + hoa_annual + pmFee×12)`; maintenance = rent×5% |
| **Projected ROI (Pre-Tax)** | `annualPlan.netIncome / calculatedTotalCost × 100` |
| **YTD Income ROI** | `actualYtd.net_income / calculatedTotalCost × 100` (includes deposit in month received) |
| **Total YTD ROI** | `(actualYtd.net_income + ytdAppreciation.value) / calculatedTotalCost × 100` — uses YTD appreciation, not since-purchase |
| **Deposit / Last-Month Rent** | Included in gross income in the month received; breakdown sub-row shown when `showDepositBreakdown` |

> The accordion is for user reference only — do not add accordion sections to owner or admin dashboard pages.

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

## 12. How to Change a Financial Formula (Mandatory Protocol)

Changing a formula is the highest-risk operation in this codebase. A formula exists in multiple layers simultaneously — the calculation library, one or more API routes, one or more page components, and Appendix D of this file. Changing it in only one place creates silent divergence that is very hard to find later.

**Follow this checklist in order for every formula change:**

### 12.1 Find Every Output Location First
Before writing a single line of code, grep for the variable name across the entire repo:
```
Grep pattern: <variable_name>
Scope: entire luxor-portal/
```
Look in: API routes (`app/api/`), page components (`app/admin/`, `app/owner/`), shared components (`app/components/`), and the calculation library (`lib/calculations/`).

List every file that reads or renders the variable. Do not start coding until this list is complete.

### 12.2 Identify the Single Source of Truth
Every formula must live in exactly one place and be imported everywhere else:
- **Financial metrics (YTD actuals):** `lib/calculations/canonical-metrics.ts` → `calculateCanonicalMetrics()`
- **Plan / projected values:** `lib/financial-calculations.ts` → `calculateExpectedRoi()` / `calculateExpectedAnnualNet()`
- **Period elapsed helpers:** `lib/date-only.ts`

If the formula currently exists inline in a page or API route, move it to the appropriate lib file first, then import it. Never compute the same value two different ways in two different files.

### 12.3 Update All Output Locations in One PR
Make all changes atomically — do not partially update and leave mismatched values in production:
1. Update the lib function (single source of truth)
2. Update every API route that calls it (check Supabase `select` fields too — new columns must be fetched)
3. Update every page component that renders it
4. Update every shared component prop type that carries it
5. Remove any now-dead variables, useMemos, or inline duplicates that the old approach left behind

### 12.4 Update Appendix D Before Closing
After code changes are complete:
1. Update **D.0 Master Variable Table** — change the formula text for the affected row(s)
2. Update the relevant **D.1–D.10** section if it describes the changed formula in detail
3. Update the formula accordion text in `app/admin/financials/page.tsx` if the label or formula description changed
4. Bump the Document Control version

### 12.5 Common Mistakes That Caused Past Bugs

| Mistake | What Went Wrong | Prevention |
|---------|----------------|------------|
| PM fee added to `calculateExpectedAnnualNet()` but not passed in API route call | Admin dashboard projected ROI excluded PM fee; admin financials included it — two different numbers for the same metric | Always grep for every call site of the function you changed |
| `displayYtd` introduced to exclude deposit from "recurring" figures | Three variables (`displayYtd`, `depositInCurrentViewData`, `depositAppliesThisView`) diverged across pages; deposit logic inconsistent | One variable per decision (`showDepositBreakdown`); never introduce a parallel "adjusted" copy of an existing metric |
| `yeTargetRoi` computed as `projectedRoi` (plan formula) instead of from YE target data | YE Target column showed plan values, not actual year-end targets | Actual/Plan/YE Target are three distinct sources; never substitute one for another without explicit design intent |
| `calculatedYeTarget` useMemo defined but never referenced | Dead code created confusion about what was authoritative | After every change, grep for every symbol you define; remove unused ones immediately |
| Monthly table YE Target row hardcoded `{formatCurrency(0)}` for PM fee | PM fee appeared correct in InvestmentPerformanceTable but wrong in the monthly breakdown table | When a variable has multiple render locations (table row AND component), update both |

### 12.6 The Formula Change Verification Checklist
Before marking a formula task done:
- [ ] Grepped for the variable name across the entire repo — no missed locations
- [ ] Only one lib function computes this value — no inline duplicates
- [ ] All API routes fetch the DB columns this formula needs (check `select` queries)
- [ ] All page components pass the value through to all child components that render it
- [ ] All dead code from the old approach removed (imports, useMemos, state vars, props)
- [ ] Appendix D updated — D.0 row and relevant detail section
- [ ] Formula accordion text in admin financials updated if label/formula changed
- [ ] Document Control version bumped

---

## Document Control

| Field | Value |
|-------|-------|
| Version | 2.1 |
| Status | Active |
| Last Updated | 2026-03-21 — v2.1: Added Section 12 "How to Change a Financial Formula" with full checklist, single-source-of-truth rules, past mistakes table, and 6-point verification checklist; v2.0: Full variable consistency audit: D.0 Master Variable Table added (Actual/Plan/YE Target for all 10 variables); deposit model changed to inclusive (last-month deposit counted in gross income for the month received); displayYtd removed → showDepositBreakdown; calculatedYeTarget dead useMemo removed; YE Target monthly table row now includes PM fee; formula accordion updated to deposit-inclusive model; Projected ROI unified to single calculateExpectedRoi() with PM fee across all three locations (admin dashboard, admin financials, owner page) |

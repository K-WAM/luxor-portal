**GitHub:** https://github.com/K-WAM/luxor-portal (main branch)

> **Start every session with:** "Read `CLAUDE.md` and apply all rules before proceeding. Appendix D is the authoritative calculation Ã¢â€ â€™ output map for every financial variable. **After any change that touches a formula, variable name, or output value, update Appendix D before ending the session.**"

---

# LUXOR ENGINEERING GUARDRAILS
**Version 2.9 Ã¢â‚¬â€ Active**

Governs all development and AI-assisted changes to Luxor (Admin, Owner, Tenant portals). Applies to code changes, bug fixes, features, and DB schema modifications. Claude must treat this file as authoritative.

---

# =========================
# CORE PRINCIPLES
# =========================

## Simplicity First
- Make every change as simple as possible
- Minimize code impact
- Avoid unnecessary complexity

## No Laziness
- Always find root causes
- Do not implement temporary or surface-level fixes
- Maintain senior engineer standards

## Minimal Impact
- Only modify what is required
- Avoid introducing side effects or regressions

---

# =========================
# SYSTEM STABILITY
# =========================

Luxor is near-production. Architecture is intentional and must be preserved.
- Working code is assumed correct unless proven otherwise
- Refactoring prohibited unless explicitly requested
- All changes must integrate with existing patterns

---

# =========================
# DATA & API SAFETY (NON-NEGOTIABLE)
# =========================

- **No deletion** of financial records (`property_monthly_performance`, `billing_invoices`, `tenant_bills`)
- **Schema changes additive only** Ã¢â‚¬â€ new columns must be nullable or have defaults; no removals/renames
- **RLS policies immutable** without explicit approval
- **API responses** Ã¢â‚¬â€ never remove or rename existing fields; add only
- **Types** Ã¢â‚¬â€ `CanonicalMetrics`, `PropertyData`, `MonthlyDataRow` interfaces are frozen; extend with optional properties only
- **Hook signatures** Ã¢â‚¬â€ `useAuth()`, `usePeriodFilter()` return types cannot change

---

# =========================
# REUSE-FIRST (MANDATORY ORDER)
# =========================

Before writing new code:
1. `app/components/` Ã¢â‚¬â€ `GaugeChart`, `PeriodToggle`, `ROISpeedometer`, `InvestmentPerformanceTable`
2. `app/hooks/` Ã¢â‚¬â€ `usePeriodFilter`, `useAuth`
3. `lib/` Ã¢â‚¬â€ `canonical-metrics.ts` (ALL financials), `date-only.ts`, `route-helpers.ts`, `supabase/`
4. Existing pattern in same portal (`app/admin/`, `app/owner/`, `app/tenant/`, `app/api/`)

**Prohibited:** New financial calc functions, new auth helpers, new date utilities, new Supabase clients, duplicating existing logic.

---

# =========================
# WORKFLOW ORCHESTRATION
# =========================

## 1. Plan Mode (Default)
- Enter plan mode for ANY non-trivial task: 3+ steps, architectural decisions
- Write detailed specs before implementation
- Use plan mode for building and verification
- If execution deviates: STOP immediately, re-plan before continuing

**Required workflow sequence:**
1. **Investigate** Ã¢â‚¬â€ read all files to be modified, find reusable code
2. **Plan** Ã¢â‚¬â€ list files to modify/create, dependencies, DB changes
3. **Impact analysis** Ã¢â‚¬â€ downstream effects, breaking changes (must be NONE)
4. **Confirm** Ã¢â‚¬â€ present plan, wait for approval
5. **Execute** Ã¢â‚¬â€ implement, validate

## 2. Subagent Strategy
- Use subagents to: keep main context clean, parallelize analysis, offload research/exploration
- One task per subagent
- For complex problems: increase compute via multiple subagents

## 3. Self-Improvement Loop
- After ANY user correction: update lessons in memory system
- Convert mistakes into explicit rules
- At session start: review relevant lessons from memory

## 4. Verification Before Done
- NEVER mark a task complete without proof
- Must: run tests, check logs, validate behavior
- Compare: baseline vs new behavior
- Ask: "Would a staff engineer approve this?"

## 5. Demand Elegance (Balanced)
- For non-trivial changes: ask "Is there a more elegant solution?"
- If solution feels hacky: redesign properly
- Do NOT over-engineer simple fixes
- Challenge your own output before presenting

## 6. Autonomous Bug Fixing
- When given a bug: FIX it immediately
- Do NOT ask for unnecessary clarification
- Use: logs, errors, failing tests
- Resolve independently

---

# =========================
# TASK MANAGEMENT
# =========================

1. **Plan First** Ã¢â‚¬â€ write plan using TodoWrite, use checkable items
2. **Verify Plan** Ã¢â‚¬â€ confirm before implementation
3. **Track Progress** Ã¢â‚¬â€ mark items complete as executed
4. **Explain Changes** Ã¢â‚¬â€ provide high-level summary per step
5. **Capture Lessons** Ã¢â‚¬â€ update memory system with non-obvious learnings

---

# =========================
# UI STABILITY
# =========================

Portal layouts, navigation, color scheme, and component styling are final. No moving sidebar items, changing themes, altering dimensions, or adding animations without request.

---

# =========================
# LOCKED STACK
# =========================

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Runtime | React 18, TypeScript 5 strict |
| Database | Supabase (PostgreSQL) + RLS |
| Styling | Tailwind CSS 4 |
| Charts | Chart.js, Recharts |

No state libraries, alternative auth/DB, CSS-in-JS, or ORM layers.

---

# =========================
# AI BOUNDARIES Ã¢â‚¬â€ ALWAYS-ON RULES
# =========================

**Must always:**
- Investigate before proposing; read files before modifying
- Reuse existing patterns (Reuse-First section); place new files per Appendix B
- Present plan before executing; make minimal changes; confirm backward compatibility
- **Use the relevant Claude skill** for any task that maps to one (see C.22)
- **Eliminate dead code** created as a side-effect of any change Ã¢â‚¬â€ imports, helpers, useMemos, and IIFE blocks that are no longer referenced
- **Reconcile conflicting code** Ã¢â‚¬â€ if a change makes another calculation, constant, or branch unreachable or contradictory, fix or remove it in the same PR
- **Keep `docs/project-wiki.md` current** whenever architecture, routes, env vars, deployment, billing, or onboarding behavior changes
- **Update `CLAUDE.md`** at the end of every session with new lessons; bump version
- **End every response** with: _"Do you have more input, or shall I push to GitHub?"_ Ã¢â‚¬â€ never push without explicit user approval
- **End every response** with: _"SQL to run"_ Ã¢â‚¬â€ even if none: _"No SQL required."_

**Must NOT:**
- Refactor working code; add abstractions for future use
- Modify code outside scope; propose architectural changes
- Add comments/docstrings to unchanged code
- Leave orphaned imports, unused state, or duplicate logic after a change
- Push to GitHub without the user explicitly saying to push
- Overload context; use vague instructions; skip validation; mark incomplete work as done
- Rely on user clarification for solvable problems

---

# =========================
# OUTPUT REQUIREMENTS
# =========================

- Outputs must be: complete, structured, minimal (no fluff)
- Follow explicitly defined structure; if unspecified, default to structured sections
- **Self-validate before output:** verify correctness, completeness, edge cases Ã¢â‚¬â€ fix issues BEFORE returning output

---

# =========================
# DEFINITION OF DONE
# =========================

A task is COMPLETE only if:
- Implementation works as intended
- Output matches all requirements
- No regressions or side effects exist
- Tests/logs confirm correctness
- Edge cases are handled
- Code quality meets senior engineer standards
- Dead code removed; Appendix D updated if formula changed; version bumped

---

# =========================
# ENFORCEMENT
# =========================

Violations Ã¢â€ â€™ automatic rejection: missing investigation, breaking API/types, data deletion, duplicating utilities, stack changes, UI modifications without request, dead code left behind, conflicting logic not reconciled, pushing to GitHub without approval.

---

# =========================
# OPTIMIZATION LOOP
# =========================

1. `/insights` Ã¢â‚¬â€ analyze failures and bottlenecks
2. Summarize Ã¢â‚¬â€ extract top 3Ã¢â‚¬â€œ4 improvements
3. Apply Ã¢â‚¬â€ update `CLAUDE.md`, prompts, skills, conventions

**Rule:** If improvement is not applied, it does not exist.

---

# =========================
# SKILLS & AUTOMATION
# =========================

Convert repeated workflows into skills. Store in `.claude/skills/`.
Use `.claude/hooks/` for: validation, enforcement, automation.

---

# =========================
# APPENDIX A: CODE PATTERNS
# =========================

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

# =========================
# APPENDIX B: FILE LOCATIONS
# =========================

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

# =========================
# APPENDIX C: OPERATIONAL LESSONS
# =========================

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
When a change replaces or removes a feature, immediately remove: orphaned imports, unused useMemos, helper functions, IIFE blocks, and state variables. Do not wrap in `{false && ...}` as a temporary measure Ã¢â‚¬â€ delete the code. Dead code left behind is a guardrails violation.

### C.6 Batch Save Over onBlur
Multi-input forms use a single Save button. Avoid per-field `onBlur` handlers.

### C.7 Git: Verify Before Rebasing
```bash
git log --oneline origin/main -10
git show --name-only <commit-hash>
```

### C.9 Owner Dashboard Design Conventions
- **Section order:** ROI Gauges Ã¢â€ â€™ Narrative Ã¢â€ â€™ Metrics (InvestmentPerformanceTable) Ã¢â€ â€™ Thresholds Ã¢â€ â€™ Luxor AI Ã¢â€ â€™ Charts
- **Performance thresholds:** Excellent: ROI Ã¢â€°Â¥5% AND Maint <5%; Good: ROI Ã¢â€°Â¥3% AND Maint <7%; Needs Attention: below these
- **Maintenance target is <5%.** Do not use 4% as the target anywhere in narratives or thresholds.
- **Projected ROI calc** (canonical, plan-based): `calculateExpectedRoi({ ..., plannedPmFeeMonthly })` Ã¢â€ â€™ `annualPlanNetIncome / costBasis * 100` where `annualPlanNetIncome = (rentÃƒâ€”12) Ã¢Ë†â€™ (maintenance + pool + garden + hoa + pmFee)Ãƒâ€”12`. **This single formula is used in all three locations:** admin dashboard card, admin financials "Projected ROI (Pre-Tax)", owner dashboard gauge and InvestmentPerformanceTable YE Target row. Never annualize from elapsed months for this metric.
- **InvestmentPerformanceTable** is the single shared component for the Excel A29:I43 layout Ã¢â‚¬â€ used in owner dashboard and admin financials monthly tab. Never rebuild this table inline.
- **Investment Report narrative** reads: income vs plan, maintenance % (target <5%), projected ROI (plan-based), actual period ROI, property tax note, home value with appreciation and months owned.
- **Chart.js:** `devicePixelRatio: 2`, `borderRadius: 3-4`, grid `#f1f5f9`, tooltip `rgba(15,23,42,0.92)`.

### C.10 Context File for New Chats
Stack summary: `C:\Users\karee\.claude\projects\c--Users-karee-Desktop-LuxApp\memory\project_stack.md`

### C.11 Narrative Grammar
"is rated **{label}**" not "is **{label}**". Plan ROI in narrative = period-proportional.

### C.12 Admin Dashboard Ã¢â‚¬â€ API Conventions
- `performance_status` computed server-side in `/api/admin/dashboard`; do NOT recompute client-side.
- `current_month_rent_paid`: `monthlyData.find(r => r.month === currentMonth)?.rent_income > 0`.

### C.13 Admin Financials Ã¢â‚¬â€ Projected Summary
Reuse `annualPlan` useMemo. Do NOT recompute inline. `annualPlan.maintenance = rent * 0.05`.

### C.14 Sidebar Logos
48Ãƒâ€”48px across all 3 portals. No subtitle text.

### C.15 Tenant Payments Ã¢â‚¬â€ Future Month Status
Bills unpaid where `dueDate > now + 10 days` Ã¢â€ â€™ show blank status badge.

### C.16 Owner Dashboard Ã¢â‚¬â€ Investment Metrics Table
5-column: label | YTD Actual | Plan (period) | YE Target | ÃŽâ€ vs Plan. Delta: `(actual - plan) / |plan| * 100`.

### C.17 Monthly Tab Ã¢â‚¬â€ YTD Summary Cards
- `actualYtd = canonicalMetrics.ytd`. Subtract `lastMonthRentBonus` for display; show footnote.
- `ytdAppreciation` = earliestÃ¢â€ â€™latest `property_market_estimate` in `performanceYear`. NOT since-purchase.

### C.18 SQL Disclosure Rule
End every response with "SQL to run" Ã¢â‚¬â€ even if none: _"No SQL required."_

### C.19 Temporal Dead Zone (TDZ)
`const` in `useMemo` callback referencing a later `const` = ReferenceError. Declare before the useMemo that uses them.

### C.20 YTD vs Since-Purchase Appreciation
- **YTD** = latest Ã¢Ë†â€™ earliest `property_market_estimate` in current year. Use cost_basis as % denominator.
- **Since Purchase** = `current_market_value Ã¢Ë†â€™ cost_basis`. Never confuse these.

### C.21 Plan Gross Income Ã¢â‚¬â€ Deposit Is NOT Subtracted
Excel B26: `=SUMIFS(actual_monthly_rent, dates, "<="&EOMONTH(TODAY(),0)) Ã¢Ë†â€™ deposit` Ã¢â‚¬â€ this is "actual recurring rent to date", not a budget plan. Our code intentionally differs:
- **Plan** = `target_monthly_rent Ãƒâ€” elapsedMonths` (pure budget target). Never subtract deposit from plan.
- **Deposit is isolated**: canonical metrics adds it via `lastMonthRentBonus` to actual YTD; admin monthly tab subtracts it with a footnote.
- **Past incident**: Subtracting deposit from plan caused false ÃŽâ€ negatives in month 1 and distorted all future month comparisons.

### C.22 Always Use Relevant Claude Skills
Before writing code to process files or perform specialized tasks, check if a Claude skill applies:

| Task | Skill |
|------|-------|
| Excel formulas / spreadsheet edits | `document-skills:xlsx` Ã¢â‚¬â€ use `load_workbook(data_only=False)` to read raw formulas |
| PDF read/create/merge | `document-skills:pdf` |
| Word documents (.docx) | `document-skills:docx` |
| PowerPoint (.pptx) | `document-skills:pptx` |
| UI testing / Playwright | `document-skills:webapp-testing` |
| Claude API / Anthropic SDK | `document-skills:claude-api` |
| Internal comms / reports | `document-skills:internal-comms` |

**Never eyeball Excel cell values** Ã¢â‚¬â€ always extract formula strings via the skill and compare each formula to the equivalent code. Report matches and discrepancies explicitly.

Reference file: `docs/excel property reporting example.xlsx` (sheet "SWE 26").

Past failure: maintenance target showed as 4% in code because formulas were assumed, not read. The skill confirmed 5%.

### C.23 Admin Financials Ã¢â‚¬â€ Deposit Period Logic (Critical)
The last-month deposit is physically collected at **lease start** but conceptually covers the **last month of the lease**. Two separate booleans gate its behavior:

| Variable | True when | Effect |
|----------|-----------|--------|
| `depositInCurrentViewData` | `performanceYear === leaseStartYear` OR `periodType === "alltime"` | `displayYtd` subtracts deposit from `rent_income`/`net_income` (it's physically in this period's data) |
| `depositAppliesThisView` | `performanceYear === leaseEndYear` OR `periodType === "alltime"` | Pass `lastMonthDeposit={lastMonthRentBonus}` to table Ã¢â€ â€™ deposit sub-rows visible |

- `displayYtd` = `actualYtd - lastMonthRentBonus` **only when** `depositInCurrentViewData`. For any other year, `displayYtd === actualYtd` (no subtraction Ã¢â‚¬â€ deposit isn't in the data).
- `lastMonthDeposit` prop to `InvestmentPerformanceTable` = `depositAppliesThisView ? lastMonthRentBonus : 0`
- **`maintenancePct`** for `displayYtd`: `displayYtd.rent_income > 0 ? (displayYtd.maintenance / displayYtd.rent_income * 100) : 0` Ã¢â‚¬â€ do NOT use `canonicalMetrics.maintenance_pct`.
- **`roi.preTax` / `roi.postTax`**: compute inline from `displayYtd.net_income / costBasis`, not `canonicalMetrics.roi_pre_tax`.

### C.25 Owner Portal Navigation Structure
Owner portal nav (8 items, in order): Dashboard (`/owner`), My Documents (`/owner/documents`), Properties (`/owner/properties`), Financials (`/owner/financials`), Tenants (`/owner/tenants`), Bills (`/owner/bills`), Maintenance (`/owner/maintenance`), Settings (`/owner/settings`).

Settings contains only: Account info (name/email) + Change Plan (subscription/upgrade). All management tabs (Properties, Tenants, Bills, Maintenance) are standalone nav pages.

`/owner/billing/` does NOT exist Ã¢â‚¬â€ the unified bills page is at `/owner/bills/`. Do not create or link to `/owner/billing`.

`/api/owner/billing` supports GET (list), POST (create), and PATCH (`{ id, action: "paid" | "void" }`) Ã¢â‚¬â€ use PATCH for marking bills paid or voided.

### C.26 Bills Are OwnerÃ¢â€ â€™Tenant (tenant_bills Table)
`billing_invoices` = expenses the owner receives (PM fees, maintenance, HOA, etc.).
`tenant_bills` = bills the owner sends TO tenants (Rent, Deposit, Maintenance Reimbursement, Late Fee, HOA Reimbursement, Utility Reimbursement, Other).

**Do NOT use `billing_invoices` for rent/deposit bills to tenants.** Owner-created bills for tenants always use `tenant_bills`.

API routes:
- `GET/POST/PATCH /api/owner/tenant-bills` Ã¢â‚¬â€ list, create, and mark paid/void tenant bills
- `POST /api/owner/send-reminder` Ã¢â‚¬â€ send Luxor-branded bill reminder email to tenant (via Resend)
- `POST /api/owner/lease-renewal` Ã¢â‚¬â€ send Luxor-branded lease renewal notice to tenant (via Resend)

Bill types (mandatory): `rent`, `deposit`, `maintenance_reimbursement`, `late_fee`, `hoa_reimbursement`, `utility_reimbursement`, `other`.

### C.27 Dashboard Financial Overview (Bills-Based)
Owner dashboard (`/owner`) shows two independent sections:
1. **Financial Overview** (bills-based): aggregates from `tenant_bills` (income) + `billing_invoices` (expenses) for the selected property. Income = paid tenant_bills sum. ROI% = net income / `purchase_price`. This works for all owners regardless of whether property_monthly_performance data exists.
2. **Investment Performance** (manually-entered): gauges, charts, InvestmentPerformanceTable based on `property_monthly_performance`. Only meaningful when data has been entered by admin or owner.

### C.28 purchase_price Column on Properties
`properties.purchase_price` (numeric, nullable) is the property purchase price entered by the owner. It is used to calculate ROI% on the owner dashboard (Financial Overview section). Migration: `20260412_add_purchase_price_to_properties.sql`.
API: PATCH `/api/properties?id=` accepts `purchasePrice` in the request body.

### C.24 PM Fee Plan Input
`planned_pm_fee_monthly` (numeric, nullable) lives on the `properties` table. It powers:
- `plannedYtd.pm_fee = pmFeeMonthly * monthsElapsedPlanned` (included in `total_expenses` and `net_income`)
- `annualPlan.pmFee = pmFeeMonthly * 12` (included in `totalExpenses`)
- `yeTarget.pmFee = pmFeeMonthly * 12` for the YE Target column in `InvestmentPerformanceTable`
Pattern mirrors `planned_pool_cost` / `planned_garden_cost`. API route GET select and PUT numericFields must both include it.

---

# =========================
# APPENDIX D: CALCULATION Ã¢â€ â€™ OUTPUT MAP
# =========================

**This is the authoritative reference.** When in doubt, look here first. **Do not introduce a second version of any calculation listed here. Update this appendix after any change that touches a formula, variable name, or output value.**

---

### D.0 Master Variable Table

Every financial variable in the app, with its Actual, Plan, and YE Target formula.

| Variable | Actual Formula | Plan Formula | YE Target Formula |
|----------|---------------|--------------|-------------------|
| **Gross Income** | `canonicalMetrics.ytd.rent_income` Ã¢â‚¬â€ sum of monthly `rent_income` (includes last-month deposit in the month received) | `target_monthly_rent Ãƒâ€” monthsElapsedPlanned` (prorated for partial lease-start month; adds `target_monthly_rent` deposit in lease-start month when `last_month_rent_collected`). **Pure plan Ã¢â‚¬â€ no actual-rent override.** Period-aware: YTD uses `performanceYear`; Lease/Alltime spans full elapsed lease months. | `yeTarget.rent_income` (user-entered) |
| **Maintenance** | `canonicalMetrics.ytd.maintenance` Ã¢â‚¬â€ sum of monthly `maintenance` | `plannedYtd.rent_income Ãƒâ€” 0.05` | `yeTarget.maintenance` (user-entered) |
| **Maintenance %** | `ytd.maintenance / ytd.rent_income Ãƒâ€” 100` | 5.00% (fixed) | 5.00% (fixed) |
| **HOA, Pool, Garden** | `ytd.hoa_payments + ytd.pool + ytd.garden` | `(hoaAnnual/12 + poolMonthly + gardenMonthly) Ãƒâ€” monthsElapsedPlanned` | `yeTarget.hoa + yeTarget.pool + yeTarget.garden` |
| **PM Fee** | `ytd.pm_fee` Ã¢â‚¬â€ sum of monthly `pm_fee` | `planned_pm_fee_monthly Ãƒâ€” monthsElapsedPlanned` | `planned_pm_fee_monthly Ãƒâ€” 12` |
| **Total Expenses** | `ytd.total_expenses` = maint + pool + garden + hoa + pmFee (**EXCL. property_tax**) | `plannedYtd.total_expenses` (same structure) | `yeTargetTotalExp` = sum of above |
| **Net Income** | `ytd.net_income` = gross income Ã¢Ë†â€™ total_expenses (**EXCL. property_tax**) | `plannedYtd.net_income` | `yeTargetNet` = rent Ã¢Ë†â€™ expenses |
| **Property Tax** | `ytd.property_tax` Ã¢â‚¬â€ separate, NOT in net income or total_expenses | Ã¢â‚¬â€ (no plan) | `yeTarget.property_tax` (user-entered) |
| **ROI Pre-Tax** | `ytd.net_income / cost_basis Ãƒâ€” 100` | `plannedYtd.net_income / cost_basis Ãƒâ€” 100` | `yeTargetNet / cost_basis Ãƒâ€” 100` |
| **ROI Post-Tax** | `(ytd.net_income Ã¢Ë†â€™ ytd.property_tax) / cost_basis Ãƒâ€” 100` | Ã¢â‚¬â€ | Ã¢â‚¬â€ |
| **Projected ROI (annual plan)** | Ã¢â‚¬â€ | `calculateExpectedRoi({rent, pool, garden, hoa, pmFee, costBasis})` = `(rentÃƒâ€”12 Ã¢Ë†â€™ expensesÃƒâ€”12) / costBasis Ãƒâ€” 100` | Same formula, same value |
| **Cost Basis** | `home_cost + home_repair_cost + closing_costs` | Same | Same |
| **Appreciation (since purchase)** | `current_market_value Ã¢Ë†â€™ cost_basis` / `cost_basis Ãƒâ€” 100` | Ã¢â‚¬â€ | Ã¢â‚¬â€ |
| **Appreciation (YTD)** | `latest Ã¢Ë†â€™ earliest market_estimate in performanceYear` / `cost_basis Ãƒâ€” 100` | Ã¢â‚¬â€ | Ã¢â‚¬â€ |

> **Excel rule (B43):** `total_expenses` excludes `property_tax`. `net_income = gross_income Ã¢Ë†â€™ total_expenses`. Property tax is tracked but below the line.

---

### D.1 Last-Month Deposit Handling

The deposit is collected upfront at lease signing (lease-start year), representing the last month of rent. It IS included in `gross_income` and `net_income` for the period in which it was physically received.

| Variable | Formula | File |
|----------|---------|------|
| `lastMonthRentBonus` | `target_monthly_rent` if `last_month_rent_collected`, else `deposit` | admin financials page |
| `actualYtd` | `canonicalMetrics.ytd` Ã¢â‚¬â€ includes deposit in the month it was received | canonical-metrics.ts |
| `showDepositBreakdown` | `lastMonthRentBonus > 0 && (periodType !== "ytd" \|\| performanceYear === leaseStartYear)` Ã¢â‚¬â€ controls breakdown sub-row visibility | admin financials page |
| `lastMonthDeposit` prop | `showDepositBreakdown ? lastMonthRentBonus : 0` Ã¢â‚¬â€ passed to InvestmentPerformanceTable | admin financials page |

> **Gross income IS inclusive of the deposit in the view where it was received.** The deposit breakdown sub-row under Gross Income is informational only. There is NO "recurring only" vs "incl. deposit" split in the primary rows.

> `leaseEndMonthLabel` Ã¢â‚¬â€ computed from `lease_end` date: `new Date(year, month-1).toLocaleString("default", { month: "short", year: "numeric" })`. Shown in the deposit sub-row label.

---

### D.2 Admin Financials Ã¢â‚¬â€ YTD Performance Cards

| Card | Formula | Variable |
|------|---------|----------|
| YTD Income ROI | `actualYtd.net_income / calculatedTotalCost Ãƒâ€” 100` | admin financials page |
| YTD Home Appreciation | `(latest Ã¢Ë†â€™ earliest market_estimate in year) / cost_basis Ãƒâ€” 100` | `ytdAppreciation.pct` |
| Appreciation Since Purchase | `(current_market_value Ã¢Ë†â€™ cost_basis) / cost_basis Ãƒâ€” 100` | `purchaseAppreciation.pct` |
| Total YTD ROI (Net + YTD Appr.) | `(actualYtd.net_income + ytdAppreciation.value) / calculatedTotalCost Ãƒâ€” 100` Ã¢â‚¬â€ uses **YTD** appreciation, not since-purchase | admin financials page |

> **Total YTD ROI uses YTD appreciation** (`ytdAppreciation.value`), not since-purchase (`purchaseAppreciation.value`). These are different Ã¢â‚¬â€ do not swap them.

---

### D.3 Admin Financials Ã¢â‚¬â€ InvestmentPerformanceTable (Income & Expenses section)

All **Actual** values come from `actualYtd` (includes deposit in the month received). When `lastMonthDeposit > 0`, a breakdown sub-row appears under Gross Income showing the deposit amount Ã¢â‚¬â€ it is informational, not additive.

| Row | Actual | Plan | YE Target |
|-----|--------|------|-----------|
| Gross Income | `actualYtd.rent_income` | `plannedYtd.rent_income` | `yeTarget.rent_income` |
| Ã¢â€ Â³ incl. Last-Month Deposit (informational) | `lastMonthRentBonus` shown as breakdown Ã¢â‚¬â€ only when `showDepositBreakdown` | Ã¢â‚¬â€ | Ã¢â‚¬â€ |
| Maintenance | `actualYtd.maintenance` | `plannedYtd.maintenance` = `plan_rent Ãƒâ€” 0.05` | `yeTarget.maintenance` |
| Ã¢â€ Â³ as % of rent | `actualYtd.maintenance / actualYtd.rent_income Ãƒâ€” 100` | 5.00% (fixed) | 5.00% (fixed) |
| HOA, Pool, Garden | `actualYtd.hoa_payments + pool + garden` | `(hoaAnnual/12 + poolMonthly + gardenMonthly) Ãƒâ€” monthsElapsed` | `yeTarget.hoa + pool + garden` |
| PM Fee | `actualYtd.pm_fee` | `planned_pm_fee_monthly Ãƒâ€” monthsElapsed` | `planned_pm_fee_monthly Ãƒâ€” 12` |
| Total Expenses | `actualYtd.total_expenses` (excl. property tax) | `plannedYtd.total_expenses` | `yeTargetTotalExp` |
| Net Income | `actualYtd.net_income` | `plannedYtd.net_income` | `yeTargetNet` |
| Property Tax | `actualYtd.property_tax` (below the line) | Ã¢â‚¬â€ | `yeTarget.property_tax` |

---

### D.4 Admin Financials Ã¢â‚¬â€ InvestmentPerformanceTable (Investment Performance section)

| Row | Actual | Plan | YE Target |
|-----|--------|------|-----------|
| ROI Ã¢â‚¬â€ Net Income (Pre-Tax) | `actualYtd.net_income / costBasis Ãƒâ€” 100` | `plannedYtd.net_income / costBasis Ãƒâ€” 100` | `yeTargetNet / costBasis Ãƒâ€” 100` |
| ROI Post Property Tax | `(actualYtd.net_income Ã¢Ë†â€™ actualYtd.property_tax) / costBasis Ãƒâ€” 100` | Ã¢â‚¬â€ | Ã¢â‚¬â€ |
| Home Value Appreciation | `(current_market_value Ã¢Ë†â€™ cost_basis) / cost_basis Ãƒâ€” 100` | Ã¢â‚¬â€ | Ã¢â‚¬â€ |
| ROI Post Tax + Appr Ã¢Ë†â€™ Closing Cost | `(netIncome Ã¢Ë†â€™ propertyTax Ã¢Ë†â€™ closingCosts + appreciationValue) / costBasis Ãƒâ€” 100` | Ã¢â‚¬â€ | Ã¢â‚¬â€ |

> **ROI rows and YTD Income ROI card must share the same numerator (`actualYtd.net_income`) and denominator (`cost_basis`).**

---

### D.5 Admin Financials Ã¢â‚¬â€ InvestmentPerformanceTable (Home Performance section)

| Row | Formula |
|-----|---------|
| Purchase Price + Repairs | `cost_basis = home_cost + home_repair_cost + closing_costs` |
| Current Value | `canonicalMetrics.current_market_value` |
| Appreciation since purchase | `(current_market_value Ã¢Ë†â€™ cost_basis) / cost_basis Ãƒâ€” 100` |
| Appreciation YTD (from {Mon}) | `(latest Ã¢Ë†â€™ earliest market_estimate in performanceYear) / cost_basis Ãƒâ€” 100` |
| Monthly Gain | `appreciation_value / months_owned` Ã¢â€ â€™ `/ cost_basis Ãƒâ€” 100` |
| Annualized Gain | `monthly_gain Ãƒâ€” 12` Ã¢â€ â€™ `/ cost_basis Ãƒâ€” 100` |
| Months Owned | `DATEDIF(purchase_date, TODAY(), "m")` from canonical metrics |

---

### D.6 Owner Dashboard Ã¢â‚¬â€ InvestmentPerformanceTable

Same component as admin. Key prop differences:

| Prop | Formula | Notes |
|------|---------|-------|
| `actual.grossIncome` | `metrics.ytd_rent_income` (canonical, inclusive) | Same inclusive logic |
| `actual.maintenancePct` | `metrics.maintenance_pct` (canonical) | |
| `roi.preTax` | `metrics.roi_pre_tax` (canonical) | `ytd.net_income / cost_basis Ãƒâ€” 100` |
| `roi.postTax` | `metrics.roi_post_tax` (canonical) | |
| `roi.planRoi` | `planNetIncomePeriod / cost_basis Ãƒâ€” 100` | Period-proportional plan |
| `roi.yeTargetRoi` | `yeTarget.net_income / cost_basis Ãƒâ€” 100` | From annual targets table |
| `plan.pmFee` | `property.planned_pm_fee_monthly Ãƒâ€” elapsedMonths` | Ã¢Å“â€¦ Included |
| `plan.totalExpenses` | `planMaintenancePeriod + planHoaPoolGardenPeriod + planPmFeePeriod` | All expense lines |

> Owner page plan calculations (`planRentPeriod`, `planHoaPoolGardenPeriod`, `planPmFeePeriod`, `planNetIncomePeriod`) are period-proportional (elapsed months), not full-year. Full-year plan is `annualPlan` in admin financials.

---

### D.7 Owner Dashboard Ã¢â‚¬â€ Gauges, Performance Status & Narrative

| Output | Formula | Variable |
|--------|---------|----------|
| Gauge 1: Projected ROI (Pre-Tax) | `calculateExpectedRoi({rent, pool, garden, hoa, pmFee, costBasis})` = `(annualPlanNet) / costBasis Ãƒâ€” 100` | `projectedRoi` |
| Gauge 2: Actual ROI (Period) | `metrics.roi_pre_tax` = `ytd.net_income / cost_basis Ãƒâ€” 100` | `metrics.roi_pre_tax` |
| Gauge 3: Total ROI (with Appreciation) | `metrics.roi_with_appreciation` = `(ytd.net_income + appreciation_value) / cost_basis Ãƒâ€” 100` | `gaugeRoiTotal` |
| Performance grade | Excellent: `projectedRoi Ã¢â€°Â¥5%` AND maint <5%; Good: Ã¢â€°Â¥3% AND <7%; else Needs Attention | `performanceStatus` |
| Narrative: period plan net | `planNetIncomePeriod = planRentPeriod Ã¢Ë†â€™ planMaintenancePeriod Ã¢Ë†â€™ planHoaPoolGardenPeriod Ã¢Ë†â€™ planPmFeePeriod` | Period-proportional |
| Narrative: period plan ROI | `planRoiPeriod = planNetIncomePeriod / cost_basis Ãƒâ€” 100` | Period-proportional |

---

### D.8 Planned YTD Ã¢â‚¬â€ `plannedYtd` useMemo

Lives in `app/admin/financials/page.tsx`. Single source of plan figures for the selected period. **Period-aware** Ã¢â‚¬â€ recalculates when `periodType` changes.

**Period range logic:**
- `YTD`: lease-start month (or Jan 1 if lease started in a prior year) through current month of `performanceYear`
- `Lease`: lease-start through today, capped at `lease_end`
- `Alltime`: lease-start through today

**`rent_income` rules (pure plan, no actual-rent override):**
- Each month = `target_monthly_rent`
- Lease-start month prorated: `rentMonthly Ãƒâ€” (daysRemainingInMonth / daysInMonth)`
- Deposit added in lease-start month when `last_month_rent_collected === true`: `+target_monthly_rent`

| Field | Formula |
|-------|---------|
| `rent_income` | Sum of pure plan rent per month (see above) |
| `maintenance` | `rent_income Ãƒâ€” 0.05` |
| `pool` | `planned_pool_cost Ãƒâ€” monthsElapsedPlanned` |
| `garden` | `planned_garden_cost Ãƒâ€” monthsElapsedPlanned` |
| `hoa_payments` | `(calculatedAnnualHoa / 12) Ãƒâ€” monthsElapsedPlanned` |
| `pm_fee` | `planned_pm_fee_monthly Ãƒâ€” monthsElapsedPlanned` |
| `total_expenses` | `maintenance + pool + garden + hoa_payments + pm_fee` (NO property_tax) |
| `net_income` | `rent_income Ã¢Ë†â€™ total_expenses` |

> **Never** use actual `rent_income` from `allMonthlyData` to override plan figures. Plan is plan. Actual is actual. Mixing the two was the root cause of prior inconsistencies.

---

### D.9 Annual Plan Ã¢â‚¬â€ `annualPlan` useMemo

Full-year plan (not period-proportional). Lives in `app/admin/financials/page.tsx`. Powers the Projected Income Summary table and the Projected ROI (Pre-Tax) card.

| Field | Formula |
|-------|---------|
| `rent` | `target_monthly_rent Ãƒâ€” 12` |
| `maintenance` | `rent Ãƒâ€” 0.05` |
| `pool` | `planned_pool_cost Ãƒâ€” 12` |
| `garden` | `planned_garden_cost Ãƒâ€” 12` |
| `hoa` | `calculatedAnnualHoa` (HOA1 + HOA2, adjusted for frequency) |
| `pmFee` | `planned_pm_fee_monthly Ãƒâ€” 12` |
| `totalExpenses` | `maintenance + pool + garden + hoa + pmFee` |
| `netIncome` | `rent Ã¢Ë†â€™ totalExpenses` |
| **Projected ROI (Pre-Tax)** | `netIncome / calculatedTotalCost Ãƒâ€” 100` Ã¢â‚¬â€ **canonical formula, same across all three locations** |
| **Projected ROI (Post-Tax)** | `(netIncome Ã¢Ë†â€™ propertyTax) / calculatedTotalCost Ãƒâ€” 100` |

> The three locations that must show the **same Projected ROI (Pre-Tax)** value:
> 1. Admin Dashboard card "Projected ROI %" Ã¢â€ â€™ `calculateExpectedRoi()` with PM fee
> 2. Admin Financials "Projected ROI (pre-tax)" Ã¢â€ â€™ `annualPlan.netIncome / calculatedTotalCost Ãƒâ€” 100`
> 3. Owner Dashboard Gauge 1 "Projected ROI (Pre-Tax)" Ã¢â€ â€™ `projectedRoi = calculateExpectedRoi()` with PM fee

---

### D.10 Formula Accordion (Admin Financials Ã¢â‚¬â€ Monthly Performance Tab)

Collapsible reference at the bottom of the Monthly Performance tab (`app/admin/financials/page.tsx`, `showFormulas` state).

| Section | Key Formulas |
|---------|-------------|
| **Cost Basis** | `home_cost + home_repair_cost + closing_costs` |
| **Annual Plan Net Income** | `(rentÃƒâ€”12) Ã¢Ë†â€™ (maintÃƒâ€”12 + poolÃƒâ€”12 + gardenÃƒâ€”12 + hoa_annual + pmFeeÃƒâ€”12)`; maintenance = rentÃƒâ€”5% |
| **Projected ROI (Pre-Tax)** | `annualPlan.netIncome / calculatedTotalCost Ãƒâ€” 100` |
| **YTD Income ROI** | `actualYtd.net_income / calculatedTotalCost Ãƒâ€” 100` (includes deposit in month received) |
| **Total YTD ROI** | `(actualYtd.net_income + ytdAppreciation.value) / calculatedTotalCost Ãƒâ€” 100` Ã¢â‚¬â€ uses YTD appreciation, not since-purchase |
| **Deposit / Last-Month Rent** | Included in gross income in the month received; breakdown sub-row shown when `showDepositBreakdown` |

> The accordion is for user reference only Ã¢â‚¬â€ do not add accordion sections to owner or admin dashboard pages.

---

# =========================
# RECURRING SESSION CHECKLIST
# =========================

### After Every Prompt
- New files in correct locations (Appendix B)
- No orphaned imports, unused state, or dead helpers left behind
- If a skill applies to the task, it was used (C.22)
- Conflicting or superseded logic removed
- `docs/project-wiki.md` updated if architecture, routing, billing, onboarding, or deployment changed
- End response with: _"Do you have more input, or shall I push to GitHub?"_
- End response with: _"SQL to run"_ (or "No SQL required.")

### After Any DB Schema Change
- Migration file in `supabase/migrations/` with timestamp prefix
- Uses `IF NOT EXISTS` guards; has defaults/nullable; includes rollback SQL comment
- Tell user: "Run this SQL in Supabase Dashboard > SQL Editor"

**Pending migrations:** `supabase/migrations/20241211_add_roi_and_timestamps.sql`, `supabase/migrations/20260320_add_planned_pm_fee_monthly.sql`

### After Every Session
Stage specific files, commit with clear message. **Ask user before pushing** Ã¢â‚¬â€ never auto-push.

### Guardrails Self-Update
Add new lessons to Appendix C/D. Update version and Document Control table. Ask user before pushing.

---

# =========================
# HOW TO CHANGE A FINANCIAL FORMULA (MANDATORY PROTOCOL)
# =========================

Changing a formula is the highest-risk operation in this codebase. A formula exists in multiple layers simultaneously Ã¢â‚¬â€ the calculation library, one or more API routes, one or more page components, and Appendix D of this file. Changing it in only one place creates silent divergence.

### Step 1: Find Every Output Location First
Before writing a single line of code, grep for the variable name across the entire repo:
```
Grep pattern: <variable_name>
Scope: entire luxor-portal/
```
Look in: API routes (`app/api/`), page components (`app/admin/`, `app/owner/`), shared components (`app/components/`), and the calculation library (`lib/calculations/`).

List every file that reads or renders the variable. Do not start coding until this list is complete.

### Step 2: Identify the Single Source of Truth
Every formula must live in exactly one place and be imported everywhere else:
- **Financial metrics (YTD actuals):** `lib/calculations/canonical-metrics.ts` Ã¢â€ â€™ `calculateCanonicalMetrics()`
- **Plan / projected values:** `lib/financial-calculations.ts` Ã¢â€ â€™ `calculateExpectedRoi()` / `calculateExpectedAnnualNet()`
- **Period elapsed helpers:** `lib/date-only.ts`

If the formula currently exists inline in a page or API route, move it to the appropriate lib file first, then import it. Never compute the same value two different ways in two different files.

### Step 3: Update All Output Locations in One PR
Make all changes atomically:
1. Update the lib function (single source of truth)
2. Update every API route that calls it (check Supabase `select` fields too Ã¢â‚¬â€ new columns must be fetched)
3. Update every page component that renders it
4. Update every shared component prop type that carries it
5. Remove any now-dead variables, useMemos, or inline duplicates

### Step 4: Update Appendix D Before Closing
1. Update **D.0 Master Variable Table** Ã¢â‚¬â€ change the formula text for the affected row(s)
2. Update the relevant **D.1Ã¢â‚¬â€œD.10** section if it describes the changed formula in detail
3. Update the formula accordion text in `app/admin/financials/page.tsx` if the label or formula description changed
4. Bump the Document Control version

### Common Mistakes That Caused Past Bugs

| Mistake | What Went Wrong | Prevention |
|---------|----------------|------------|
| PM fee added to `calculateExpectedAnnualNet()` but not passed in API route call | Admin dashboard projected ROI excluded PM fee; admin financials included it Ã¢â‚¬â€ two different numbers for the same metric | Always grep for every call site of the function you changed |
| `displayYtd` introduced to exclude deposit from "recurring" figures | Three variables (`displayYtd`, `depositInCurrentViewData`, `depositAppliesThisView`) diverged across pages; deposit logic inconsistent | One variable per decision (`showDepositBreakdown`); never introduce a parallel "adjusted" copy of an existing metric |
| `yeTargetRoi` computed as `projectedRoi` (plan formula) instead of from YE target data | YE Target column showed plan values, not actual year-end targets | Actual/Plan/YE Target are three distinct sources; never substitute one for another without explicit design intent |
| `calculatedYeTarget` useMemo defined but never referenced | Dead code created confusion about what was authoritative | After every change, grep for every symbol you define; remove unused ones immediately |
| Monthly table YE Target row hardcoded `{formatCurrency(0)}` for PM fee | PM fee appeared correct in InvestmentPerformanceTable but wrong in the monthly breakdown table | When a variable has multiple render locations (table row AND component), update both |

### Formula Change Verification Checklist
Before marking a formula task done:
- [ ] Grepped for the variable name across the entire repo Ã¢â‚¬â€ no missed locations
- [ ] Only one lib function computes this value Ã¢â‚¬â€ no inline duplicates
- [ ] All API routes fetch the DB columns this formula needs (check `select` queries)
- [ ] All page components pass the value through to all child components that render it
- [ ] All dead code from the old approach removed (imports, useMemos, state vars, props)
- [ ] Appendix D updated Ã¢â‚¬â€ D.0 row and relevant detail section
- [ ] Formula accordion text in admin financials updated if label/formula changed
- [ ] Document Control version bumped

### C.29 Portal Isolation

Luxor Portal is a standalone application. Do not reference or preserve compatibility code for any separate portal, shared database split, or cross-app financial flow.

Key rules:
- portal.luxordev.com is the only portal covered by this repo.
- Owner billing and Services Billing always use the Luxor platform Stripe account.
- Tenant billing must resolve the connected Stripe account from tenant bill -> property -> owner -> owner Stripe setup.
- Never add fallback Stripe routing for tenant payments.
- Keep Luxor billing, auth, and data models self-contained in this codebase.

---

# =========================
# DOCUMENT CONTROL
# =========================

| Field | Value |
|-------|-------|
| Version | 3.0 |
| Status | Active |
| Last Updated | 2026-04-17 - v3.0: Removed legacy Subscribe Portal / dual-portal guidance. Luxor Portal is now documented as a self-contained application only; stale cross-portal compatibility references deleted. |


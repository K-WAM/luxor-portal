# LUXOR ENGINEERING GUARDRAILS

## 1. Purpose and Scope

This document governs all future development and AI-assisted changes to the Luxor application. It establishes mandatory workflows, reuse-first engineering principles, and backward compatibility requirements.

**Scope:**
- All code changes to the Luxor codebase
- All AI-assisted development sessions
- All new feature implementations
- All bug fixes and maintenance work
- All database schema modifications

**Out of Scope:**
- Infrastructure and deployment configuration (handled separately)
- Third-party service configurations
- Local development environment setup

---

## 2. System Stability Statement

Luxor is a stable, near-production property management portal. The codebase represents months of deliberate architectural decisions and tested business logic.

**Current State:**
- Three fully functional portals: Admin, Owner, Tenant
- Established authentication and authorization via Supabase with role-based access
- Canonical financial calculations validated against Excel workbook formulas
- Database schema with RLS policies enforcing data security
- Consistent API route patterns with standardized error handling

**Implications:**
- The existing architecture is intentional and must be preserved
- Working code is assumed correct unless proven otherwise
- Refactoring is prohibited unless explicitly requested and approved
- All changes must integrate with existing patterns, not replace them

---

## 3. Backward Compatibility and Data Safety Rules

### 3.1 Data Safety (Non-Negotiable)

| Rule | Requirement |
|------|-------------|
| No data deletion | Never delete historical records from `property_monthly_performance`, `billing_invoices`, `tenant_bills`, or any financial data |
| Schema changes must be additive | New columns must have defaults or be nullable; existing columns cannot be removed or renamed |
| RLS policies are immutable | Existing Row Level Security policies cannot be modified without explicit approval |
| Migration rollback | Every migration must be reversible; document rollback procedure in migration file |

### 3.2 API Backward Compatibility

| Rule | Requirement |
|------|-------------|
| Response structure | Existing API response fields cannot be removed or renamed |
| New fields only | Add new fields to responses; never remove existing ones |
| Error codes | Existing error codes (401, 403, 400, 404, 500) and messages must remain consistent |
| Route paths | Existing route paths cannot be changed; add new routes if needed |

### 3.3 Type Backward Compatibility

| Rule | Requirement |
|------|-------------|
| Type extensions | Extend existing types with optional properties; never make required properties optional |
| Interface contracts | `CanonicalMetrics`, `PropertyData`, `MonthlyDataRow` interfaces are frozen |
| Hook signatures | `useAuth()`, `usePeriodFilter()` return types cannot change |

---

## 4. Reuse-First Engineering Rules

### 4.1 Mandatory Reuse Hierarchy

Before writing any new code, search for and evaluate existing implementations in this order:

1. **Existing component in `app/components/`**
   - `GaugeChart` for semi-circle gauge visualizations
   - `PeriodToggle` for YTD/Lease Term/All Time selection
   - `ROISpeedometer` for ROI visualization
   - `Navbar` for navigation elements

2. **Existing hook in `app/hooks/`**
   - `usePeriodFilter` for any period-based filtering
   - `useAuth` (via `AuthContext`) for all auth state

3. **Existing utility in `lib/`**
   - `lib/calculations/canonical-metrics.ts` for ALL financial calculations
   - `lib/date-only.ts` for ALL date parsing and formatting
   - `lib/auth/route-helpers.ts` for ALL API route authentication
   - `lib/supabase/client.ts` for client-side Supabase access
   - `lib/supabase/server.ts` for server-side Supabase access

4. **Existing pattern in similar route/page**
   - Admin portal patterns in `app/admin/`
   - Owner portal patterns in `app/owner/`
   - Tenant portal patterns in `app/tenant/`
   - API route patterns in `app/api/`

### 4.2 Prohibited Actions

| Action | Status |
|--------|--------|
| Creating new financial calculation functions | PROHIBITED - use `canonical-metrics.ts` |
| Creating new auth validation helpers | PROHIBITED - use `route-helpers.ts` |
| Creating new date utilities | PROHIBITED - use `date-only.ts` |
| Creating new Supabase client instances | PROHIBITED - use existing client/server modules |
| Duplicating form validation logic | PROHIBITED - extract to shared utility if pattern emerges |
| Creating role-specific calculation variants | PROHIBITED - extend canonical metrics |

### 4.3 Extension Over Duplication

When existing code does not fully meet requirements:

1. **Extend the existing module** with new optional parameters
2. **Add new exported functions** to the existing file
3. **Create wrapper functions** that compose existing utilities
4. **Never copy-paste** existing code into new files

---

## 5. Required Workflow for All Changes

Every code change must follow this workflow. No exceptions.

### Phase 1: Investigate

**Objective:** Understand existing implementation before proposing changes.

**Required Actions:**
- [ ] Search for existing implementations that solve the problem
- [ ] Read all files that will be modified
- [ ] Identify reusable components, hooks, utilities, and patterns
- [ ] Document existing data flow and dependencies
- [ ] List all files that will be affected

**Investigation Checklist:**
```
1. Searched app/components/ for existing UI components
2. Searched app/hooks/ for existing hooks
3. Searched lib/ for existing utilities
4. Searched app/api/ for similar API patterns
5. Reviewed database schema in supabase/migrations/
6. Checked TypeScript types in lib/types/
7. Identified test files that require updates
```

### Phase 2: Execution Plan

**Objective:** Define exactly what will change before writing code.

**Required Format:**
```
## Execution Plan

### Files to Modify
- [file path]: [description of change]

### Files to Create (if any)
- [file path]: [justification for new file]

### Dependencies
- [list any new packages or imports]

### Database Changes (if any)
- [migration name]: [description]

### API Changes (if any)
- [endpoint]: [method] - [description]
```

### Phase 3: Impact Analysis

**Objective:** Identify all downstream effects.

**Required Analysis:**
```
## Impact Analysis

### Direct Dependencies
- [files/modules that import the changed code]

### API Consumers
- [frontend components that call modified APIs]

### Database Implications
- [RLS policy changes, index considerations]

### Type Safety
- [TypeScript interfaces affected]

### Breaking Changes
- [list any breaking changes - should be NONE]
```

### Phase 4: Test and Verification Plan

**Objective:** Define how changes will be verified.

**Required Format:**
```
## Verification Plan

### Unit Tests
- [ ] [test description]

### Integration Points
- [ ] [manual verification steps]

### Regression Checks
- [ ] Existing tests pass
- [ ] Auth flows unaffected
- [ ] Financial calculations unchanged
- [ ] Portal navigation functional
```

### Phase 5: Explicit Confirmation

**Before executing any code changes, present the following:**

```
## Change Summary

Files Modified: [count]
Files Created: [count]
Database Migrations: [count]
Breaking Changes: [NONE or list]
Reused Components: [list]
New Dependencies: [NONE or list]

Proceed with implementation? (Yes/No)
```

**Wait for explicit approval before Phase 6.**

### Phase 6: Execute

**Only after receiving explicit "Yes" confirmation:**
- Implement changes following the approved plan
- Write tests before or alongside implementation
- Validate all verification steps
- Report completion status

---

## 6. UX/UI Stability Rules

### 6.1 UX is Approved Unless Otherwise Stated

| Element | Rule |
|---------|------|
| Portal layouts | Admin, Owner, Tenant layouts are final |
| Navigation structure | Sidebar items and hierarchy are fixed |
| Color scheme | Existing Tailwind classes and CSS variables are final |
| Component styling | GaugeChart, PeriodToggle styling is approved |
| Form layouts | Existing form structures are approved |
| Error displays | Current error presentation is approved |

### 6.2 Prohibited UI Changes

- Moving sidebar navigation items
- Changing color schemes or themes
- Altering existing component dimensions
- Modifying responsive breakpoints
- Adding animations to existing components
- Changing font sizes or typography

### 6.3 Allowed UI Additions

- New components that follow existing patterns
- New pages that use established layouts
- New form fields within existing form structures
- Additional chart types following GaugeChart patterns

---

## 7. Stack Assumptions

The following technology choices are final. Do not propose alternatives.

### 7.1 Locked Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js (App Router) | 15.x |
| Runtime | React | 18.x |
| Language | TypeScript | 5.x (strict mode) |
| Database | Supabase (PostgreSQL) | Current |
| Auth | Supabase Auth | Current |
| Styling | Tailwind CSS | 4.x |
| Charts | Chart.js, Recharts | Current |

### 7.2 Prohibited Proposals

- State management libraries (Redux, Zustand, Jotai)
- Alternative auth providers
- Alternative databases
- CSS-in-JS libraries
- Alternative chart libraries
- ORM layers over Supabase
- Alternative form libraries

### 7.3 Exception Process

To propose a stack change:
1. Document technical justification
2. Provide migration impact analysis
3. Obtain explicit written approval
4. This process is expected to be rare

---

## 8. AI Usage Boundaries

### 8.1 AI-Assisted Development Rules

| Rule | Requirement |
|------|-------------|
| Investigation first | AI must explore codebase before proposing changes |
| Reuse mandate | AI must search for and use existing patterns |
| No invention | AI cannot propose new architectural patterns |
| Plan approval | AI must present execution plan before implementing |
| Minimal changes | AI must make smallest possible change to achieve goal |

### 8.2 AI Prohibited Actions

- Refactoring existing working code
- Proposing "improvements" to established patterns
- Adding abstractions or utilities "for future use"
- Modifying code outside the scope of the request
- Adding comments, docstrings, or documentation to unchanged code
- Suggesting performance optimizations unless requested
- Creating new directories or organizational structures

### 8.3 AI Required Behaviors

- State which existing modules will be reused
- Explain why new code is necessary (if any)
- Identify all files that will be modified
- Confirm backward compatibility
- Request explicit approval before execution

---

## 9. What This Document Does NOT Do

This document does not:

- Authorize architectural redesigns
- Permit refactoring of working code
- Allow technology stack changes
- Enable "improvement" initiatives
- Justify speculative development
- Permit breaking changes under any circumstance
- Override explicit user instructions (user intent takes precedence)
- Apply to emergency production hotfixes (follow incident response procedures)

This document is not:

- A design system specification
- A feature roadmap
- A technical debt registry
- A performance optimization guide
- A testing strategy document

---

## 10. Enforcement

### 10.1 Violation Policy

**Violations of these guardrails result in automatic rejection.**

| Violation | Response |
|-----------|----------|
| Code submitted without investigation phase | Rejected |
| Changes without execution plan | Rejected |
| Breaking changes to API/types | Rejected |
| Data deletion or schema removal | Rejected |
| New code duplicating existing utilities | Rejected |
| Stack changes without approval | Rejected |
| UI modifications without request | Rejected |
| Refactoring without explicit approval | Rejected |

### 10.2 Review Requirements

Every change must demonstrate:
- [ ] Investigation phase completed
- [ ] Existing patterns reused where applicable
- [ ] Execution plan approved
- [ ] Impact analysis documented
- [ ] Verification plan defined
- [ ] Backward compatibility confirmed
- [ ] Minimal scope maintained

### 10.3 Escalation Path

If guardrails block legitimate work:
1. Document the constraint
2. Explain why exception is needed
3. Propose minimal exception scope
4. Obtain explicit written approval
5. Document exception in commit message

---

## Appendix A: Luxor-Specific Patterns Reference

### A.1 Auth Pattern (Route Handlers)

```typescript
import { getAuthContext, isAdmin, getAccessiblePropertyIds } from '@/lib/auth/route-helpers';

export async function GET() {
  const { user, role } = await getAuthContext();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!isAdmin(role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }
  // Proceed with authorized logic
}
```

### A.2 Financial Calculations Pattern

```typescript
import { calculateCanonicalMetrics } from '@/lib/calculations/canonical-metrics';

const metrics = calculateCanonicalMetrics(property, monthlyData, {
  asOf: new Date(),
  monthsFilter: [1, 2, 3, 4, 5, 6],
  multiYear: false,
});
```

### A.3 Date Handling Pattern

```typescript
import { parseDateOnly, formatDateOnly, formatMonthYear } from '@/lib/date-only';

const date = parseDateOnly('2024-06-15');
const formatted = formatDateOnly(date);
const monthYear = formatMonthYear(2024, 6);
```

### A.4 Period Filter Pattern

```typescript
import { usePeriodFilter } from '@/app/hooks/usePeriodFilter';

const { periodType, setPeriodType, startMonth, endMonth, monthsInPeriod, label } = usePeriodFilter({
  leaseStart: property.lease_start,
  leaseEnd: property.lease_end,
  currentYear: new Date().getFullYear(),
});
```

### A.5 API Response Pattern

```typescript
// Success
return NextResponse.json(data);
return NextResponse.json({ success: true });

// Errors
return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
return NextResponse.json({ error: 'Property ID required' }, { status: 400 });
return NextResponse.json({ error: 'Property not found' }, { status: 404 });
return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
```

### A.6 Supabase Query Pattern

```typescript
// Client-side
import { supabase } from '@/lib/supabase/client';

// Server-side (admin operations)
import { supabaseAdmin } from '@/lib/supabase/server';

const { data, error } = await supabase
  .from('properties')
  .select('*')
  .eq('id', propertyId)
  .single();

if (error) {
  return NextResponse.json({ error: 'Failed to fetch property' }, { status: 500 });
}
```

---

## Appendix B: File Location Reference

| Purpose | Location |
|---------|----------|
| Page components | `app/[portal]/[feature]/page.tsx` |
| Layout components | `app/[portal]/layout.tsx` |
| API routes | `app/api/[domain]/route.ts` |
| Reusable components | `app/components/` |
| UI components | `app/components/ui/` |
| Chart components | `app/components/charts/` |
| Custom hooks | `app/hooks/` |
| Auth context | `app/context/AuthContext.tsx` |
| Auth helpers | `lib/auth/route-helpers.ts` |
| Supabase clients | `lib/supabase/` |
| Financial calculations | `lib/calculations/` |
| Date utilities | `lib/date-only.ts` |
| TypeScript types | `lib/types/` |
| Database migrations | `supabase/migrations/` |

---

## Document Control

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Status | Active |
| Applies To | All Luxor development |
| Review Cycle | On significant system changes |

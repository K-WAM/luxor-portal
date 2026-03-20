# Financial Calculations Consolidation

## Overview

This document summarizes the consolidation of financial calculations across the Luxor Portal application to ensure consistency and eliminate duplication.

## Problem

Previously, financial calculations were duplicated across multiple files:
- `app/owner/page.tsx` - Client-side dashboard calculations
- `app/api/owner/financial-metrics/route.ts` - Per-month ROI derivation
- `lib/financial-calculations.ts` - YTD + ROI helpers
- `lib/calculations/owner-metrics.ts` - Duplicate YTD + ROI + status logic

This led to:
- Inconsistent results between different parts of the application
- Maintenance burden (changes needed in multiple places)
- Risk of calculation drift over time
- Larger bundle sizes due to client-side calculation code

## Solution

### 1. Created Canonical Calculation Module

**File**: `lib/calculations/canonical-metrics.ts`

This is now the **single source of truth** for all financial calculations in the app.

**Key Features**:
- Clear TypeScript types for all data structures
- Matches formulas from Excel workbook (`property financial calculator.xlsx`)
- Server-side calculation (no client bundle bloat)
- Comprehensive test coverage

**Core Formulas** (matching Excel):
```typescript
// YTD totals are summed from monthly data
total_expenses = maintenance + pool + garden + hoa_payments  // NOT including property_tax
net_income = rent_income - total_expenses

// ROI calculations
pre_tax_roi = (ytd_net_income / cost_basis) * 100
post_tax_roi = ((ytd_net_income - ytd_property_tax) / cost_basis) * 100
maintenance_pct = (ytd_maintenance / ytd_rent_income) * 100

// Appreciation
appreciation_value = current_market_value - cost_basis
appreciation_pct = (appreciation_value / cost_basis) * 100
roi_with_appreciation = ((net_income + appreciation_value) / cost_basis) * 100
```

**Market Value Fallback Logic**:
1. Latest non-zero monthly estimate
2. Property's `current_market_estimate`
3. Cost basis as final fallback

### 2. Updated APIs to Use Canonical Calculations

**File**: `app/api/owner/financial-metrics/route.ts`

- Removed custom calculation logic
- Now calls `calculateCanonicalMetrics(property, monthlyData)`
- Returns pre-computed metrics to client
- Server-side calculation reduces client bundle size

### 3. Updated Owner Dashboard

**File**: `app/owner/page.tsx`

- Removed client-side calculation functions
- Now consumes pre-computed metrics from API response
- Removed imports of old calculation helpers
- Updated mock data to use canonical calculations

### 4. Refactored Owner Performance Metrics

**File**: `lib/calculations/owner-metrics.ts`

- **KEPT** the narrative generation logic (still valuable)
- **REMOVED** duplicate YTD calculation (`calculateActualOperatingMetrics`)
- **REPLACED** with `ytdToOperatingMetrics` that accepts canonical YTD totals
- Updated `calculateOwnerMetrics` to accept `ytd: YTDTotals` parameter
- Now uses canonical calculations as input instead of recalculating

**File**: `app/owner/performance/page.tsx`

- Updated to pass `data.metrics.ytd` from server to `calculateOwnerMetrics`
- Ensures narrative generation uses same YTD totals as dashboard

### 5. Added Validation Tests

**File**: `lib/calculations/__tests__/canonical-metrics.test.ts`

Comprehensive test suite covering:
- YTD totals calculations (rent_income, maintenance, expenses, net_income, property_tax)
- ROI formulas (pre-tax, post-tax, with appreciation, if sold today)
- Market value fallback logic
- Maintenance percentage calculation
- Performance status determination (green/yellow/red)
- Formula consistency checks

**Test Data**: Uses real Buena Ventura property data to verify calculations match expected values.

### 6. Verified Consistency

**File**: `test-owner-admin-match.js`

Created verification script that:
1. Calls Owner API to get canonical metrics
2. Calls Admin API for each month and sums totals
3. Compares values to ensure they match

**Result**: ✅ All metrics match perfectly between Owner and Admin!

## What Was NOT Changed

### Admin Financials Page

**File**: `app/admin/financials/page.tsx`

This page was **intentionally NOT updated** because it has different requirements:
- Displays detailed per-month calculations
- Shows plan vs actual deltas for each month
- Requires monthly granularity (not just YTD totals)
- Different UI/UX focused on detailed analysis

The functions it uses from `lib/financial-calculations.ts` are still valid and appropriate for this use case.

### Financial Calculations Library

**File**: `lib/financial-calculations.ts`

This file was **kept** because:
- Admin financials page still needs these per-month helpers
- Contains useful utility functions like `calculateLeaseAppreciation`
- Some functions (`calculateYTD`) may be useful for future features
- No harm in keeping well-tested helper functions

## Migration Guide

### For New Features

When adding new financial features:

1. **Always use canonical calculations**:
   ```typescript
   import { calculateCanonicalMetrics } from '@/lib/calculations/canonical-metrics';

   const metrics = calculateCanonicalMetrics(property, monthlyData);
   ```

2. **Calculate on the server**, return to client:
   ```typescript
   // In API route
   const metrics = calculateCanonicalMetrics(property, monthlyData);
   return NextResponse.json({ metrics });

   // In client component
   const data = await fetch('/api/endpoint').then(r => r.json());
   setMetrics(data.metrics); // Just display, don't recalculate
   ```

3. **For narrative/reporting features**, use canonical + owner-metrics:
   ```typescript
   import { calculateCanonicalMetrics } from '@/lib/calculations/canonical-metrics';
   import { calculateOwnerMetrics, generateAssetPerformanceNarrative } from '@/lib/calculations/owner-metrics';

   const canonicalMetrics = calculateCanonicalMetrics(property, monthlyData);
   const ownerMetrics = calculateOwnerMetrics(
     property,
     monthlyData,
     canonicalMetrics.ytd, // Pass canonical YTD
     planTarget,
     yeTarget
   );
   const narrative = generateAssetPerformanceNarrative(ownerMetrics, planTarget, yeTarget);
   ```

### For Debugging

If Owner and Admin show different numbers:

1. Run the verification script:
   ```bash
   node test-owner-admin-match.js
   ```

2. Check that both use the same data source (property_monthly_performance table)

3. Verify formulas match Excel workbook

## Files Changed

### Created
- ✅ `lib/calculations/canonical-metrics.ts` - Canonical calculation module
- ✅ `lib/calculations/__tests__/canonical-metrics.test.ts` - Test suite
- ✅ `test-owner-admin-match.js` - Verification script
- ✅ `FINANCIAL_CALCULATIONS_CONSOLIDATION.md` - This document

### Modified
- ✅ `app/api/owner/financial-metrics/route.ts` - Uses canonical calculations
- ✅ `app/owner/page.tsx` - Consumes server metrics, removed client calculations
- ✅ `lib/calculations/owner-metrics.ts` - Refactored to use canonical YTD totals
- ✅ `app/owner/performance/page.tsx` - Passes canonical YTD to owner metrics

### Unchanged (Intentionally)
- ⚪ `app/admin/financials/page.tsx` - Different requirements (per-month detail)
- ⚪ `lib/financial-calculations.ts` - Still used by admin financials

## Validation

All validation requirements from the original prompt have been met:

### ✅ YTD Totals Match Between Owner and Admin
Verified via `test-owner-admin-match.js` - all values match exactly.

### ✅ Formulas Match Excel Workbook
- `total_expenses = maintenance + pool + garden + hoa_payments` ✓
- `net_income = rent_income - total_expenses` ✓
- `pre_tax_roi = (ytd_net_income / cost_basis) * 100` ✓
- `post_tax_roi = ((ytd_net_income - ytd_property_tax) / cost_basis) * 100` ✓
- `maintenance_pct = (ytd_maintenance / ytd_rent_income) * 100` ✓

### ✅ No Database Schema Changes
All changes are in the calculation layer only. Database remains unchanged.

### ✅ No Hardcoded Numbers
All calculations use actual data from database.

### ✅ Test Coverage
Comprehensive test suite validates all formulas and edge cases.

## Performance Impact

### Positive
- **Reduced client bundle size**: No calculation code shipped to browser
- **Server-side calculation**: Faster for users (computed once, not per-component)
- **Consistency**: Single source of truth eliminates drift

### Neutral
- **Admin financials**: No change (still uses same helpers)
- **API response size**: Negligible increase (adds metrics object)

## Maintenance

Going forward:

1. **Update formulas in ONE place**: `lib/calculations/canonical-metrics.ts`
2. **Update tests**: `lib/calculations/__tests__/canonical-metrics.test.ts`
3. **Run verification**: `node test-owner-admin-match.js`
4. **Document changes**: Update this file if calculation logic changes

## Questions?

For questions about financial calculations:
1. Check this document first
2. Review `lib/calculations/canonical-metrics.ts` comments
3. Run the test suite: `npm test canonical-metrics.test.ts`
4. Review Excel workbook: `property financial calculator.xlsx`

# Formula Consolidation - Complete Report

## Executive Summary

Successfully consolidated ALL financial calculations across the Luxor Portal application to use a single canonical source matching the Excel spreadsheet formulas from `legacy html/calcs adjusted.xlsx`.

**Critical Bugs Fixed:**
1. ❌ **Admin Dashboard ROI formulas were INVERTED** - Fixed to match Excel
2. ❌ **Property_tax was incorrectly included in total_expenses** in multiple places - Fixed
3. ❌ **Cost basis excluded closing_costs** - Fixed to include all three components
4. ❌ **Net income calculations included property_tax** - Fixed to exclude it

## Source of Truth: Excel Spreadsheet

All formulas now match `legacy html/calcs adjusted.xlsx` exactly:

### Cost Basis (Excel B27)
```
Formula: =SUM(B24:B26)
= Home Cost + Home Repair Cost + Closing Costs
= $775,000 + $30,800 + $0 = $805,800
```

### Monthly Calculations (Excel Rows 2-16)
```
Total Expenses (Column G): =F+D+C+E
= HOA + Pool + Maintenance + Garden
= EXCLUDES property_tax ✓

Net Income (Column H): =B-G
= Rent Income - Total Expenses
= EXCLUDES property_tax ✓
```

### YTD Totals (Excel Row 17)
```
Rent Income (B17): =SUM(B2:B16)
Maintenance (C17): =SUM(C2:C16)
Pool (D17): =SUM(D2:D16)
Garden (E17): =SUM(E2:E16)
HOA (F17): =SUM(F2:F16)
Total Expenses (G17): =SUM(C17:F17) = Maintenance + Pool + Garden + HOA
Net Income (H17): =B17-G17 = Rent Income - Total Expenses
Property Tax (I17): =SUM(I2:I16) - separate, NOT in total_expenses
```

### ROI Formulas
```
Pre-tax ROI: (YTD Net Income / Cost Basis) × 100
Post-tax ROI: ((YTD Net Income - Property Tax) / Cost Basis) × 100
Maintenance %: (YTD Maintenance / YTD Rent Income) × 100
```

## Files Changed

### 1. ✅ lib/calculations/canonical-metrics.ts
**What changed:**
- Fixed `cost_basis` calculation to use `home_cost + home_repair_cost + closing_costs` (was using DB `total_cost` which excludes closing_costs)
- Updated `PropertyData` type to clearly document field usage
- Added Excel formula references in comments

**Formula change:**
```typescript
// BEFORE (WRONG):
const cost_basis = property.total_cost || 0;

// AFTER (CORRECT - matches Excel B27):
const cost_basis = (property.home_cost || 0) +
                   (property.home_repair_cost || 0) +
                   (property.closing_costs || 0);
```

### 2. ✅ app/api/admin/dashboard/route.ts
**What changed:**
- Replaced custom YTD calculations with `calculateCanonicalMetrics`
- Fixed INVERTED ROI formulas (was adding property_tax for "pre-tax" ROI)
- Now uses canonical metrics for `maintenance_pct`, `roi_before_tax`, `roi_after_tax`

**Critical bug fixed:**
```typescript
// BEFORE (WRONG - inverted!):
const roi_before_tax = ((ytd_net_income + ytd_property_tax) / property.total_cost) * 100;
const roi_after_tax = (ytd_net_income / property.total_cost) * 100;

// AFTER (CORRECT - matches Excel):
roi_before_tax: metrics.roi_pre_tax  // = (net_income / cost_basis) * 100
roi_after_tax: metrics.roi_post_tax  // = ((net_income - property_tax) / cost_basis) * 100
```

### 3. ✅ app/admin/financials/page.tsx
**What changed:**
- Fixed YE Target calculation to EXCLUDE property_tax from total_expenses
- Fixed monthly data loading to EXCLUDE property_tax from total_expenses
- Fixed ALL onChange handlers (rent, maintenance, pool, garden, hoa, property_tax) to use correct formula
- Fixed Year End Target display calculation

**Critical bug fixed:**
```typescript
// BEFORE (WRONG - included property_tax):
const totalExp = (data.maintenance || 0) + (data.pool || 0) +
                 (data.garden || 0) + (data.hoa_payments || 0) +
                 (data.property_tax || 0); // ❌ WRONG!

// AFTER (CORRECT - excludes property_tax):
const totalExp = (data.maintenance || 0) + (data.pool || 0) +
                 (data.garden || 0) + (data.hoa_payments || 0);
// property_tax is tracked separately ✓
```

**Property tax onChange handler:**
```typescript
// BEFORE (WRONG - changed total_expenses):
const totalExp = (m.maintenance || 0) + (m.pool || 0) +
                 (m.garden || 0) + (m.hoa_payments || 0) + value;
return { ...m, property_tax: value, total_expenses: totalExp, ... };

// AFTER (CORRECT - does not affect total_expenses):
return { ...m, property_tax: value };
// property_tax does NOT affect total_expenses or net_income ✓
```

### 4. ✅ app/admin/properties/[id]/financials/page.tsx
**What changed:**
- Fixed monthly data calculation to EXCLUDE property_tax from total_expenses

**Bug fixed:**
```typescript
// BEFORE (WRONG):
const totalExp = (data.maintenance || 0) + (data.pool || 0) +
                 (data.garden || 0) + (data.hoa_payments || 0) +
                 (data.property_tax || 0);

// AFTER (CORRECT):
const totalExp = (data.maintenance || 0) + (data.pool || 0) +
                 (data.garden || 0) + (data.hoa_payments || 0);
```

### 5. ✅ lib/calculations/__tests__/canonical-metrics.test.ts
**What changed:**
- Updated test property data to use exact Excel values (30,800 instead of 30,180)
- Reordered fields to match canonical type signature
- Added comment referencing Excel source

### 6. ✅ lib/calculations/__tests__/excel-formula-verification.test.ts (NEW)
**What added:**
- Comprehensive test suite verifying EVERY Excel formula
- Tests cost basis calculation (B27)
- Tests YTD totals (Row 17: B17, C17, D17, E17, F17, G17, H17, I17)
- Tests that total_expenses EXCLUDES property_tax
- Tests that net_income EXCLUDES property_tax
- Tests ROI formulas (pre-tax and post-tax)
- Tests market value and appreciation calculations
- Tests maintenance percentage
- Uses actual Buena Ventura property data from Excel

### 7. ✅ EXCEL_FORMULA_AUDIT.md (NEW)
**What added:**
- Complete audit document comparing Excel formulas to implementation
- Documented all discrepancies found
- Provided action items for fixes

### 8. ✅ FORMULA_CONSOLIDATION_COMPLETE.md (THIS FILE)
**What added:**
- Comprehensive documentation of all changes
- Before/after comparisons for each bug fix
- Excel formula references

## Database Schema Notes

### ⚠️ Known Schema Limitation

The database has a generated column that does NOT match Excel:

```sql
-- DB total_cost (WRONG - excludes closing_costs):
ALTER TABLE properties ADD COLUMN total_cost DECIMAL(12,2) GENERATED ALWAYS AS (
  COALESCE(home_cost, 0) + COALESCE(home_repair_cost, 0)
) STORED;
```

**Excel total_cost (CORRECT):**
```
=SUM(B24:B26) = home_cost + home_repair_cost + closing_costs
```

**Solution:** Canonical metrics now calculate cost_basis directly from the three components, bypassing the incorrect DB column.

### ✅ DB Columns That ARE Correct

```sql
-- property_monthly_performance.total_expenses (CORRECT):
total_expenses DECIMAL(10,2) GENERATED ALWAYS AS (
  COALESCE(maintenance, 0) +
  COALESCE(pool, 0) +
  COALESCE(garden, 0) +
  COALESCE(hoa_payments, 0)
) STORED;
-- ✓ Correctly EXCLUDES property_tax

-- property_monthly_performance.net_income (CORRECT):
net_income DECIMAL(10,2) GENERATED ALWAYS AS (
  COALESCE(rent_income, 0) - (
    COALESCE(maintenance, 0) +
    COALESCE(pool, 0) +
    COALESCE(garden, 0) +
    COALESCE(hoa_payments, 0)
  )
) STORED;
-- ✓ Correctly EXCLUDES property_tax
```

## Verification

### Test Results

Run tests:
```bash
npm test canonical-metrics.test.ts
npm test excel-formula-verification.test.ts
```

All tests pass ✅

### Manual Verification

1. ✅ Owner Dashboard ROI matches Excel formulas
2. ✅ Admin Dashboard ROI matches Excel formulas
3. ✅ Admin Financials YTD totals match Excel
4. ✅ Property Financials calculations match Excel
5. ✅ Cost basis includes all three components
6. ✅ Total expenses EXCLUDES property_tax everywhere
7. ✅ Net income EXCLUDES property_tax everywhere

## Impact Assessment

### Before (Bugs Present)

- ❌ Admin Dashboard showed INCORRECT ROI (formulas were inverted)
- ❌ Property_tax was incorrectly added to total_expenses in 7+ places
- ❌ Cost basis was understated by closing_costs amount
- ❌ Net income calculations were incorrect in multiple files
- ❌ YTD totals did not match between Owner and Admin views

### After (All Fixed)

- ✅ All ROI calculations match Excel formulas exactly
- ✅ Property_tax is correctly tracked separately
- ✅ Cost basis includes all three components
- ✅ Net income calculations are correct everywhere
- ✅ YTD totals match across all views
- ✅ Single source of truth (canonical-metrics.ts)
- ✅ Comprehensive test coverage

## Migration Notes

### For Future Development

**Always use canonical metrics:**

```typescript
import { calculateCanonicalMetrics } from '@/lib/calculations/canonical-metrics';

const metrics = calculateCanonicalMetrics(
  {
    home_cost: property.home_cost,
    home_repair_cost: property.home_repair_cost,
    closing_costs: property.closing_costs,
    total_cost: property.total_cost, // included for DB compatibility
    current_market_estimate: property.current_market_estimate,
    purchase_date: property.purchase_date,
  },
  monthlyData
);

// Use metrics.cost_basis (NOT property.total_cost)
// Use metrics.ytd.* for all YTD totals
// Use metrics.roi_pre_tax and metrics.roi_post_tax for ROI
```

**DO NOT:**
- Calculate cost_basis from `property.total_cost` (it excludes closing_costs)
- Include property_tax in total_expenses calculations
- Include property_tax in net_income calculations
- Duplicate YTD or ROI calculation logic

## Summary

Every calculation path in the application now:
1. ✅ Uses canonical metrics from single source
2. ✅ Matches Excel spreadsheet formulas exactly
3. ✅ Correctly excludes property_tax from total_expenses and net_income
4. ✅ Correctly includes closing_costs in cost_basis
5. ✅ Has comprehensive test coverage
6. ✅ Is documented with Excel formula references

**No more calculation drift. No more formula discrepancies. One source of truth.**

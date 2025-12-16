# Owner Financial Metrics Setup Guide

This document explains how to set up and use the comprehensive owner financial metrics and performance tracking system.

## Overview

The system provides two owner-facing views:

1. **Owner Dashboard** (`/owner`) - Visual KPIs, charts, and detailed tables
2. **Asset Performance** (`/owner/performance`) - Written narrative summary report

All calculations are derived from actual data, not hard-coded values.

## Database Schema

### 1. Property Financial Fields

Run the migration `supabase/migrations/20241209_property_financials.sql` to add these fields to the `properties` table:

- `home_cost` - Purchase price
- `home_repair_cost` - Initial repair costs
- `closing_costs` - Transaction costs
- `total_cost` - Total investment (home + repairs + closing)
- `current_market_estimate` - Current market value
- `target_monthly_rent` - Planned monthly rent
- `planned_garden_cost` - Planned monthly garden expense
- `planned_pool_cost` - Planned monthly pool expense
- `planned_hoa_cost` - Planned monthly HOA expense
- `purchase_date` - Date property was purchased

### 2. Property Annual Targets Table

Stores plan and YE (year-end) targets per property per year:

```sql
CREATE TABLE property_annual_targets (
  id UUID PRIMARY KEY,
  property_id UUID REFERENCES properties(id),
  year INTEGER,
  target_type TEXT, -- 'plan' or 'ye_target'

  -- Income targets
  rent_income DECIMAL(12,2),

  -- Expense targets
  maintenance DECIMAL(12,2),
  pool DECIMAL(12,2),
  garden DECIMAL(12,2),
  hoa DECIMAL(12,2),
  property_tax DECIMAL(12,2),
  total_expenses DECIMAL(12,2),

  -- Performance targets
  net_income DECIMAL(12,2),
  roi_percentage DECIMAL(5,2),
  maintenance_percentage_target DECIMAL(5,2),

  UNIQUE(property_id, year, target_type)
);
```

### 3. Property Monthly Performance Table

Stores actual monthly income and expenses:

```sql
CREATE TABLE property_monthly_performance (
  id UUID PRIMARY KEY,
  property_id UUID REFERENCES properties(id),
  year INTEGER,
  month INTEGER CHECK (month >= 1 AND month <= 12),

  -- Income
  rent_income DECIMAL(10,2) DEFAULT 0,
  rent_paid BOOLEAN DEFAULT false,

  -- Expenses
  maintenance DECIMAL(10,2) DEFAULT 0,
  pool DECIMAL(10,2) DEFAULT 0,
  garden DECIMAL(10,2) DEFAULT 0,
  hoa_payments DECIMAL(10,2) DEFAULT 0,
  property_tax DECIMAL(10,2) DEFAULT 0,

  -- Optional market value override for this month
  property_market_estimate DECIMAL(12,2),

  -- Auto-calculated fields
  total_expenses DECIMAL GENERATED ALWAYS AS (...) STORED,
  net_income DECIMAL GENERATED ALWAYS AS (...) STORED,

  UNIQUE(property_id, year, month)
);
```

## Data Entry Flow

### As Admin:

1. **Set up property static data** (one-time):
   - Navigate to `/admin/properties`
   - Add property with address
   - Enter financial details:
     - Home cost: $775,000
     - Repair cost: $30,000
     - Closing costs: $50,000
     - Total cost: $805,000 (auto-calculated or manual)
     - Current market estimate: $960,000
     - Target monthly rent: $5,750
     - Planned monthly costs (garden, pool, HOA)
     - Purchase date

2. **Set annual targets** (once per year):
   - Create two records in `property_annual_targets`:
     - One with `target_type = 'plan'` (initial projections)
     - One with `target_type = 'ye_target'` (updated year-end projections)
   - Example for Plan:
     ```sql
     INSERT INTO property_annual_targets (
       property_id, year, target_type,
       rent_income, maintenance, pool, garden, hoa,
       property_tax, total_expenses, net_income,
       roi_percentage, maintenance_percentage_target
     ) VALUES (
       '[property-id]', 2025, 'plan',
       69000, 3500, 2400, 1800, 2400,
       11000, 10100, 58900,
       5.76, 5.00
     );
     ```

3. **Enter monthly actuals** (each month):
   - Insert/update records in `property_monthly_performance`
   - Example for January 2025:
     ```sql
     INSERT INTO property_monthly_performance (
       property_id, year, month,
       rent_income, maintenance, pool, garden, hoa_payments, property_tax,
       property_market_estimate
     ) VALUES (
       '[property-id]', 2025, 1,
       5750, 250, 200, 150, 200, 0,
       960000
     );
     ```

## Calculation Logic

All calculations are in `lib/calculations/owner-metrics.ts`:

### Operating Summary

- **Gross Income**: Sum of monthly `rent_income`
- **Maintenance**: Sum of monthly `maintenance`
- **Maintenance % of Income**: `maintenance / gross_income * 100`
- **HOA, Pool, Garden**: Sum of monthly pool + garden + hoa
- **Total Expenses**: Sum of monthly `total_expenses`
- **Net Income**: Sum of monthly `net_income`
- **Property Tax**: Sum of monthly `property_tax`
- **Delta to Plan**: `(actual - plan) / plan * 100`

### Home Performance

- **Purchase Price + Repairs**: `home_cost + home_repair_cost` (or `total_cost`)
- **Current Value**: Latest `property_market_estimate` or `current_market_estimate`
- **Appreciation**: `current_value - total_cost`
- **Appreciation %**: `appreciation / total_cost * 100`
- **Months Owned**: Calculated from `purchase_date` to today
- **Monthly Gain**: `appreciation / months_owned`
- **Annualized Gain %**: `appreciation_pct * (12 / months_owned)`

### Investment Performance

- **ROI (Net Income)**: `net_income_ytd / total_cost * 100`
- **ROI Post Property Tax**: `(net_income_ytd - property_tax_ytd) / total_cost * 100`
- **ROI Home Appreciation**: `appreciation / total_cost * 100`
- **ROI Composite**: `(net_income - property_tax + appreciation - closing_costs) / total_cost * 100`

  This represents what you'd get if you sold today after taxes, appreciation, and closing costs.

## Owner Dashboard Features

The Dashboard tab (`/owner`) displays:

### KPI Cards
- YTD Net Income vs Plan (with delta %)
- ROI (Net Income) vs Plan and YE Target
- Home Appreciation %
- Current Market Estimate

### Gauge Charts
- ROI vs Target (semi-circle gauge)
- Maintenance % of Income vs 5% target

### Bar Chart
- Net Income by month

### Monthly Performance Table
Columns: Date, Rent Income, Maintenance, Pool, Garden, HOA, Total Expenses, Net Income, Property Tax, ROI, Market Value

### Operating Summary Table
Shows Actual vs Plan vs YE Target with Delta to Plan for:
- Gross Income
- Maintenance & Maintenance %
- HOA, Pool, Garden
- Total Expenses
- Net Income
- Property Tax

## Asset Performance Narrative

The Asset Performance tab (`/owner/performance`) generates a written narrative based on the metrics:

### Performance Status

Automatically determined as:
- **Green (Good)**: ROI meets or exceeds plan, maintenance < 5% of income
- **Yellow (Fair)**: ROI within 10% of plan OR maintenance 5-7% of income
- **Red (Needs Attention)**: ROI >10% below plan OR maintenance > 7% of income

### Narrative Sections

1. **Investment Performance** - Overall status summary
2. **Operating Income and Expenses** - Income, expenses, ROI vs targets, maintenance %
3. **Property Taxes** - After-tax net income and ROI
4. **Home Value** - Purchase price, appreciation, composite ROI if sold today

Example Output:
```
Investment Performance
Investment performance is green (Good) based on income, maintenance, expenses, and asset appreciation.

Operating Income and Expenses:
Income is $55,775, maintenance is $2,002, and HOA, pool, and other fees are $6,635, creating a net income of $47,138. ROI is 5.86% (plan is 5.76%). The home is expected to yield 7.11% annually. Maintenance costs are 3.59% of income (below the target of <5%).

Property Taxes:
After property taxes of $10,819, net income is $36,318 (4.51% ROI).

Home Value:
The home was purchased for $775,000 plus $30,000 in repairs (total $805,000). It is now valued at $928,000, up $123,000 (15.28%) over 12 months. If sold today for $928,000, expected closing costs of $59,121 would yield a 12.45% return after property taxes and appreciation for the year.
```

## Files Created/Modified

### Database
- `supabase/migrations/20241209_property_financials.sql` - Schema migration

### Types
- `lib/types/financial-metrics.ts` - TypeScript types for all metrics

### Calculations
- `lib/calculations/owner-metrics.ts` - Core calculation logic and narrative generation

### API
- `app/api/owner/financial-metrics/route.ts` - API endpoint to fetch property financial data

### Components
- `app/components/charts/GaugeChart.tsx` - Semi-circle gauge chart component

### Pages
- `app/owner/page.tsx` - Owner Dashboard with KPIs, charts, tables
- `app/owner/performance/page.tsx` - Asset Performance narrative report

### Dependencies
- Added `recharts` for charting library

## Setup Checklist

- [ ] Run database migration in Supabase: `20241209_property_financials.sql`
- [ ] For each property, populate static financial fields (home_cost, repair_cost, etc.)
- [ ] For each property/year, create Plan and YE Target records in `property_annual_targets`
- [ ] For each month, enter actuals in `property_monthly_performance`
- [ ] Test owner dashboard at `/owner`
- [ ] Test performance narrative at `/owner/performance`

## Customization

### Adjusting Thresholds

Edit `lib/calculations/owner-metrics.ts`:

```typescript
// Performance status thresholds (line ~250)
function determinePerformanceStatus(...) {
  // Red conditions
  if (maintenancePct > 7) return 'red';  // Adjust this
  if (actualROI < planROI * 0.9) return 'red';  // 10% below plan

  // Yellow conditions
  if (maintenancePct > 5 && maintenancePct <= 7) return 'yellow';
  ...
}
```

### Modifying Narrative Text

Edit the `generateAssetPerformanceNarrative` function in `owner-metrics.ts` to change how text is formatted.

## Notes

- All currency formatted as USD with no decimals
- Percentages shown to 2 decimal places
- Missing data handled gracefully (shows 0 or "—")
- Calculations update automatically when data changes
- Property selector appears if owner has multiple properties
- Year selector can be added later for historical reports

## Support

For questions or issues, refer to the calculation module comments or contact the development team.

# Excel Formula Audit - "calcs adjusted.xlsx"

## Source of Truth: Excel Spreadsheet Formulas

Based on analysis of `legacy html/calcs adjusted.xlsx`:

### Cost Basis (Cell B27)
```
Formula: =SUM(B24:B26)
Components:
  - B24: Home Cost = $775,000
  - B25: Home Repair Cost = $30,800
  - B26: Closing Costs = $0
  - B27: Total Cost (Cost Basis) = $805,800
```

**✅ RULE: Cost Basis = Home Cost + Home Repair Cost + Closing Costs**

### YTD Totals (Row 17 - "Actual Total")

Monthly data rows: 2-16 (15 months of data)

```
B17 (YTD Rent Income): =SUM(B2:B16) = $55,775
C17 (YTD Maintenance): =SUM(C2:C16) = $2,002.48
D17 (YTD Pool): =SUM(D2:D16) = $630
E17 (YTD Garden): =SUM(E2:E16) = $1,350
F17 (YTD HOA): =SUM(F2:F16) = $4,655
G17 (YTD Total Expenses): =SUM(C17:F17) = $8,637.48
H17 (YTD Net Income): =B17-G17 = $47,137.52
I17 (YTD Property Tax): =SUM(I2:I16) = $0
```

**✅ RULES:**
- **Total Expenses = Maintenance + Pool + Garden + HOA** (Property Tax EXCLUDED)
- **Net Income = Rent Income - Total Expenses** (Property Tax EXCLUDED)
- Property Tax is tracked separately

### Monthly Calculations (Rows 2-16)

Each month row uses:
```
G (Total Expenses) = F + D + C + E (HOA + Pool + Maintenance + Garden)
H (Net Income) = B - G (Rent Income - Total Expenses)
I (Property Tax) = separate value
```

**✅ RULE: Every month, total_expenses EXCLUDES property_tax**

### Deposit / Last Month Rent Handling (Row 18 - "Plan")

```
B18 Formula:
=SUMIFS(B:B,A:A,"<="&EOMONTH(TODAY(),0),A:A,">="&DATE(YEAR(TODAY()),1,1))
+ IF(LOWER(B36)="yes",B28,0)

Where:
  - B36 = "yes" (Last Month's rent paid upfront?)
  - B28 = $5,750 (Rent)
  - B35 = $5,750 (Deposit)
```

**✅ RULE: If last month's rent was paid upfront, add deposit to YTD rent income**

In the example:
- Monthly rent payments from actual rows: $50,025
- Deposit/last month rent: $5,750
- **Total YTD Rent Income: $55,775** ✓

### ROI Calculations (NOT FOUND IN ROWS 1-50)

Need to check further rows for ROI formulas. Based on standard practice and the data available:

**Expected formulas:**
- Pre-tax ROI = (Net Income / Cost Basis) × 100
- Post-tax ROI = ((Net Income - Property Tax) / Cost Basis) × 100

Using the data:
- Cost Basis: $805,800
- YTD Net Income: $47,137.52
- YTD Property Tax: $0

**Expected Pre-tax ROI:** (47,137.52 / 805,800) × 100 = **5.85%**
**Expected Post-tax ROI:** ((47,137.52 - 0) / 805,800) × 100 = **5.85%** (same since tax is $0)

## Current Implementation Audit

### ✅ MATCHES: lib/calculations/canonical-metrics.ts

Checking current implementation:

1. **Cost Basis** ✅
   ```typescript
   const cost_basis = property.total_cost || 0;
   ```
   ⚠️ ASSUMPTION: `property.total_cost` includes closing_costs
   ⚠️ VERIFY: Does `total_cost` = `home_cost + home_repair_cost + closing_costs`?

2. **YTD Totals** ✅
   ```typescript
   const ytd = monthly.reduce((acc, month) => ({
     rent_income: acc.rent_income + (month.rent_income || 0),
     maintenance: acc.maintenance + (month.maintenance || 0),
     pool: acc.pool + (month.pool || 0),
     garden: acc.garden + (month.garden || 0),
     hoa_payments: acc.hoa_payments + (month.hoa_payments || 0),
     property_tax: acc.property_tax + (month.property_tax || 0),
     total_expenses: acc.total_expenses + (month.total_expenses || 0),
     net_income: acc.net_income + (month.net_income || 0),
   }), {...});
   ```
   ✅ Correctly sums monthly values

3. **Total Expenses** ⚠️ NEEDS VERIFICATION
   ```typescript
   // Current: Sums month.total_expenses from DB
   // Excel: Maintenance + Pool + Garden + HOA (excludes property_tax)
   ```
   ⚠️ VERIFY: Does DB `total_expenses` column already exclude property_tax?

4. **Net Income** ⚠️ NEEDS VERIFICATION
   ```typescript
   // Current: Sums month.net_income from DB
   // Excel: Rent Income - Total Expenses (excludes property_tax)
   ```
   ⚠️ VERIFY: Does DB `net_income` column already exclude property_tax?

5. **ROI Pre-tax** ✅
   ```typescript
   const roi_pre_tax = cost_basis > 0 ? (ytd.net_income / cost_basis) * 100 : 0;
   ```
   ✅ Matches Excel formula

6. **ROI Post-tax** ✅
   ```typescript
   const roi_post_tax = cost_basis > 0
     ? ((ytd.net_income - ytd.property_tax) / cost_basis) * 100
     : 0;
   ```
   ✅ Matches Excel formula

7. **Deposit Handling** ❌ MISSING
   - Excel includes deposit in YTD rent if "last month paid upfront"
   - Current implementation does NOT handle this
   - Need to check if deposit is recorded as a monthly rent entry in DB

## Critical Issues Found

### ❌ ISSUE 1: Deposit/Last Month Rent Not Handled

**Excel:** YTD Rent = $55,775 (includes $5,750 deposit)
**Current DB:** Need to verify if deposit is stored as a monthly entry

**Impact:** YTD rent income may be understated by deposit amount

**Fix needed:**
- Check if `properties` table has `deposit` and `last_month_rent_collected` fields
- If yes, add deposit to YTD rent income when calculating
- If no, ensure deposit is recorded as a monthly rent entry

### ⚠️ ISSUE 2: Cost Basis Definition Unclear

**Excel:** Cost Basis = Home Cost + Repair Cost + Closing Costs
**Current:** Uses `property.total_cost`

**Verification needed:**
- Check if `properties.total_cost` includes all three components
- Check database schema and seed data

### ⚠️ ISSUE 3: DB Column Formulas Unknown

**Need to verify DB columns match Excel:**
- Does `property_monthly_performance.total_expenses` EXCLUDE property_tax?
- Does `property_monthly_performance.net_income` EXCLUDE property_tax?
- How is `total_expenses` calculated in DB vs Excel?

## Action Items

1. ✅ Verify `properties.total_cost` includes closing_costs
2. ✅ Verify DB `total_expenses` excludes property_tax
3. ✅ Verify DB `net_income` excludes property_tax
4. ❌ Handle deposit/last month rent in YTD calculations
5. ✅ Add test case matching Excel example (Buena Ventura)
6. ✅ Document exact formula mappings

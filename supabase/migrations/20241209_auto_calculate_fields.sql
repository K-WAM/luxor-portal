-- Make total_cost auto-calculated (drop existing column if needed and recreate as generated)
-- NOTE: This will drop existing total_cost data! Run only if you haven't entered data yet.
ALTER TABLE properties DROP COLUMN IF EXISTS total_cost;
ALTER TABLE properties ADD COLUMN total_cost DECIMAL(12,2) GENERATED ALWAYS AS (
  COALESCE(home_cost, 0) + COALESCE(home_repair_cost, 0)
) STORED;

-- Add generated columns to property_annual_targets for auto-calculations
-- These will be calculated from the input fields

-- For YE Target: rent_income is entered, total_expenses and net_income are calculated
ALTER TABLE property_annual_targets DROP COLUMN IF EXISTS total_expenses;
ALTER TABLE property_annual_targets ADD COLUMN total_expenses DECIMAL(12,2) GENERATED ALWAYS AS (
  COALESCE(maintenance, 0) +
  COALESCE(pool, 0) +
  COALESCE(garden, 0) +
  COALESCE(hoa, 0)
) STORED;

ALTER TABLE property_annual_targets DROP COLUMN IF EXISTS net_income;
ALTER TABLE property_annual_targets ADD COLUMN net_income DECIMAL(12,2) GENERATED ALWAYS AS (
  COALESCE(rent_income, 0) - (
    COALESCE(maintenance, 0) +
    COALESCE(pool, 0) +
    COALESCE(garden, 0) +
    COALESCE(hoa, 0)
  )
) STORED;

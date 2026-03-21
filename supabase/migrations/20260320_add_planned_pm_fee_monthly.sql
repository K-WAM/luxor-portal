-- Add planned_pm_fee_monthly to properties table
-- Used to calculate planned PM Fee YTD and annual budget (same pattern as planned_pool_cost, planned_garden_cost)
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS planned_pm_fee_monthly numeric DEFAULT NULL;

-- Rollback: ALTER TABLE properties DROP COLUMN planned_pm_fee_monthly;

-- Add financial fields to properties table
ALTER TABLE properties ADD COLUMN IF NOT EXISTS home_cost DECIMAL(12,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS home_repair_cost DECIMAL(12,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS closing_costs DECIMAL(12,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS total_cost DECIMAL(12,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS current_market_estimate DECIMAL(12,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS target_monthly_rent DECIMAL(10,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS planned_garden_cost DECIMAL(10,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS planned_pool_cost DECIMAL(10,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS planned_hoa_cost DECIMAL(10,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS purchase_date DATE;

-- Create property annual targets table
CREATE TABLE IF NOT EXISTS property_annual_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  target_type TEXT NOT NULL, -- 'plan' or 'ye_target'

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
  roi_percentage DECIMAL(5,2), -- e.g. 5.76 for 5.76%
  maintenance_percentage_target DECIMAL(5,2), -- e.g. 5.00 for 5%

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(property_id, year, target_type)
);

-- Create monthly performance table
CREATE TABLE IF NOT EXISTS property_monthly_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),

  -- Income
  rent_income DECIMAL(10,2) DEFAULT 0,
  rent_paid BOOLEAN DEFAULT false,

  -- Expenses
  maintenance DECIMAL(10,2) DEFAULT 0,
  pool DECIMAL(10,2) DEFAULT 0,
  garden DECIMAL(10,2) DEFAULT 0,
  hoa_payments DECIMAL(10,2) DEFAULT 0,
  property_tax DECIMAL(10,2) DEFAULT 0,

  -- Market value for this month (optional override)
  property_market_estimate DECIMAL(12,2),

  -- Computed fields (can be calculated or stored)
  total_expenses DECIMAL(10,2) GENERATED ALWAYS AS (
    COALESCE(maintenance, 0) +
    COALESCE(pool, 0) +
    COALESCE(garden, 0) +
    COALESCE(hoa_payments, 0)
  ) STORED,

  net_income DECIMAL(10,2) GENERATED ALWAYS AS (
    COALESCE(rent_income, 0) - (
      COALESCE(maintenance, 0) +
      COALESCE(pool, 0) +
      COALESCE(garden, 0) +
      COALESCE(hoa_payments, 0)
    )
  ) STORED,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(property_id, year, month)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_property_annual_targets_property_year
  ON property_annual_targets(property_id, year);
CREATE INDEX IF NOT EXISTS idx_property_monthly_performance_property_year
  ON property_monthly_performance(property_id, year);

-- Enable Row Level Security
ALTER TABLE property_annual_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_monthly_performance ENABLE ROW LEVEL SECURITY;

-- RLS Policies for property_annual_targets
DROP POLICY IF EXISTS "Admins can manage all property annual targets" ON property_annual_targets;
CREATE POLICY "Admins can manage all property annual targets" ON property_annual_targets
  FOR ALL
  USING (auth.jwt()->>'role' = 'admin');

DROP POLICY IF EXISTS "Owners can view their property annual targets" ON property_annual_targets;
CREATE POLICY "Owners can view their property annual targets" ON property_annual_targets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_properties up
      WHERE up.property_id = property_annual_targets.property_id
      AND up.user_id = auth.uid()
      AND up.role = 'owner'
    )
  );

-- RLS Policies for property_monthly_performance
DROP POLICY IF EXISTS "Admins can manage all property monthly performance" ON property_monthly_performance;
CREATE POLICY "Admins can manage all property monthly performance" ON property_monthly_performance
  FOR ALL
  USING (auth.jwt()->>'role' = 'admin');

DROP POLICY IF EXISTS "Owners can view their property monthly performance" ON property_monthly_performance;
CREATE POLICY "Owners can view their property monthly performance" ON property_monthly_performance
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_properties up
      WHERE up.property_id = property_monthly_performance.property_id
      AND up.user_id = auth.uid()
      AND up.role = 'owner'
    )
  );

-- Helper function to calculate ROI for a month
CREATE OR REPLACE FUNCTION calculate_monthly_roi(
  p_net_income DECIMAL,
  p_total_cost DECIMAL
)
RETURNS DECIMAL AS $$
BEGIN
  IF p_total_cost IS NULL OR p_total_cost = 0 THEN
    RETURN 0;
  END IF;
  RETURN (p_net_income / p_total_cost) * 100;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper function to get property performance metrics
CREATE OR REPLACE FUNCTION get_property_performance_metrics(
  p_property_id UUID,
  p_year INTEGER
)
RETURNS TABLE (
  month INTEGER,
  month_name TEXT,
  rent_income DECIMAL,
  maintenance DECIMAL,
  pool DECIMAL,
  garden DECIMAL,
  hoa_payments DECIMAL,
  total_expenses DECIMAL,
  net_income DECIMAL,
  property_tax DECIMAL,
  roi_percentage DECIMAL,
  property_market_estimate DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pmp.month,
    to_char(make_date(p_year, pmp.month, 1), 'Mon-YY') as month_name,
    pmp.rent_income,
    pmp.maintenance,
    pmp.pool,
    pmp.garden,
    pmp.hoa_payments,
    pmp.total_expenses,
    pmp.net_income,
    pmp.property_tax,
    calculate_monthly_roi(pmp.net_income, p.total_cost) as roi_percentage,
    COALESCE(pmp.property_market_estimate, p.current_market_estimate) as property_market_estimate
  FROM property_monthly_performance pmp
  JOIN properties p ON p.id = pmp.property_id
  WHERE pmp.property_id = p_property_id
    AND pmp.year = p_year
  ORDER BY pmp.month;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add ROI target percentage and financials updated timestamp to properties table
ALTER TABLE properties ADD COLUMN IF NOT EXISTS roi_target_percentage DECIMAL(5,2) DEFAULT 7.5;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS financials_updated_at TIMESTAMPTZ;

-- Add updated_at timestamp to property_monthly_performance if it doesn't already have it
-- (It should already exist from the previous migration, but this ensures it's there)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property_monthly_performance'
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE property_monthly_performance ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END$$;

-- Create or replace trigger to auto-update updated_at on property_monthly_performance
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_property_monthly_performance_updated_at ON property_monthly_performance;
CREATE TRIGGER update_property_monthly_performance_updated_at
    BEFORE UPDATE ON property_monthly_performance
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON COLUMN properties.roi_target_percentage IS 'Target ROI percentage for the property (e.g., 7.5 for 7.5%)';
COMMENT ON COLUMN properties.financials_updated_at IS 'Timestamp when property financial data was last updated';

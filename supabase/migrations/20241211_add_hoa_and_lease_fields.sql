-- Add HOA and lease fields to properties table
-- These fields support dual HOA costs with frequency options and lease date tracking

-- Add second HOA cost field
ALTER TABLE properties ADD COLUMN IF NOT EXISTS planned_hoa_cost_2 DECIMAL(10,2) DEFAULT 0;

-- Add HOA frequency fields (monthly or quarterly)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS hoa_frequency TEXT DEFAULT 'monthly' CHECK (hoa_frequency IN ('monthly', 'quarterly'));
ALTER TABLE properties ADD COLUMN IF NOT EXISTS hoa_frequency_2 TEXT DEFAULT 'monthly' CHECK (hoa_frequency_2 IN ('monthly', 'quarterly'));

-- Add lease start and end date fields
ALTER TABLE properties ADD COLUMN IF NOT EXISTS lease_start DATE;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS lease_end DATE;

-- Add comments for documentation
COMMENT ON COLUMN properties.planned_hoa_cost_2 IS 'Second HOA cost (if property has multiple HOA fees)';
COMMENT ON COLUMN properties.hoa_frequency IS 'Frequency of first HOA payment (monthly or quarterly)';
COMMENT ON COLUMN properties.hoa_frequency_2 IS 'Frequency of second HOA payment (monthly or quarterly)';
COMMENT ON COLUMN properties.lease_start IS 'Date when the lease begins';
COMMENT ON COLUMN properties.lease_end IS 'Date when the lease expires';

-- Create tenant invites table
CREATE TABLE IF NOT EXISTS tenant_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'tenant', -- tenant, owner
  ownership_percentage DECIMAL(5,2), -- For owners: percentage of ownership (0.00-100.00)
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, expired
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(email, property_id)
);

-- Create user_properties junction table for tenant-property associations
CREATE TABLE IF NOT EXISTS user_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'tenant', -- tenant, owner
  ownership_percentage DECIMAL(5,2), -- For owners: percentage of ownership (0.00-100.00)
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, property_id)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tenant_invites_email ON tenant_invites(email);
CREATE INDEX IF NOT EXISTS idx_tenant_invites_token ON tenant_invites(token);
CREATE INDEX IF NOT EXISTS idx_tenant_invites_status ON tenant_invites(status);
CREATE INDEX IF NOT EXISTS idx_user_properties_user_id ON user_properties(user_id);
CREATE INDEX IF NOT EXISTS idx_user_properties_property_id ON user_properties(property_id);

-- Enable Row Level Security
ALTER TABLE tenant_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_properties ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenant_invites
-- Admins can do everything
CREATE POLICY "Admins can manage all invites" ON tenant_invites
  FOR ALL
  USING (auth.jwt()->>'role' = 'admin');

-- Users can view their own invites by email
CREATE POLICY "Users can view invites for their email" ON tenant_invites
  FOR SELECT
  USING (email = auth.jwt()->>'email');

-- RLS Policies for user_properties
-- Admins can do everything
CREATE POLICY "Admins can manage all user properties" ON user_properties
  FOR ALL
  USING (auth.jwt()->>'role' = 'admin');

-- Users can view their own property associations
CREATE POLICY "Users can view their own properties" ON user_properties
  FOR SELECT
  USING (user_id = auth.uid());

-- Add a helper function to get user's properties
CREATE OR REPLACE FUNCTION get_user_properties(user_uuid UUID)
RETURNS TABLE (
  property_id UUID,
  address TEXT,
  lease_start DATE,
  lease_end DATE,
  role TEXT,
  ownership_percentage DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.address,
    p.lease_start,
    p.lease_end,
    up.role,
    up.ownership_percentage
  FROM user_properties up
  JOIN properties p ON p.id = up.property_id
  WHERE up.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

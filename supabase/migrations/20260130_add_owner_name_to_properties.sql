-- Add owner_name to properties (additive, reversible)

ALTER TABLE IF EXISTS properties
  ADD COLUMN IF NOT EXISTS owner_name text;

-- Rollback:
-- ALTER TABLE IF EXISTS properties DROP COLUMN IF EXISTS owner_name;

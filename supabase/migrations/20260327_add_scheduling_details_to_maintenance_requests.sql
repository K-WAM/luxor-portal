-- Add scheduling details payload to maintenance requests
-- Rollback: ALTER TABLE maintenance_requests DROP COLUMN IF EXISTS scheduling_details;

ALTER TABLE maintenance_requests
ADD COLUMN IF NOT EXISTS scheduling_details JSONB;


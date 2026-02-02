-- Add attachments column for maintenance requests
-- Rollback: ALTER TABLE maintenance_requests DROP COLUMN attachments;

ALTER TABLE maintenance_requests
ADD COLUMN IF NOT EXISTS attachments JSONB;

-- Append-only activity log for maintenance request auditability
-- Each entry: { at: ISO timestamp, type: 'created'|'comment'|'status'|'email'|'note', note: text, author: text }
-- Rollback: ALTER TABLE maintenance_requests DROP COLUMN activity_log;
ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS activity_log JSONB NOT NULL DEFAULT '[]'::jsonb;

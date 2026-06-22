-- Add closing note and cost accountability to maintenance requests
-- Rollback: ALTER TABLE maintenance_requests DROP COLUMN closing_note, DROP COLUMN cost_accountability;
ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS closing_note TEXT,
  ADD COLUMN IF NOT EXISTS cost_accountability TEXT; -- values: 'owner' | 'tenant' | 'property_manager'

-- Create storage bucket for maintenance attachments (receipts, vendor reports)
INSERT INTO storage.buckets (id, name, public)
VALUES ('maintenance-attachments', 'maintenance-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to maintenance-attachments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Auth users can upload maintenance attachments'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Auth users can upload maintenance attachments"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'maintenance-attachments')
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Maintenance attachments are publicly readable'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Maintenance attachments are publicly readable"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'maintenance-attachments')
    $p$;
  END IF;
END;
$$;

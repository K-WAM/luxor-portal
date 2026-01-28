-- Remove unique constraint on (property_id, owner_id, month, year)
-- This allows multiple bills for the same property/owner/month/year
-- Bills are now uniquely identified only by their primary key (id)

DROP INDEX IF EXISTS billing_invoices_property_month_year_idx;

-- Add a non-unique index for query performance (optional, for filtering by month/year)
CREATE INDEX IF NOT EXISTS billing_invoices_property_month_year_nonunique_idx
  ON billing_invoices(property_id, owner_id, month, year);

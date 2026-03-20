# Database Migration Required

## Issue
The application code expects certain database columns that don't exist yet:
- `properties.roi_target_percentage`
- `properties.financials_updated_at`

## Solution
A migration file has been created at:
```
supabase/migrations/20241211_add_roi_and_timestamps.sql
```

## How to Apply

### Option 1: Using Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the file `supabase/migrations/20241211_add_roi_and_timestamps.sql`
4. Copy the entire SQL content
5. Paste it into the SQL Editor
6. Click **Run** to execute

### Option 2: Using Supabase CLI
If you have Supabase CLI installed:
```bash
cd luxor-portal
supabase db push
```

### Option 3: Manual SQL Execution
Connect to your database and run:
```sql
-- Add ROI target percentage and financials updated timestamp to properties table
ALTER TABLE properties ADD COLUMN IF NOT EXISTS roi_target_percentage DECIMAL(5,2) DEFAULT 7.5;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS financials_updated_at TIMESTAMPTZ;
```

## After Migration
Once the migration is applied:
1. Refresh the application
2. The "View Financials" links will work correctly
3. Saving property financials will succeed
4. All financial features will function as expected

## Current Errors Being Fixed
- ❌ "column properties.roi_target_percentage does not exist"
- ❌ "Could not find the 'financials_updated_at' column"
- ❌ "Failed to update property financials"

After migration:
- ✅ All database columns will exist
- ✅ Financial data can be saved and retrieved
- ✅ ROI calculations will work properly

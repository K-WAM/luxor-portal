const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function executeMigration() {
  console.log('🔄 Executing HOA and Lease fields migration...\n');

  const migrationPath = path.join(__dirname, 'supabase', 'migrations', '20241211_add_hoa_and_lease_fields.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Migration SQL:');
  console.log('─'.repeat(60));
  console.log(migrationSQL);
  console.log('─'.repeat(60) + '\n');

  console.log('📋 To execute this migration:');
  console.log('\n1. Open Supabase SQL Editor:');
  console.log('   https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new');
  console.log('\n2. Copy and paste the SQL above');
  console.log('\n3. Click "Run" to execute the migration');
  console.log('\n✅ This will add the following columns to the properties table:');
  console.log('   - planned_hoa_cost_2 (DECIMAL)');
  console.log('   - hoa_frequency (TEXT)');
  console.log('   - hoa_frequency_2 (TEXT)');
  console.log('   - lease_start (DATE)');
  console.log('   - lease_end (DATE)');
  console.log('\n');
}

executeMigration().catch(console.error);

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

async function runMigration() {
  console.log('🔄 Running database migration...\n');

  // Read the migration file
  const migrationPath = path.join(__dirname, 'supabase', 'migrations', '20241211_add_roi_and_timestamps.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Migration file loaded:');
  console.log('   ', migrationPath);
  console.log('\n📋 Migration SQL to execute:');
  console.log('─'.repeat(60));
  console.log(migrationSQL);
  console.log('─'.repeat(60));
  console.log('\n🚀 Executing migration via Supabase SQL API...\n');

  try {
    // Use Supabase REST API to execute raw SQL
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({ query: migrationSQL })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('⚠️  API execution not available. Using manual approach.\n');
      console.log('━'.repeat(60));
      console.log('📋 MANUAL MIGRATION REQUIRED');
      console.log('━'.repeat(60));
      console.log('\n✅ Please run this SQL in Supabase Dashboard:\n');
      console.log('1. Go to: https://supabase.com/dashboard/project/kizgbvpikagittiaxran/sql/new');
      console.log('2. Copy the SQL from above (between the dashed lines)');
      console.log('3. Paste into SQL Editor');
      console.log('4. Click "Run"\n');
      console.log('━'.repeat(60));
      return;
    }

    console.log('✅ Migration executed successfully!\n');
    console.log('━'.repeat(60));
    console.log('🎉 Database schema updated');
    console.log('━'.repeat(60));
    console.log('\nAdded columns:');
    console.log('  • properties.roi_target_percentage (DECIMAL)');
    console.log('  • properties.financials_updated_at (TIMESTAMPTZ)');
    console.log('  • property_monthly_performance.updated_at (TIMESTAMPTZ)');
    console.log('\n✅ Your financials system should now work correctly!');
    console.log('\n💡 Next: Restart your dev server if needed.\n');

  } catch (error) {
    console.log('\n⚠️  Automatic execution failed. Using manual approach.\n');
    console.log('━'.repeat(60));
    console.log('📋 MANUAL MIGRATION REQUIRED');
    console.log('━'.repeat(60));
    console.log('\n✅ Please run this SQL in Supabase Dashboard:\n');
    console.log('1. Go to: https://supabase.com/dashboard/project/kizgbvpikagittiaxran/sql/new');
    console.log('2. Copy and paste this SQL:\n');
    console.log('─'.repeat(60));
    console.log(migrationSQL);
    console.log('─'.repeat(60));
    console.log('\n3. Click "Run" in the SQL Editor\n');
    console.log('━'.repeat(60));
  }
}

runMigration().catch(console.error);

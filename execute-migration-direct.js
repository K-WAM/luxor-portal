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
  console.log('🔄 Executing database migration...\n');

  const migrationPath = path.join(__dirname, 'supabase', 'migrations', '20241211_add_roi_and_timestamps.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Migration SQL:');
  console.log('─'.repeat(60));
  console.log(migrationSQL);
  console.log('─'.repeat(60) + '\n');

  // Execute each statement separately
  const statements = [
    "ALTER TABLE properties ADD COLUMN IF NOT EXISTS roi_target_percentage DECIMAL(5,2) DEFAULT 7.5;",
    "ALTER TABLE properties ADD COLUMN IF NOT EXISTS financials_updated_at TIMESTAMPTZ;",
  ];

  let executed = 0;

  for (const stmt of statements) {
    try {
      console.log(`\n🚀 Executing: ${stmt.substring(0, 60)}...`);

      // Use raw SQL execution through the database
      const { data, error } = await supabase.rpc('exec', { sql: stmt });

      if (error) {
        console.log(`⚠️  Error: ${error.message}`);
        console.log('   (This might be expected if column already exists)');
      } else {
        console.log('✅ Success!');
        executed++;
      }
    } catch (err) {
      console.log(`⚠️  Error: ${err.message}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`\n📊 Migration Summary:`);
  console.log(`   Executed: ${executed}/${statements.length} statements`);
  console.log('\n' + '═'.repeat(60));

  console.log('\n📋 RECOMMENDED: Complete the migration manually in Supabase Dashboard:');
  console.log('\n1. Open: https://supabase.com/dashboard/project/kizgbvpikagittiaxran/sql/new');
  console.log('\n2. Paste this SQL and click "Run":\n');
  console.log('─'.repeat(60));
  console.log(migrationSQL);
  console.log('─'.repeat(60));
  console.log('\n✅ This will ensure all columns, triggers, and comments are properly created.\n');
}

executeMigration().catch(console.error);

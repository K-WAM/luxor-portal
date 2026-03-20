/**
 * Verification script to ensure Owner Dashboard metrics match Admin Monthly Performance
 *
 * This script:
 * 1. Calls the Owner API to get canonical metrics
 * 2. Calls the Admin API for each month to get monthly totals
 * 3. Manually sums Admin monthly data to calculate YTD totals
 * 4. Compares Owner vs Admin to ensure they match
 */

const propertyId = '59fa3670-8b7d-47a0-931f-53ca1525d100'; // Buena Ventura
const year = 2025;
const baseUrl = 'http://localhost:3005';

async function fetchOwnerMetrics() {
  const url = `${baseUrl}/api/owner/financial-metrics?propertyId=${propertyId}&year=${year}`;
  console.log('\n📊 Fetching Owner metrics...');
  console.log(`URL: ${url}\n`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Owner API failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

async function fetchAdminMonthlyData() {
  console.log('\n📅 Fetching Admin monthly data...\n');

  const monthlyData = [];

  for (let month = 1; month <= 12; month++) {
    const url = `${baseUrl}/api/admin/financials/monthly?propertyId=${propertyId}&year=${year}&month=${month}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.log(`  Month ${month}: API returned ${response.status}`);
        continue;
      }

      const data = await response.json();
      monthlyData.push(data);

      console.log(`  Month ${month}: ✓ (rent: ${data.rent_income || 0}, expenses: ${data.total_expenses || 0})`);
    } catch (error) {
      console.log(`  Month ${month}: Error - ${error.message}`);
    }
  }

  return monthlyData;
}

function calculateAdminYTD(monthlyData) {
  console.log('\n🧮 Calculating Admin YTD totals from monthly data...\n');

  const ytd = monthlyData.reduce((acc, month) => ({
    rent_income: acc.rent_income + (parseFloat(month.rent_income) || 0),
    maintenance: acc.maintenance + (parseFloat(month.maintenance) || 0),
    pool: acc.pool + (parseFloat(month.pool) || 0),
    garden: acc.garden + (parseFloat(month.garden) || 0),
    hoa_payments: acc.hoa_payments + (parseFloat(month.hoa_payments) || 0),
    property_tax: acc.property_tax + (parseFloat(month.property_tax) || 0),
    total_expenses: acc.total_expenses + (parseFloat(month.total_expenses) || 0),
    net_income: acc.net_income + (parseFloat(month.net_income) || 0),
  }), {
    rent_income: 0,
    maintenance: 0,
    pool: 0,
    garden: 0,
    hoa_payments: 0,
    property_tax: 0,
    total_expenses: 0,
    net_income: 0,
  });

  console.log('  Admin YTD:', ytd);

  return ytd;
}

function compareMetrics(ownerData, adminYTD) {
  console.log('\n🔍 COMPARISON: Owner API vs Admin Monthly Sum\n');
  console.log('=' .repeat(80));

  const ownerYTD = ownerData.metrics.ytd;
  const fields = [
    { key: 'rent_income', label: 'YTD Rent Income' },
    { key: 'maintenance', label: 'YTD Maintenance' },
    { key: 'pool', label: 'YTD Pool' },
    { key: 'garden', label: 'YTD Garden' },
    { key: 'hoa_payments', label: 'YTD HOA Payments' },
    { key: 'property_tax', label: 'YTD Property Tax' },
    { key: 'total_expenses', label: 'YTD Total Expenses' },
    { key: 'net_income', label: 'YTD Net Income' },
  ];

  let allMatch = true;

  fields.forEach(({ key, label }) => {
    const ownerValue = ownerYTD[key] || 0;
    const adminValue = adminYTD[key] || 0;
    const match = Math.abs(ownerValue - adminValue) < 0.01; // Allow for floating point precision

    const status = match ? '✅' : '❌';
    console.log(`${status} ${label.padEnd(25)} | Owner: ${ownerValue.toFixed(2).padStart(12)} | Admin: ${adminValue.toFixed(2).padStart(12)}`);

    if (!match) {
      allMatch = false;
      console.log(`   ⚠️  MISMATCH: Difference = ${(ownerValue - adminValue).toFixed(2)}`);
    }
  });

  console.log('=' .repeat(80));

  // Check ROI calculation
  console.log('\n📈 ROI VERIFICATION\n');
  console.log('=' .repeat(80));

  const costBasis = ownerData.metrics.cost_basis;
  const ownerROIPreTax = ownerData.metrics.roi_pre_tax;
  const ownerROIPostTax = ownerData.metrics.roi_post_tax;

  // Calculate expected ROI from admin data
  const expectedROIPreTax = (adminYTD.net_income / costBasis) * 100;
  const expectedROIPostTax = ((adminYTD.net_income - adminYTD.property_tax) / costBasis) * 100;

  const roiPreTaxMatch = Math.abs(ownerROIPreTax - expectedROIPreTax) < 0.01;
  const roiPostTaxMatch = Math.abs(ownerROIPostTax - expectedROIPostTax) < 0.01;

  console.log(`Cost Basis: $${costBasis.toFixed(2)}`);
  console.log(`\n${roiPreTaxMatch ? '✅' : '❌'} Pre-Tax ROI  | Owner: ${ownerROIPreTax.toFixed(4)}% | Expected: ${expectedROIPreTax.toFixed(4)}%`);
  console.log(`${roiPostTaxMatch ? '✅' : '❌'} Post-Tax ROI | Owner: ${ownerROIPostTax.toFixed(4)}% | Expected: ${expectedROIPostTax.toFixed(4)}%`);

  if (!roiPreTaxMatch) {
    console.log(`   ⚠️  MISMATCH: Difference = ${(ownerROIPreTax - expectedROIPreTax).toFixed(4)}%`);
    allMatch = false;
  }

  if (!roiPostTaxMatch) {
    console.log(`   ⚠️  MISMATCH: Difference = ${(ownerROIPostTax - expectedROIPostTax).toFixed(4)}%`);
    allMatch = false;
  }

  console.log('=' .repeat(80));

  // Final result
  console.log('\n' + '='.repeat(80));
  if (allMatch) {
    console.log('✅ SUCCESS: All Owner metrics match Admin monthly totals!');
  } else {
    console.log('❌ FAILURE: Some metrics do not match. Review differences above.');
  }
  console.log('='.repeat(80) + '\n');

  return allMatch;
}

async function main() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('OWNER vs ADMIN VERIFICATION TEST');
    console.log('Property: Buena Ventura');
    console.log(`Property ID: ${propertyId}`);
    console.log(`Year: ${year}`);
    console.log('='.repeat(80));

    // Fetch data
    const ownerData = await fetchOwnerMetrics();
    const adminMonthlyData = await fetchAdminMonthlyData();

    // Calculate admin YTD
    const adminYTD = calculateAdminYTD(adminMonthlyData);

    // Compare
    const success = compareMetrics(ownerData, adminYTD);

    process.exit(success ? 0 : 1);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

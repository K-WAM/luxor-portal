/**
 * Extract detailed information about key calculations from Excel
 */

const XLSX = require('xlsx');
const path = require('path');

const excelPath = path.join(__dirname, 'legacy html', 'calcs adjusted.xlsx');
const workbook = XLSX.readFile(excelPath, { cellFormula: true });
const sheet = workbook.Sheets[workbook.SheetNames[0]];

function getCell(addr) {
  const cell = sheet[addr];
  if (!cell) return null;
  return {
    value: cell.v,
    formula: cell.f || null,
    formatted: cell.w || null
  };
}

console.log('='.repeat(80));
console.log('EXCEL SPREADSHEET FORMULA ANALYSIS');
console.log('='.repeat(80));

console.log('\n📌 COST BASIS CALCULATION\n');
console.log('Home Cost (B24):', getCell('B24'));
console.log('Home Repair Cost (B25):', getCell('B25'));
console.log('Closing Costs (B26):', getCell('B26'));
console.log('Total Cost / Cost Basis (B27):', getCell('B27'));
console.log('\n➡️  Formula: Cost Basis = Home Cost + Home Repair Cost + Closing Costs');
console.log('➡️  In this example: 775,000 + 30,800 + 0 = 805,800\n');

console.log('\n📌 YTD TOTALS (Row 17 - Actual Total)\n');
console.log('YTD Rent Income (B17):', getCell('B17'));
console.log('YTD Maintenance (C17):', getCell('C17'));
console.log('YTD Pool (D17):', getCell('D17'));
console.log('YTD Garden (E17):', getCell('E17'));
console.log('YTD HOA (F17):', getCell('F17'));
console.log('YTD Total Expenses (G17):', getCell('G17'));
console.log('YTD Net Income (H17):', getCell('H17'));
console.log('YTD Property Tax (I17):', getCell('I17'));

console.log('\n➡️  Total Expenses Formula (G17):', getCell('G17').formula);
console.log('➡️  This means: Total Expenses = Maintenance + Pool + Garden + HOA');
console.log('➡️  Property Tax is EXCLUDED from Total Expenses');

console.log('\n➡️  Net Income Formula (H17):', getCell('H17')?.formula || 'Check cell H17');

// Check cells around H17 to find net income
console.log('\nChecking cells in row 17 for Net Income:');
for (let col of ['G', 'H', 'I', 'J', 'K']) {
  const addr = col + '17';
  const cell = getCell(addr);
  if (cell) {
    console.log(`  ${addr}:`, cell);
  }
}

console.log('\n📌 DEPOSIT / LAST MONTH RENT HANDLING\n');
console.log('Deposit (B35):', getCell('B35'));
console.log('Last Month Rent Paid Upfront? (B36):', getCell('B36'));
console.log('Rent (B28):', getCell('B28'));

console.log('\n➡️  Row 18 (Plan) Rent Income Formula (B18):');
console.log('   ', getCell('B18').formula);
console.log('\n➡️  This formula includes deposit/last month rent in YTD if B36="yes"');
console.log('➡️  Formula breakdown:');
console.log('     SUMIFS(B:B, date range) + IF(B36="yes", B28, 0)');
console.log('     = Sum of monthly rent + (deposit if last month paid upfront)\n');

console.log('\n📌 ROI CALCULATIONS\n');

// Find ROI cells
console.log('Scanning for ROI formulas...\n');

const cellAddresses = Object.keys(sheet).filter(k => !k.startsWith('!'));
cellAddresses.forEach(addr => {
  const cell = sheet[addr];
  if (cell.t === 's' && cell.v) {
    const value = cell.v.toLowerCase();
    if (value.includes('roi') || value.includes('return')) {
      console.log(`Label at ${addr}: "${cell.v}"`);

      // Check adjacent cells for formulas
      const colLetter = addr.match(/[A-Z]+/)[0];
      const rowNum = addr.match(/\d+/)[0];

      for (let offset = 1; offset <= 3; offset++) {
        const nextCol = String.fromCharCode(colLetter.charCodeAt(0) + offset);
        const dataCell = nextCol + rowNum;
        const data = getCell(dataCell);
        if (data) {
          console.log(`  ${dataCell}:`, data);
        }
      }
      console.log('');
    }
  }
});

console.log('\n📌 COMPLETE DATA STRUCTURE\n');
console.log('Printing all cells with values (first 50 rows):\n');

for (let row = 1; row <= 50; row++) {
  let hasData = false;
  let rowStr = `Row ${row}: `;

  for (let colCode = 65; colCode <= 76; colCode++) { // A to L
    const col = String.fromCharCode(colCode);
    const addr = col + row;
    const cell = getCell(addr);

    if (cell && cell.value !== undefined) {
      hasData = true;
      let display = '';
      if (cell.formula) {
        display = `${col}=${cell.formula}`;
      } else {
        display = `${col}:${cell.value}`;
      }
      rowStr += display + ' | ';
    }
  }

  if (hasData) {
    console.log(rowStr);
  }
}

console.log('\n' + '='.repeat(80));

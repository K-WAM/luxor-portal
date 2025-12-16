/**
 * Script to read and extract formulas from the Excel spreadsheet
 * to verify our canonical calculations match
 */

const XLSX = require('xlsx');
const path = require('path');

const excelPath = path.join(__dirname, 'legacy html', 'calcs adjusted.xlsx');

console.log('Reading Excel file:', excelPath);
console.log('='.repeat(80));

const workbook = XLSX.readFile(excelPath, { cellFormula: true, cellStyles: true });

// Get all sheet names
console.log('\nAvailable sheets:', workbook.SheetNames.join(', '));

// Read the first sheet (usually the main one)
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

console.log(`\nAnalyzing sheet: "${sheetName}"`);
console.log('='.repeat(80));

// Function to get cell value and formula
function getCellInfo(cell) {
  if (!sheet[cell]) return null;

  const cellData = sheet[cell];
  return {
    value: cellData.v,
    formula: cellData.f || null,
    type: cellData.t
  };
}

// Key cells to examine based on typical financial spreadsheet structure
// We'll look for common patterns

console.log('\n📊 SCANNING FOR KEY FINANCIAL FORMULAS\n');

// Common locations for financial data
const keyCells = [
  'B27', 'B28', 'B29', 'B30', // Cost basis area
  'B35', 'B36', 'B37', 'B38', // YTD totals
  'B40', 'B41', 'B42', 'B43', // ROI calculations
];

// Scan all cells for formulas containing key terms
const cellAddresses = Object.keys(sheet).filter(k => !k.startsWith('!'));

console.log('KEY CELLS WITH FORMULAS:\n');

const importantFormulas = [];

cellAddresses.forEach(addr => {
  const cell = sheet[addr];
  if (cell.f) {
    const formula = cell.f.toUpperCase();

    // Look for formulas related to our key calculations
    if (
      formula.includes('SUM') ||
      formula.includes('EXPENSE') ||
      formula.includes('INCOME') ||
      formula.includes('ROI') ||
      formula.includes('TAX') ||
      formula.includes('COST') ||
      formula.includes('BASIS') ||
      formula.includes('MAINTENANCE') ||
      formula.includes('RENT') ||
      formula.includes('POOL') ||
      formula.includes('GARDEN') ||
      formula.includes('HOA')
    ) {
      importantFormulas.push({
        cell: addr,
        formula: cell.f,
        value: cell.v,
        label: sheet[addr.replace(/[0-9]/g, '1')]?.v || '' // Try to get label from row 1
      });
    }
  }
});

// Group formulas by row for better readability
const formulasByRow = {};
importantFormulas.forEach(f => {
  const row = f.cell.match(/\d+/)[0];
  if (!formulasByRow[row]) formulasByRow[row] = [];
  formulasByRow[row].push(f);
});

// Print formulas organized by row
Object.keys(formulasByRow).sort((a, b) => parseInt(a) - parseInt(b)).forEach(row => {
  console.log(`\nRow ${row}:`);
  formulasByRow[row].forEach(f => {
    console.log(`  ${f.cell}: ${f.value !== undefined ? f.value : '(no value)'}`);
    console.log(`    Formula: ${f.formula}`);
  });
});

// Look for specific labels to understand structure
console.log('\n\n📋 SCANNING FOR LABELED CELLS\n');

const labels = {};
cellAddresses.forEach(addr => {
  const cell = sheet[addr];
  if (cell.t === 's' && cell.v) { // String cells
    const value = cell.v.toLowerCase();
    if (
      value.includes('cost basis') ||
      value.includes('total cost') ||
      value.includes('closing cost') ||
      value.includes('home cost') ||
      value.includes('repair') ||
      value.includes('ytd') ||
      value.includes('rent income') ||
      value.includes('maintenance') ||
      value.includes('expense') ||
      value.includes('net income') ||
      value.includes('property tax') ||
      value.includes('roi') ||
      value.includes('pre-tax') ||
      value.includes('post-tax')
    ) {
      // Get the value in the next cell (usually the data cell)
      const colLetter = addr.match(/[A-Z]+/)[0];
      const rowNum = addr.match(/\d+/)[0];
      const nextCol = String.fromCharCode(colLetter.charCodeAt(0) + 1);
      const dataCell = nextCol + rowNum;
      const dataInfo = getCellInfo(dataCell);

      labels[cell.v] = {
        labelCell: addr,
        dataCell: dataCell,
        data: dataInfo
      };
    }
  }
});

console.log('LABELED VALUES AND FORMULAS:\n');
Object.keys(labels).sort().forEach(label => {
  const info = labels[label];
  console.log(`${label}:`);
  console.log(`  Location: ${info.labelCell} → ${info.dataCell}`);
  if (info.data) {
    console.log(`  Value: ${info.data.value}`);
    if (info.data.formula) {
      console.log(`  Formula: ${info.data.formula}`);
    }
  }
  console.log('');
});

// Print raw data from key areas
console.log('\n\n🔍 RAW CELL DATA (Rows 1-50, Columns A-F)\n');
console.log('='.repeat(80));

for (let row = 1; row <= 50; row++) {
  let rowData = [];
  for (let col of ['A', 'B', 'C', 'D', 'E', 'F']) {
    const cellAddr = col + row;
    const cellInfo = getCellInfo(cellAddr);
    if (cellInfo) {
      let display = '';
      if (cellInfo.formula) {
        display = `=${cellInfo.formula}`;
      } else if (cellInfo.value !== undefined) {
        display = String(cellInfo.value);
      }
      if (display) {
        rowData.push(`${cellAddr}: ${display}`);
      }
    }
  }
  if (rowData.length > 0) {
    console.log(`Row ${row}:`, rowData.join(' | '));
  }
}

console.log('\n' + '='.repeat(80));
console.log('Analysis complete!');

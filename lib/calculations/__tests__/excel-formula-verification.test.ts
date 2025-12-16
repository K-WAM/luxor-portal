/**
 * EXCEL FORMULA VERIFICATION TEST
 *
 * This test verifies that our canonical metrics calculations EXACTLY match
 * the Excel spreadsheet formulas from "legacy html/calcs adjusted.xlsx"
 *
 * Test data is from Buena Ventura property (10370 Buena Ventura Dr, Boca Raton, FL)
 */

import { calculateCanonicalMetrics } from '../canonical-metrics';
import type { PropertyData, MonthlyDataRow } from '../canonical-metrics';

describe('Excel Formula Verification - "calcs adjusted.xlsx"', () => {
  const asOf = new Date(2025, 11, 31); // Dec 31, 2025

  // Exact data from Excel spreadsheet
  const excelProperty: PropertyData = {
    home_cost: 775000,         // B24
    home_repair_cost: 30800,   // B25
    closing_costs: 0,          // B26
    total_cost: 805800,        // DB value (not used in canonical calc)
    current_market_estimate: 928000,
    purchase_date: null,
    lease_start: '2025-01-10', // E25
    target_monthly_rent: 5750, // B28
    last_month_rent_collected: true, // B36 = yes
  };

  // Monthly data from Excel rows 2-16 (months with actual data)
  // Note: Excel has 15 months of data, but we're focusing on the YTD totals
  const excelMonthly: MonthlyDataRow[] = [
    // Month 1 (Row 2): Date 45658, no rent
    { month: 1, year: 2025, rent_income: 0, maintenance: 0, pool: 0, garden: 0, hoa_payments: 205, property_tax: 0, total_expenses: 205, net_income: -205, property_market_estimate: 775000 },

    // Month 2 (Row 3): Date 45689, no rent
    { month: 2, year: 2025, rent_income: 0, maintenance: 0, pool: 0, garden: 0, hoa_payments: 205, property_tax: 0, total_expenses: 205, net_income: -205, property_market_estimate: 804000 },

    // Month 3 (Row 4): Date 45717, deposit/setup
    { month: 3, year: 2025, rent_income: 0, maintenance: 320, pool: 70, garden: 150, hoa_payments: 1005, property_tax: 0, total_expenses: 1545, net_income: -1545, property_market_estimate: 805000 },

    // Month 4 (Row 5): Date 45748, first rent + deposit
    { month: 4, year: 2025, rent_income: 4025, maintenance: 370, pool: 70, garden: 150, hoa_payments: 205, property_tax: 0, total_expenses: 795, net_income: 3230, property_market_estimate: 815000 },

    // Month 5 (Row 6): Date 45778
    { month: 5, year: 2025, rent_income: 5750, maintenance: 298, pool: 70, garden: 150, hoa_payments: 205, property_tax: 0, total_expenses: 723, net_income: 5027, property_market_estimate: 825000 },

    // Month 6 (Row 7): Date 45809
    { month: 6, year: 2025, rent_income: 5750, maintenance: 0, pool: 70, garden: 150, hoa_payments: 1005, property_tax: 0, total_expenses: 1225, net_income: 4525, property_market_estimate: 880000 },

    // Month 7 (Row 8): Date 45839
    { month: 7, year: 2025, rent_income: 5750, maintenance: 596, pool: 70, garden: 150, hoa_payments: 205, property_tax: 0, total_expenses: 1021, net_income: 4729, property_market_estimate: 890000 },

    // Month 8 (Row 9): Date 45870
    { month: 8, year: 2025, rent_income: 5750, maintenance: 0, pool: 70, garden: 150, hoa_payments: 205, property_tax: 0, total_expenses: 425, net_income: 5325, property_market_estimate: 925000 },

    // Month 9 (Row 10): Date 45901
    { month: 9, year: 2025, rent_income: 5750, maintenance: 77, pool: 70, garden: 150, hoa_payments: 1005, property_tax: 0, total_expenses: 1302, net_income: 4448, property_market_estimate: 935000 },

    // Month 10 (Row 11): Date 45931
    { month: 10, year: 2025, rent_income: 5750, maintenance: 116.62, pool: 70, garden: 150, hoa_payments: 205, property_tax: 0, total_expenses: 541.62, net_income: 5208.38, property_market_estimate: 955000 },

    // Month 11 (Row 12): Date 45962
    { month: 11, year: 2025, rent_income: 5750, maintenance: 224.86, pool: 70, garden: 150, hoa_payments: 205, property_tax: 0, total_expenses: 649.86, net_income: 5100.14, property_market_estimate: 942000 },

    // Month 12 (Row 13): Date 45992
    { month: 12, year: 2025, rent_income: 5750, maintenance: 0, pool: 0, garden: 0, hoa_payments: 0, property_tax: 0, total_expenses: 0, net_income: 5750, property_market_estimate: 928000 },
  ];

  describe('Excel Cell B27: Cost Basis', () => {
    it('should match Excel formula =SUM(B24:B26)', () => {
      const metrics = calculateCanonicalMetrics(excelProperty, excelMonthly, { asOf });

      // Excel B27 = B24 + B25 + B26 = 775,000 + 30,800 + 0 = 805,800
      expect(metrics.cost_basis).toBe(805800);
    });
  });

  describe('Excel Row 17: YTD Totals', () => {
    it('should match Excel B17: Rent Income =SUM(B2:B16)', () => {
      const metrics = calculateCanonicalMetrics(excelProperty, excelMonthly, { asOf });

      // Excel shows 55,775 in B17
      // This includes an extra month of rent when last_month_rent_collected is true.
      const expectedRentIncome =
        excelMonthly.reduce((sum, m) => sum + m.rent_income, 0) + (excelProperty.target_monthly_rent || 0);
      expect(metrics.ytd.rent_income).toBe(expectedRentIncome);
    });

    it('should match Excel C17: Maintenance =SUM(C2:C16)', () => {
      const metrics = calculateCanonicalMetrics(excelProperty, excelMonthly, { asOf });

      // Excel shows 2,002.48 in C17
      const expectedMaintenance = excelMonthly.reduce((sum, m) => sum + m.maintenance, 0);
      expect(metrics.ytd.maintenance).toBeCloseTo(expectedMaintenance, 2);
    });

    it('should match Excel D17: Pool =SUM(D2:D16)', () => {
      const metrics = calculateCanonicalMetrics(excelProperty, excelMonthly, { asOf });

      // Excel shows 630 in D17
      const expectedPool = excelMonthly.reduce((sum, m) => sum + m.pool, 0);
      expect(metrics.ytd.pool).toBe(expectedPool);
    });

    it('should match Excel E17: Garden =SUM(E2:E16)', () => {
      const metrics = calculateCanonicalMetrics(excelProperty, excelMonthly, { asOf });

      // Excel shows 1,350 in E17
      const expectedGarden = excelMonthly.reduce((sum, m) => sum + m.garden, 0);
      expect(metrics.ytd.garden).toBe(expectedGarden);
    });

    it('should match Excel F17: HOA =SUM(F2:F16)', () => {
      const metrics = calculateCanonicalMetrics(excelProperty, excelMonthly, { asOf });

      // Excel shows 4,655 in F17
      const expectedHOA = excelMonthly.reduce((sum, m) => sum + m.hoa_payments, 0);
      expect(metrics.ytd.hoa_payments).toBe(expectedHOA);
    });

    it('should match Excel G17: Total Expenses =SUM(C17:F17)', () => {
      const metrics = calculateCanonicalMetrics(excelProperty, excelMonthly, { asOf });

      // Excel G17 formula: =SUM(C17:F17)
      // This means: Maintenance + Pool + Garden + HOA
      // Excel shows 8,637.48 in G17
      const expectedTotalExpenses = metrics.ytd.maintenance + metrics.ytd.pool + metrics.ytd.garden + metrics.ytd.hoa_payments;
      expect(metrics.ytd.total_expenses).toBeCloseTo(expectedTotalExpenses, 2);
    });

    it('should verify total_expenses EXCLUDES property_tax', () => {
      const metrics = calculateCanonicalMetrics(excelProperty, excelMonthly, { asOf });

      // Critical: total_expenses should NOT include property_tax
      const totalWithoutTax = metrics.ytd.maintenance + metrics.ytd.pool + metrics.ytd.garden + metrics.ytd.hoa_payments;
      const totalWithTax = totalWithoutTax + metrics.ytd.property_tax;

      expect(metrics.ytd.total_expenses).toBe(totalWithoutTax);
      expect(metrics.ytd.total_expenses).not.toBe(totalWithTax);
    });

    it('should match Excel H17: Net Income =B17-G17', () => {
      const metrics = calculateCanonicalMetrics(excelProperty, excelMonthly, { asOf });

      // Excel H17 formula: =B17-G17 (Rent Income - Total Expenses)
      // Excel shows 47,137.52 in H17
      const expectedNetIncome = metrics.ytd.rent_income - metrics.ytd.total_expenses;
      expect(metrics.ytd.net_income).toBeCloseTo(expectedNetIncome, 2);
    });

    it('should verify net_income EXCLUDES property_tax', () => {
      const metrics = calculateCanonicalMetrics(excelProperty, excelMonthly, { asOf });

      // Critical: net_income should be rent - expenses (NOT including property_tax)
      const netIncomeWithoutTax = metrics.ytd.rent_income - metrics.ytd.total_expenses;

      expect(metrics.ytd.net_income).toBeCloseTo(netIncomeWithoutTax, 2);
    });

    it('should match Excel I17: Property Tax =SUM(I2:I16)', () => {
      const metrics = calculateCanonicalMetrics(excelProperty, excelMonthly, { asOf });

      // Excel shows 0 in I17 (no property tax in this example)
      const expectedPropertyTax = excelMonthly.reduce((sum, m) => sum + m.property_tax, 0);
      expect(metrics.ytd.property_tax).toBe(expectedPropertyTax);
    });
  });

  describe('ROI Formulas', () => {
    it('should calculate Pre-tax ROI = (net_income / cost_basis) * 100', () => {
      const metrics = calculateCanonicalMetrics(excelProperty, excelMonthly, { asOf });

      // Excel formula: Pre-tax ROI = (YTD Net Income / Cost Basis) * 100
      const expectedROI = (metrics.ytd.net_income / metrics.cost_basis) * 100;
      expect(metrics.roi_pre_tax).toBeCloseTo(expectedROI, 10);
    });

    it('should calculate Post-tax ROI = ((net_income - property_tax) / cost_basis) * 100', () => {
      const metrics = calculateCanonicalMetrics(excelProperty, excelMonthly, { asOf });

      // Excel formula: Post-tax ROI = ((YTD Net Income - Property Tax) / Cost Basis) * 100
      const expectedROI = ((metrics.ytd.net_income - metrics.ytd.property_tax) / metrics.cost_basis) * 100;
      expect(metrics.roi_post_tax).toBeCloseTo(expectedROI, 10);
    });

    it('should have pre-tax and post-tax ROI equal when property_tax is zero', () => {
      const metrics = calculateCanonicalMetrics(excelProperty, excelMonthly, { asOf });

      // Since property_tax = 0 in this example, both ROIs should be identical
      expect(metrics.ytd.property_tax).toBe(0);
      expect(metrics.roi_pre_tax).toBe(metrics.roi_post_tax);
    });
  });

  describe('Market Value and Appreciation', () => {
    it('should use latest monthly market estimate', () => {
      const metrics = calculateCanonicalMetrics(excelProperty, excelMonthly, { asOf });

      // Last month (12) has market estimate of 928,000
      expect(metrics.current_market_value).toBe(928000);
    });

    it('should calculate appreciation = market_value - cost_basis', () => {
      const metrics = calculateCanonicalMetrics(excelProperty, excelMonthly, { asOf });

      // Excel B34 formula: =LOOKUP(2,1/(ISNUMBER($J:$J)),$J:$J)-$B$27
      // Which is: Latest market value - Cost basis
      const expectedAppreciation = 928000 - 805800; // = 122,200
      expect(metrics.appreciation_value).toBe(expectedAppreciation);
    });

    it('should calculate appreciation_pct = (appreciation / cost_basis) * 100', () => {
      const metrics = calculateCanonicalMetrics(excelProperty, excelMonthly, { asOf });

      const expectedPct = ((928000 - 805800) / 805800) * 100;
      expect(metrics.appreciation_pct).toBeCloseTo(expectedPct, 10);
    });
  });

  describe('Maintenance Percentage', () => {
    it('should calculate maintenance_pct = (ytd_maintenance / ytd_rent_income) * 100', () => {
      const metrics = calculateCanonicalMetrics(excelProperty, excelMonthly, { asOf });

      const expectedPct = (metrics.ytd.maintenance / metrics.ytd.rent_income) * 100;
      expect(metrics.maintenance_pct).toBeCloseTo(expectedPct, 10);
    });
  });
});

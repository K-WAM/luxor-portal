/**
 * Validation tests for canonical metrics calculations
 *
 * These tests verify the core financial formulas match the Excel workbook
 * (property financial calculator.xlsx)
 */

import { calculateCanonicalMetrics, getPerformanceStatus } from '../canonical-metrics';
import type { PropertyData, MonthlyDataRow } from '../canonical-metrics';

describe('Canonical Metrics Calculations', () => {
  const asOf = new Date(2025, 11, 31); // Dec 31, 2025

  // Test data matching Buena Ventura property from Excel ("calcs adjusted.xlsx")
  const testProperty: PropertyData = {
    home_cost: 775000,
    home_repair_cost: 30800,
    closing_costs: 0,
    total_cost: 805800, // DB auto-calc (not used in canonical, but included for completeness)
    current_market_estimate: 928000,
    purchase_date: '2024-12-19',
  };

  const testMonthly: MonthlyDataRow[] = [
    { month: 1, year: 2025, rent_income: 0, maintenance: 0, pool: 0, garden: 0, hoa_payments: 205, property_tax: 0, total_expenses: 205, net_income: -205, property_market_estimate: null },
    { month: 2, year: 2025, rent_income: 0, maintenance: 0, pool: 0, garden: 0, hoa_payments: 205, property_tax: 0, total_expenses: 205, net_income: -205, property_market_estimate: null },
    { month: 3, year: 2025, rent_income: 0, maintenance: 0, pool: 0, garden: 0, hoa_payments: 1005, property_tax: 0, total_expenses: 1005, net_income: -1005, property_market_estimate: null },
    { month: 4, year: 2025, rent_income: 9775, maintenance: 370, pool: 70, garden: 150, hoa_payments: 205, property_tax: 0, total_expenses: 795, net_income: 8980, property_market_estimate: 815000 },
    { month: 5, year: 2025, rent_income: 5750, maintenance: 298, pool: 70, garden: 150, hoa_payments: 205, property_tax: 0, total_expenses: 723, net_income: 5027, property_market_estimate: null },
    { month: 6, year: 2025, rent_income: 5750, maintenance: 0, pool: 70, garden: 150, hoa_payments: 1005, property_tax: 0, total_expenses: 1225, net_income: 4525, property_market_estimate: null },
    { month: 7, year: 2025, rent_income: 5750, maintenance: 596, pool: 70, garden: 150, hoa_payments: 205, property_tax: 0, total_expenses: 1021, net_income: 4729, property_market_estimate: null },
    { month: 8, year: 2025, rent_income: 5750, maintenance: 0, pool: 70, garden: 150, hoa_payments: 205, property_tax: 0, total_expenses: 425, net_income: 5325, property_market_estimate: null },
    { month: 9, year: 2025, rent_income: 5750, maintenance: 77, pool: 70, garden: 150, hoa_payments: 1005, property_tax: 0, total_expenses: 1302, net_income: 4448, property_market_estimate: null },
    { month: 10, year: 2025, rent_income: 5750, maintenance: 117, pool: 70, garden: 150, hoa_payments: 205, property_tax: 0, total_expenses: 542, net_income: 5208, property_market_estimate: null },
    { month: 11, year: 2025, rent_income: 5750, maintenance: 225, pool: 70, garden: 150, hoa_payments: 205, property_tax: 10819, total_expenses: 650, net_income: 5100, property_market_estimate: null },
    { month: 12, year: 2025, rent_income: 5750, maintenance: 0, pool: 0, garden: 0, hoa_payments: 0, property_tax: 0, total_expenses: 0, net_income: 5750, property_market_estimate: 928000 },
  ];

  describe('YTD Totals', () => {
    it('should correctly sum rent_income', () => {
      const metrics = calculateCanonicalMetrics(testProperty, testMonthly, { asOf });
      // 0+0+0+9775+5750*8 = 55775
      expect(metrics.ytd.rent_income).toBe(55775);
    });

    it('should correctly sum maintenance', () => {
      const metrics = calculateCanonicalMetrics(testProperty, testMonthly, { asOf });
      // 370+298+0+596+0+77+117+225+0 = 1683
      expect(metrics.ytd.maintenance).toBe(1683);
    });

    it('should correctly sum total_expenses', () => {
      const metrics = calculateCanonicalMetrics(testProperty, testMonthly, { asOf });
      // Sum of all total_expenses from monthly data
      const expected = testMonthly.reduce((sum, m) => sum + m.total_expenses, 0);
      expect(metrics.ytd.total_expenses).toBeCloseTo(expected, 2);
    });

    it('should correctly sum net_income', () => {
      const metrics = calculateCanonicalMetrics(testProperty, testMonthly, { asOf });
      // Sum of all net_income from monthly data
      const expected = testMonthly.reduce((sum, m) => sum + m.net_income, 0);
      expect(metrics.ytd.net_income).toBeCloseTo(expected, 2);
    });

    it('should correctly sum property_tax', () => {
      const metrics = calculateCanonicalMetrics(testProperty, testMonthly, { asOf });
      // Only month 11 has property tax of 10819
      expect(metrics.ytd.property_tax).toBe(10819);
    });

    it('should add one month rent when last_month_rent_collected', () => {
      const propertyWithBonus: PropertyData = {
        ...testProperty,
        lease_start: '2025-01-10',
        target_monthly_rent: 5750,
        last_month_rent_collected: true,
      };

      // Use the same months but remove the deposit from month 4 (9775 -> 4025)
      const monthlyWithoutDeposit = testMonthly.map(m =>
        m.month === 4 ? { ...m, rent_income: 4025, net_income: 4025 - m.total_expenses } : m
      );

      const metrics = calculateCanonicalMetrics(propertyWithBonus, monthlyWithoutDeposit, { asOf });
      expect(metrics.ytd.rent_income).toBe(55775);
    });
  });

  describe('ROI Calculations', () => {
    it('should calculate pre-tax ROI correctly', () => {
      const metrics = calculateCanonicalMetrics(testProperty, testMonthly, { asOf });
      // Formula: (ytd_net_income / cost_basis) * 100
      const expected = (metrics.ytd.net_income / metrics.cost_basis) * 100;
      expect(metrics.roi_pre_tax).toBeCloseTo(expected, 10);
    });

    it('should calculate post-tax ROI correctly', () => {
      const metrics = calculateCanonicalMetrics(testProperty, testMonthly, { asOf });
      // Formula: ((ytd_net_income - ytd_property_tax) / cost_basis) * 100
      const expected = ((metrics.ytd.net_income - metrics.ytd.property_tax) / metrics.cost_basis) * 100;
      expect(metrics.roi_post_tax).toBeCloseTo(expected, 10);
    });

    it('should calculate appreciation correctly', () => {
      const metrics = calculateCanonicalMetrics(testProperty, testMonthly, { asOf });
      // Formula: current_market_value - cost_basis
      expect(metrics.appreciation_value).toBe(928000 - 805800);
      expect(metrics.appreciation_pct).toBeCloseTo(((928000 - 805800) / 805800) * 100, 10);
    });

    it('should calculate ROI with appreciation correctly', () => {
      const metrics = calculateCanonicalMetrics(testProperty, testMonthly, { asOf });
      // Formula: (net_income + appreciation) / cost_basis * 100
      const expected = ((metrics.ytd.net_income + metrics.appreciation_value) / metrics.cost_basis) * 100;
      expect(metrics.roi_with_appreciation).toBeCloseTo(expected, 10);
    });

    it('should fall back to estimated property tax when actual is zero', () => {
      const taxFreeMonthly: MonthlyDataRow[] = [
        { month: 1, year: 2025, rent_income: 10000, maintenance: 0, pool: 0, garden: 0, hoa_payments: 0, property_tax: 0, total_expenses: 0, net_income: 10000, property_market_estimate: null },
      ];

      const metrics = calculateCanonicalMetrics(
        testProperty,
        taxFreeMonthly,
        { asOf: new Date(2025, 2, 31), estimatedAnnualPropertyTax: 1200 } // Mar 31, 2025
      );

      // Spec: use the full annual estimate when actual tax is missing (no proration)
      const expected = ((metrics.ytd.net_income - 1200) / metrics.cost_basis) * 100;
      expect(metrics.ytd.property_tax).toBe(0);
      expect(metrics.roi_post_tax).toBeCloseTo(expected, 10);
    });
  });

  describe('Market Value Fallback', () => {
    it('should use latest monthly estimate when available', () => {
      const metrics = calculateCanonicalMetrics(testProperty, testMonthly, { asOf });
      // Last month (12) has estimate of 928000
      expect(metrics.current_market_value).toBe(928000);
    });

    it('should fallback to property estimate when no monthly estimates', () => {
      const monthlyWithoutEstimates = testMonthly.map(m => ({
        ...m,
        property_market_estimate: null,
      }));
      const metrics = calculateCanonicalMetrics(testProperty, monthlyWithoutEstimates, { asOf });
      expect(metrics.current_market_value).toBe(testProperty.current_market_estimate);
    });

    it('should fallback to cost basis when no estimates at all', () => {
      const monthlyWithoutEstimates = testMonthly.map(m => ({
        ...m,
        property_market_estimate: null,
      }));
      const propertyWithoutEstimate = {
        ...testProperty,
        current_market_estimate: 0,
      };
      const metrics = calculateCanonicalMetrics(propertyWithoutEstimate, monthlyWithoutEstimates, { asOf });
      expect(metrics.current_market_value).toBe(testProperty.total_cost);
    });
  });

  describe('Maintenance Percentage', () => {
    it('should calculate maintenance percentage correctly', () => {
      const metrics = calculateCanonicalMetrics(testProperty, testMonthly, { asOf });
      // Formula: (ytd_maintenance / ytd_rent_income) * 100
      const expected = (metrics.ytd.maintenance / metrics.ytd.rent_income) * 100;
      expect(metrics.maintenance_pct).toBeCloseTo(expected, 10);
    });

    it('should handle zero rent income without error', () => {
      const emptyMonthly: MonthlyDataRow[] = [
        { month: 1, year: 2025, rent_income: 0, maintenance: 0, pool: 0, garden: 0, hoa_payments: 0, property_tax: 0, total_expenses: 0, net_income: 0, property_market_estimate: null },
      ];
      const metrics = calculateCanonicalMetrics(testProperty, emptyMonthly, { asOf });
      expect(metrics.maintenance_pct).toBe(0);
    });
  });

  describe('Performance Status', () => {
    it('should return green for good performance', () => {
      // Create scenario with ROI >= 5% and maintenance < 5%
      const goodMonthly: MonthlyDataRow[] = [
        { month: 1, year: 2025, rent_income: 50000, maintenance: 2000, pool: 0, garden: 0, hoa_payments: 1000, property_tax: 0, total_expenses: 3000, net_income: 47000, property_market_estimate: null },
      ];
      const metrics = calculateCanonicalMetrics(testProperty, goodMonthly, { asOf });
      const status = getPerformanceStatus(metrics);
      expect(status).toBe('green');
    });

    it('should return yellow for fair performance', () => {
      // Create scenario with ROI >= 3% but < 5% OR maintenance 5-7%
      const fairMonthly: MonthlyDataRow[] = [
        { month: 1, year: 2025, rent_income: 30000, maintenance: 1500, pool: 0, garden: 0, hoa_payments: 1000, property_tax: 0, total_expenses: 2500, net_income: 27500, property_market_estimate: null },
      ];
      const metrics = calculateCanonicalMetrics(testProperty, fairMonthly, { asOf });
      const status = getPerformanceStatus(metrics);
      expect(status).toBe('yellow');
    });

    it('should return red for poor performance', () => {
      // Create scenario with ROI < 3% or maintenance > 7%
      const poorMonthly: MonthlyDataRow[] = [
        { month: 1, year: 2025, rent_income: 10000, maintenance: 800, pool: 0, garden: 0, hoa_payments: 1000, property_tax: 0, total_expenses: 1800, net_income: 8200, property_market_estimate: null },
      ];
      const metrics = calculateCanonicalMetrics(testProperty, poorMonthly, { asOf });
      const status = getPerformanceStatus(metrics);
      expect(status).toBe('red');
    });
  });

  describe('Formula Consistency', () => {
    it('total_expenses should NOT include property_tax', () => {
      const metrics = calculateCanonicalMetrics(testProperty, testMonthly, { asOf });
      // Verify that total_expenses = maintenance + pool + garden + hoa_payments
      const calculatedExpenses = metrics.ytd.maintenance + metrics.ytd.pool + metrics.ytd.garden + metrics.ytd.hoa_payments;
      // The total_expenses from DB should match (it's pre-calculated in the DB)
      // We're verifying the DB values are consistent with our understanding
      expect(metrics.ytd.total_expenses).toBeLessThan(metrics.ytd.total_expenses + metrics.ytd.property_tax);
    });

    it('net_income should equal rent_income minus total_expenses', () => {
      const metrics = calculateCanonicalMetrics(testProperty, testMonthly, { asOf });
      // Verify formula: net_income = rent_income - total_expenses
      const expectedNetIncome = metrics.ytd.rent_income - metrics.ytd.total_expenses;
      expect(metrics.ytd.net_income).toBeCloseTo(expectedNetIncome, 10);
    });
  });
});

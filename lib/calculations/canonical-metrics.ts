/**
 * CANONICAL FINANCIAL CALCULATIONS
 *
 * This is the single source of truth for all financial calculations in the app.
 * All other calculation logic should be removed or refactored to use this module.
 *
 * Formulas match the Excel workbook (legacy html/calcs adjusted.xlsx):
 * - total_expenses = maintenance + pool + garden + hoa_payments (NOT including property_tax)
 * - net_income = rent_income - total_expenses
 * - pre_tax_roi = (ytd_net_income / cost_basis) * 100
 * - post_tax_roi = ((ytd_net_income - ytd_property_tax) / cost_basis) * 100
 *
 * Excel-specific rules:
 * - If last month's rent was paid upfront (properties.last_month_rent_collected),
 *   add ONE extra month of rent to YTD rent income and YTD net income in the lease START year
 *   (fallback to lease END year if no start date, or current metrics year if neither exists).
 * - Post-tax ROI uses actual YTD property tax if present, otherwise falls back to an estimate.
 * - maintenance_pct = (ytd_maintenance / ytd_rent_income) * 100
 */

/**
 * Monthly performance data shape (from property_monthly_performance table)
 */
export type MonthlyDataRow = {
  month: number;
  year: number;
  rent_income: number;
  maintenance: number;
  pool: number;
  garden: number;
  hoa_payments: number;
  property_tax: number;
  total_expenses?: number;
  net_income?: number;
  property_market_estimate: number | null;
};

/**
 * Property data shape (from properties table)
 */
export type PropertyData = {
  home_cost: number;
  home_repair_cost: number;
  closing_costs: number | null;
  total_cost: number; // Note: DB auto-calculates this as home_cost + home_repair_cost (excludes closing_costs)
  current_market_estimate: number;
  purchase_date: string | null;
  lease_start?: string | null;
  lease_end?: string | null;
  target_monthly_rent?: number | null;
  deposit?: number | null;
  last_month_rent_collected?: boolean | null;
};

export type CanonicalMetricsOptions = {
  asOf?: Date;
  estimatedAnnualPropertyTax?: number | null;
  estimatedYtdPropertyTax?: number | null;
  /**
   * Filter monthly data to specific months (e.g., [5, 6, 7, 8, 9, 10, 11, 12] for May-Dec lease term)
   * If not provided, defaults to all months up to asOf date (standard YTD behavior)
   */
  monthsFilter?: number[];
};

/**
 * YTD totals calculated from monthly data
 */
export type YTDTotals = {
  rent_income: number;
  maintenance: number;
  pool: number;
  garden: number;
  hoa_payments: number;
  property_tax: number;
  total_expenses: number;
  net_income: number;
};

/**
 * Complete canonical metrics output
 */
export type CanonicalMetrics = {
  ytd: YTDTotals;
  cost_basis: number;
  current_market_value: number;
  appreciation_value: number;
  appreciation_pct: number;
  roi_pre_tax: number;
  roi_post_tax: number;
  roi_with_appreciation: number;
  roi_if_sold_today: number;
  maintenance_pct: number;
  months_owned: number;
};

function getMonthsElapsedInYear(year: number, asOf: Date): number {
  const asOfYear = asOf.getFullYear();
  if (year < asOfYear) return 12;
  if (year > asOfYear) return 0;
  return asOf.getMonth() + 1; // 1-12
}

function getMetricsYear(monthly: MonthlyDataRow[], fallback: Date): number {
  const year = monthly.find(m => Number.isFinite(m.year))?.year;
  return typeof year === 'number' ? year : fallback.getFullYear();
}

function shouldApplyLastMonthRentBonus(property: PropertyData, metricsYear: number): boolean {
  if (!property.last_month_rent_collected) return false;

  // Apply in or after the lease start year (covers mid-lease changes and avoids missing the bonus).
  if (property.lease_start) {
    const leaseStartYear = new Date(property.lease_start).getFullYear();
    if (metricsYear >= leaseStartYear) return true;
  }

  // Fallback: if no start, use lease end year or current metrics year.
  if (!property.lease_start && property.lease_end) {
    const leaseEndYear = new Date(property.lease_end).getFullYear();
    if (metricsYear >= leaseEndYear) return true;
  }

  // Final fallback: apply in the current metrics year
  return true;
}

function getLastMonthRentBonusAmount(property: PropertyData): number {
  const targetMonthlyRent = property.target_monthly_rent ?? 0;
  if (targetMonthlyRent > 0) return targetMonthlyRent;

  // Fallback: legacy setups sometimes store last month rent in deposit.
  const deposit = property.deposit ?? 0;
  return deposit > 0 ? deposit : 0;
}

/**
 * Calculate YTD totals from monthly performance data
 * Year-to-date is limited to months <= the asOf month for the current year.
 * Can be filtered to specific months via monthsFilter option (e.g., for lease term filtering).
 */
function calculateYTDTotals(
  monthly: MonthlyDataRow[],
  metricsYear: number,
  asOf: Date,
  monthsFilter?: number[]
): YTDTotals {
  const monthsElapsed = getMonthsElapsedInYear(metricsYear, asOf);
  if (monthsElapsed <= 0) {
    return {
      rent_income: 0,
      maintenance: 0,
      pool: 0,
      garden: 0,
      hoa_payments: 0,
      property_tax: 0,
      total_expenses: 0,
      net_income: 0,
    };
  }

  const maxMonth = Math.min(12, monthsElapsed);

  // Filter by year and month range
  let scoped = monthly.filter(m => m.year === metricsYear && m.month >= 1 && m.month <= maxMonth);

  // Apply additional month filter if provided (for lease term filtering)
  if (monthsFilter && monthsFilter.length > 0) {
    scoped = scoped.filter(m => monthsFilter.includes(m.month));
  }

  return scoped.reduce(
    (acc, month) => {
      const rent_income = month.rent_income || 0;
      const maintenance = month.maintenance || 0;
      const pool = month.pool || 0;
      const garden = month.garden || 0;
      const hoa_payments = month.hoa_payments || 0;
      const property_tax = month.property_tax || 0;

      // Excel formula: total_expenses = maintenance + pool + garden + hoa_payments (EXCLUDES property_tax)
      const total_expenses = maintenance + pool + garden + hoa_payments;
      // Excel formula: net_income = rent_income - total_expenses (EXCLUDES property_tax)
      const net_income = rent_income - total_expenses;

      return {
        rent_income: acc.rent_income + rent_income,
        maintenance: acc.maintenance + maintenance,
        pool: acc.pool + pool,
        garden: acc.garden + garden,
        hoa_payments: acc.hoa_payments + hoa_payments,
        property_tax: acc.property_tax + property_tax,
        total_expenses: acc.total_expenses + total_expenses,
        net_income: acc.net_income + net_income,
      };
    },
    {
      rent_income: 0,
      maintenance: 0,
      pool: 0,
      garden: 0,
      hoa_payments: 0,
      property_tax: 0,
      total_expenses: 0,
      net_income: 0,
    }
  );
}

/**
 * Get current market value with fallback logic:
 * 1. Latest non-zero monthly estimate
 * 2. Property's current_market_estimate
 * 3. Cost basis as final fallback
 */
function getCurrentMarketValue(
  monthly: MonthlyDataRow[],
  property: PropertyData
): number {
  // Find latest monthly estimate
  const monthsWithEstimates = monthly
    .filter(m => m.property_market_estimate && m.property_market_estimate > 0)
    .sort((a, b) => (b.year - a.year) || (b.month - a.month));

  if (monthsWithEstimates.length > 0) {
    return monthsWithEstimates[0].property_market_estimate!;
  }

  // Fall back to property estimate
  if (property.current_market_estimate > 0) {
    return property.current_market_estimate;
  }

  // Final fallback to cost basis
  return property.total_cost;
}

/**
 * Calculate months owned from purchase date to now
 */
function calculateMonthsOwned(purchaseDate: string | null): number {
  if (!purchaseDate) return 1;

  const purchase = new Date(purchaseDate);
  const now = new Date();

  const months =
    (now.getFullYear() - purchase.getFullYear()) * 12 +
    (now.getMonth() - purchase.getMonth());

  return Math.max(1, months);
}

/**
 * CANONICAL CALCULATION FUNCTION
 *
 * This is the single source of truth for all financial metrics.
 * Use this function everywhere instead of duplicating calculation logic.
 *
 * @param property - Property details from properties table
 * @param monthly - Monthly performance data from property_monthly_performance table
 * @returns Complete canonical metrics
 */
export function calculateCanonicalMetrics(
  property: PropertyData,
  monthly: MonthlyDataRow[],
  options: CanonicalMetricsOptions = {}
): CanonicalMetrics {
  const asOf = options.asOf ?? new Date();
  const metricsYear = getMetricsYear(monthly, asOf);

  // Step 1: Calculate YTD totals (with optional month filtering for lease term)
  const ytd = calculateYTDTotals(monthly, metricsYear, asOf, options.monthsFilter);

  // Excel deposit / last-month rent rule: add 1 month of rent if collected upfront
  if (shouldApplyLastMonthRentBonus(property, metricsYear)) {
    const bonusRent = getLastMonthRentBonusAmount(property);
    if (bonusRent > 0) {
      ytd.rent_income += bonusRent;
      ytd.net_income += bonusRent;
    }
  }

  // Step 2: Cost basis matching Excel formula (B27)
  // Excel: =SUM(B24:B26) = Home Cost + Home Repair Cost + Closing Costs
  // NOTE: DB total_cost only includes home_cost + home_repair_cost, so we add closing_costs
  const cost_basis = (property.home_cost || 0) +
                     (property.home_repair_cost || 0) +
                     (property.closing_costs || 0);

  // Step 3: Get current market value with fallback logic
  const current_market_value = getCurrentMarketValue(monthly, property);

  // Step 4: Calculate appreciation
  const appreciation_value = current_market_value - cost_basis;
  const appreciation_pct = cost_basis > 0 ? (appreciation_value / cost_basis) * 100 : 0;

  // Step 5: Calculate ROI metrics
  // Pre-tax ROI = YTD Net Income / Cost Basis × 100
  const roi_pre_tax = cost_basis > 0 ? (ytd.net_income / cost_basis) * 100 : 0;

  // Post-tax ROI = (YTD Net Income - Property Tax) / Cost Basis × 100
  const estimatedYtdPropertyTax =
    options.estimatedYtdPropertyTax ??
    (() => {
      const annual = options.estimatedAnnualPropertyTax ?? 0;
      return annual || 0; // always full annual estimate when actual is missing
    })();

  const taxForPostTaxRoi = ytd.property_tax > 0 ? ytd.property_tax : estimatedYtdPropertyTax;

  const roi_post_tax = cost_basis > 0
    ? ((ytd.net_income - taxForPostTaxRoi) / cost_basis) * 100
    : 0;

  // ROI with appreciation = (Net Income + Appreciation) / Cost Basis × 100
  const roi_with_appreciation = cost_basis > 0
    ? ((ytd.net_income + appreciation_value) / cost_basis) * 100
    : 0;

  // ROI if sold today = (Net Income - Property Tax - Closing Costs + Appreciation) / Cost Basis × 100
  const closing_costs = property.closing_costs || 0;
  const roi_if_sold_today = cost_basis > 0
    ? ((ytd.net_income - taxForPostTaxRoi - closing_costs + appreciation_value) / cost_basis) * 100
    : 0;

  // Step 6: Calculate maintenance percentage
  const maintenance_pct = ytd.rent_income > 0
    ? (ytd.maintenance / ytd.rent_income) * 100
    : 0;

  // Step 7: Calculate months owned
  const months_owned = calculateMonthsOwned(property.purchase_date);

  return {
    ytd,
    cost_basis,
    current_market_value,
    appreciation_value,
    appreciation_pct,
    roi_pre_tax,
    roi_post_tax,
    roi_with_appreciation,
    roi_if_sold_today,
    maintenance_pct,
    months_owned,
  };
}

/**
 * Determine performance status (green/yellow/red)
 *
 * Logic:
 * - Green: ROI >= 5% AND maintenance < 5%
 * - Yellow: ROI >= 3% AND maintenance < 7%
 * - Red: Otherwise
 */
export function getPerformanceStatus(metrics: CanonicalMetrics): 'green' | 'yellow' | 'red' {
  const { roi_post_tax, maintenance_pct } = metrics;

  if (roi_post_tax >= 5 && maintenance_pct < 5) return 'green';
  if (roi_post_tax >= 3 && maintenance_pct < 7) return 'yellow';
  return 'red';
}

/**
 * Format currency for display
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`;
}

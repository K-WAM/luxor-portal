import type {
  PropertyFinancials,
  MonthlyPerformance,
  AnnualTarget,
  OperatingSummary,
  OperatingSummaryMetrics,
  HomePerformance,
  InvestmentPerformance,
  OwnerDashboardMetrics,
  AssetPerformanceNarrative,
  PerformanceStatus,
} from '../types/financial-metrics';
import type { YTDTotals } from './canonical-metrics';

/**
 * Convert canonical YTD totals to operating metrics format
 * This uses the canonical calculation output to ensure consistency
 */
function ytdToOperatingMetrics(ytd: YTDTotals): OperatingSummaryMetrics {
  const hoa_pool_garden = ytd.pool + ytd.garden + ytd.hoa_payments;

  return {
    gross_income: ytd.rent_income,
    maintenance: ytd.maintenance,
    maintenance_pct_of_income: ytd.rent_income > 0 ? (ytd.maintenance / ytd.rent_income) * 100 : 0,
    hoa_pool_garden,
    total_expenses: ytd.total_expenses,
    net_income: ytd.net_income,
    property_tax: ytd.property_tax,
    property_tax_pct_of_income: ytd.rent_income > 0 ? (ytd.property_tax / ytd.rent_income) * 100 : 0,
  };
}

/**
 * Convert annual target to operating metrics format
 */
function targetToOperatingMetrics(target: AnnualTarget | null): OperatingSummaryMetrics {
  if (!target) {
    return {
      gross_income: 0,
      maintenance: 0,
      maintenance_pct_of_income: 0,
      hoa_pool_garden: 0,
      total_expenses: 0,
      net_income: 0,
      property_tax: 0,
      property_tax_pct_of_income: 0,
    };
  }

  const hoa_pool_garden = target.hoa + target.pool + target.garden;

  return {
    gross_income: target.rent_income,
    maintenance: target.maintenance,
    maintenance_pct_of_income: target.rent_income > 0
      ? (target.maintenance / target.rent_income) * 100
      : 0,
    hoa_pool_garden,
    total_expenses: target.total_expenses,
    net_income: target.net_income,
    property_tax: target.property_tax,
    property_tax_pct_of_income: target.rent_income > 0
      ? (target.property_tax / target.rent_income) * 100
      : 0,
  };
}

/**
 * Calculate home performance metrics
 */
function calculateHomePerformance(
  property: PropertyFinancials,
  latestMarketEstimate: number
): HomePerformance {
  const purchase_price_plus_repairs = property.total_cost;
  const current_value = latestMarketEstimate || property.current_market_estimate;
  const appreciation = current_value - purchase_price_plus_repairs;
  const appreciation_percentage = purchase_price_plus_repairs > 0
    ? (appreciation / purchase_price_plus_repairs) * 100
    : 0;

  // Calculate months owned
  const purchaseDate = property.purchase_date ? new Date(property.purchase_date) : new Date();
  const today = new Date();
  const months_owned = Math.max(
    1,
    (today.getFullYear() - purchaseDate.getFullYear()) * 12 +
    (today.getMonth() - purchaseDate.getMonth())
  );

  const monthly_gain = appreciation / months_owned;

  // Annualized gain percentage
  const annualized_gain_percentage = months_owned > 0
    ? (appreciation_percentage * 12) / months_owned
    : 0;

  return {
    purchase_price_plus_repairs,
    current_value,
    appreciation,
    appreciation_percentage,
    months_owned,
    monthly_gain,
    annualized_gain_percentage,
  };
}

/**
 * Calculate investment performance metrics
 */
function calculateInvestmentPerformance(
  property: PropertyFinancials,
  actual: OperatingSummaryMetrics,
  homePerformance: HomePerformance
): InvestmentPerformance {
  const total_cost = property.total_cost;
  const net_income_ytd = actual.net_income;
  const property_tax_ytd = actual.property_tax;
  const appreciation = homePerformance.appreciation;
  const closing_costs = property.closing_costs || 0;

  // ROI based on net income (before property tax)
  const roi_net_income = total_cost > 0
    ? (net_income_ytd / total_cost) * 100
    : 0;

  // ROI after property tax
  const roi_post_property_tax = total_cost > 0
    ? ((net_income_ytd - property_tax_ytd) / total_cost) * 100
    : 0;

  // ROI from home appreciation
  const roi_home_appreciation = total_cost > 0
    ? (appreciation / total_cost) * 100
    : 0;

  // Composite ROI: (Net income after tax + appreciation - closing costs) / total cost
  // This represents what you'd get if you sold today
  const roi_composite = total_cost > 0
    ? ((net_income_ytd - property_tax_ytd + appreciation - closing_costs) / total_cost) * 100
    : 0;

  return {
    roi_net_income,
    roi_post_property_tax,
    roi_home_appreciation,
    roi_composite,
  };
}

/**
 * Main calculation function to generate owner dashboard metrics
 *
 * IMPORTANT: This function now uses canonical YTD totals to ensure consistency
 * with the rest of the application. Pass ytd from calculateCanonicalMetrics().
 */
export function calculateOwnerMetrics(
  property: PropertyFinancials,
  monthly: MonthlyPerformance[],
  ytd: YTDTotals,
  planTarget: AnnualTarget | null,
  yeTarget: AnnualTarget | null
): OwnerDashboardMetrics {
  // Use canonical YTD totals instead of recalculating
  const actual = ytdToOperatingMetrics(ytd);
  const plan = targetToOperatingMetrics(planTarget);
  const yeTargetMetrics = targetToOperatingMetrics(yeTarget);

  // Calculate delta to plan
  const deltaToPlan = {
    gross_income: plan.gross_income > 0
      ? ((actual.gross_income - plan.gross_income) / plan.gross_income) * 100
      : 0,
    maintenance: plan.maintenance > 0
      ? ((actual.maintenance - plan.maintenance) / plan.maintenance) * 100
      : 0,
    maintenance_pct_of_income: actual.maintenance_pct_of_income - plan.maintenance_pct_of_income,
    hoa_pool_garden: plan.hoa_pool_garden > 0
      ? ((actual.hoa_pool_garden - plan.hoa_pool_garden) / plan.hoa_pool_garden) * 100
      : 0,
    total_expenses: plan.total_expenses > 0
      ? ((actual.total_expenses - plan.total_expenses) / plan.total_expenses) * 100
      : 0,
    net_income: plan.net_income > 0
      ? ((actual.net_income - plan.net_income) / plan.net_income) * 100
      : 0,
  };

  const operatingSummary: OperatingSummary = {
    actual,
    plan,
    yeTarget: yeTargetMetrics,
    deltaToPlan,
  };

  // Get latest market estimate from monthly data or property
  const latestMonthlyEstimate = monthly
    .filter(m => m.property_market_estimate > 0)
    .sort((a, b) => b.month - a.month)[0]?.property_market_estimate;

  const homePerformance = calculateHomePerformance(
    property,
    latestMonthlyEstimate || property.current_market_estimate
  );

  const investmentPerformance = calculateInvestmentPerformance(
    property,
    actual,
    homePerformance
  );

  return {
    property,
    monthly,
    operatingSummary,
    homePerformance,
    investmentPerformance,
  };
}

/**
 * Determine performance status based on metrics
 *
 * Status logic:
 * - Green: ROI meets or exceeds plan, maintenance < 5% of income
 * - Yellow: ROI within 10% of plan OR maintenance 5-7% of income
 * - Red: ROI significantly below plan (>10%) OR maintenance > 7% of income
 */
function determinePerformanceStatus(
 metrics: OwnerDashboardMetrics,
  planTarget: AnnualTarget | null
): PerformanceStatus {
  const { operatingSummary, investmentPerformance } = metrics;
  const maintenancePct = operatingSummary.actual.maintenance_pct_of_income;
  const actualROI = investmentPerformance.roi_net_income;

  // Mirror canonical thresholds: green if ROI >= 5% and maintenance < 5%
  if (actualROI >= 5 && maintenancePct < 5) return 'green';
  // Yellow if ROI >= 3% and maintenance < 7%
  if (actualROI >= 3 && maintenancePct < 7) return 'yellow';
  return 'red';
}

/**
 * Format currency for narrative text
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format percentage for narrative text
 */
function formatPercentage(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Generate asset performance narrative
 */
export function generateAssetPerformanceNarrative(
  metrics: OwnerDashboardMetrics,
  planTarget: AnnualTarget | null,
  yeTarget: AnnualTarget | null
): AssetPerformanceNarrative {
  const status = determinePerformanceStatus(metrics, planTarget);
  const { operatingSummary, homePerformance, investmentPerformance, property } = metrics;
  const { actual, plan, yeTarget: yeTargetMetrics } = operatingSummary;
  const costBasis = property.total_cost;

  const statusText = status === 'green' ? 'Good' : status === 'yellow' ? 'Fair' : 'Needs Attention';

  // Investment Performance summary
  const investmentPerformanceText =
    `Investment performance is ${status} (${statusText}) based on income, maintenance, expenses, and asset appreciation.`;

  // Operating Income and Expenses
  const roiComparison = formatPercentage(investmentPerformance.roi_net_income);

  const yeTargetROI = yeTarget && costBasis > 0
    ? (yeTarget.net_income / costBasis) * 100
    : 0;

  const yeTargetText = yeTarget
    ? ` The home is expected to yield ${formatPercentage(yeTargetROI)} annually.`
    : '';

  const maintenanceTarget = planTarget?.maintenance_percentage_target || 5;
  const maintenanceComparison = actual.maintenance_pct_of_income <= maintenanceTarget
    ? `below the target of <${formatPercentage(maintenanceTarget, 0)})`
    : `above the target of <${formatPercentage(maintenanceTarget, 0)}`;

  const operatingIncomeText =
    `Income is ${formatCurrency(actual.gross_income)}, ` +
    `maintenance is ${formatCurrency(actual.maintenance)}, ` +
    `and HOA, pool, and other fees are ${formatCurrency(actual.hoa_pool_garden)}, ` +
    `creating a net income of ${formatCurrency(actual.net_income)}. ` +
    `ROI is ${roiComparison}.${yeTargetText} ` +
    `Maintenance costs are ${formatPercentage(actual.maintenance_pct_of_income)} of income (${maintenanceComparison}).`;

  // Property Taxes
  const netIncomeAfterTax = actual.net_income - actual.property_tax;
  const propertyTaxesText = actual.property_tax > 0
    ? `After property taxes of ${formatCurrency(actual.property_tax)}, ` +
      `net income is ${formatCurrency(netIncomeAfterTax)} ` +
      `(${formatPercentage(investmentPerformance.roi_post_property_tax)} ROI).`
    : `No property taxes have been recorded for this period.`;

  // Home Value
  const closingCostText = property.closing_costs > 0
    ? `, expected closing costs of ${formatCurrency(property.closing_costs)} would yield a ` +
      `${formatPercentage(investmentPerformance.roi_composite)} return after property taxes and appreciation for the year.`
    : ` and would yield a ${formatPercentage(investmentPerformance.roi_composite)} return after property taxes and appreciation.`;

  const homeValueText =
    `The home was purchased for ${formatCurrency(property.home_cost)} ` +
    `plus ${formatCurrency(property.home_repair_cost)} in repairs ` +
    `(total ${formatCurrency(homePerformance.purchase_price_plus_repairs)}). ` +
    `It is now valued at ${formatCurrency(homePerformance.current_value)}, ` +
    `up ${formatCurrency(homePerformance.appreciation)} ` +
    `(${formatPercentage(homePerformance.appreciation_percentage)}) ` +
    `over ${homePerformance.months_owned} months. ` +
    `If sold today for ${formatCurrency(homePerformance.current_value)}${closingCostText}`;

  return {
    status,
    investmentPerformanceText,
    operatingIncomeText,
    propertyTaxesText,
    homeValueText,
  };
}

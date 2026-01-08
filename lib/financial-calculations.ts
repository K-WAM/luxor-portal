// Shared financial calculation utilities

import { getDateOnlyParts, parseDateOnly } from "./date-only";

/**
 * Calculate proration factor for first month if lease starts mid-month
 * @param leaseStart - Lease start date string
 * @param year - The year to check
 * @returns Proration factor (0-1) for the first month
 */
export function getFirstMonthProration(leaseStart: string | null | undefined, year: number): number {
  if (!leaseStart) return 1;

  const startParts = getDateOnlyParts(leaseStart);
  if (!startParts || startParts.year !== year) return 1;

  const startDay = startParts.day;
  const startMonth = startParts.month - 1;
  const daysInMonth = new Date(year, startMonth + 1, 0).getDate();

  // If start day is 1, no proration needed
  if (startDay === 1) return 1;

  // Proration = remaining days / total days
  const remainingDays = daysInMonth - startDay + 1;
  return remainingDays / daysInMonth;
}

/**
 * Calculate planned rent for the year including proration and bonus month
 * @param targetMonthlyRent - Target monthly rent amount
 * @param leaseStart - Lease start date
 * @param deposit - Security deposit amount
 * @param lastMonthRentCollected - Whether last month rent was collected
 * @param year - The year to calculate for
 * @returns Total planned rent for the year
 */
export function calculatePlannedRent(
  targetMonthlyRent: number,
  leaseStart: string | null | undefined,
  deposit: number,
  lastMonthRentCollected: boolean,
  year: number
): number {
  if (!targetMonthlyRent) return 0;

  // Base: 12 months of rent
  let totalRent = targetMonthlyRent * 12;

  // Apply first month proration if lease starts mid-month in this year
  const proration = getFirstMonthProration(leaseStart, year);
  if (proration < 1) {
    // Reduce by the prorated amount for the partial first month
    totalRent = targetMonthlyRent * 11 + (targetMonthlyRent * proration);
  }

  // Add bonus month if deposit or last month rent was collected
  if (deposit > 0 || lastMonthRentCollected) {
    totalRent += targetMonthlyRent;
  }

  return totalRent;
}

/**
 * Calculate planned maintenance (5% of planned rent)
 */
export function calculatePlannedMaintenance(plannedRent: number): number {
  return plannedRent * 0.05;
}

/**
 * Calculate total planned expenses
 */
export function calculatePlannedExpenses(
  plannedMaintenance: number,
  plannedPool: number,
  plannedGarden: number,
  plannedHoa: number,
  plannedPropertyTax: number
): number {
  return plannedMaintenance + plannedPool + plannedGarden + plannedHoa + plannedPropertyTax;
}

/**
 * Calculate planned net income
 */
export function calculatePlannedNet(plannedRent: number, plannedExpenses: number): number {
  return plannedRent - plannedExpenses;
}

/**
 * Calculate YTD totals from monthly data
 * This is the single source of truth for YTD calculations across the app
 */
export function calculateYTD(
  monthlyData: Array<{
    rent_income: number;
    maintenance: number;
    pool: number;
    garden: number;
    hoa_payments: number;
    property_tax: number;
    total_expenses: number;
    net_income: number;
  }>
) {
  return monthlyData.reduce(
    (acc, month) => ({
      rent_income: acc.rent_income + (month.rent_income || 0),
      maintenance: acc.maintenance + (month.maintenance || 0),
      pool: acc.pool + (month.pool || 0),
      garden: acc.garden + (month.garden || 0),
      hoa_payments: acc.hoa_payments + (month.hoa_payments || 0),
      property_tax: acc.property_tax + (month.property_tax || 0),
      total_expenses: acc.total_expenses + (month.total_expenses || 0),
      net_income: acc.net_income + (month.net_income || 0),
    }),
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
 * Helper to get just YTD gross income (rent income)
 * Convenience function that wraps calculateYTD
 */
export function calculateYTDGrossIncome(
  monthlyData: Array<{ rent_income: number }>
): number {
  return monthlyData.reduce((sum, m) => sum + (m.rent_income || 0), 0);
}

type PlannedYTDInput = {
  targetMonthlyRent: number;
  leaseStart: string | null | undefined;
  deposit: number;
  lastMonthRentCollected: boolean;
  performanceYear: number;
  monthsElapsed: number;
  plannedGardenMonthly: number;
  plannedPoolMonthly: number;
  plannedHoaAnnual: number;
  plannedPropertyTaxAnnual?: number;
};

/**
 * Calculate planned YTD totals based on property inputs and elapsed months
 */
export function calculatePlannedYTD({
  targetMonthlyRent,
  leaseStart,
  deposit,
  lastMonthRentCollected,
  performanceYear,
  monthsElapsed,
  plannedGardenMonthly,
  plannedPoolMonthly,
  plannedHoaAnnual,
  plannedPropertyTaxAnnual = 0,
}: PlannedYTDInput) {
  const months = Math.max(0, Math.min(12, Math.floor(monthsElapsed)));
  if (months === 0) {
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

  const startParts = leaseStart ? getDateOnlyParts(leaseStart) : null;
  const startInYear = !!startParts && startParts.year === performanceYear;
  const proration = startInYear ? getFirstMonthProration(leaseStart, performanceYear) : 1;

  const firstMonthRent = targetMonthlyRent * proration;
  const fullMonths = Math.max(0, months - 1);

  let rent_income = firstMonthRent + (fullMonths * targetMonthlyRent);
  if (deposit > 0 || lastMonthRentCollected) {
    rent_income += targetMonthlyRent;
  }

  const maintenance = calculatePlannedMaintenance(rent_income);
  const pool = plannedPoolMonthly * months;
  const garden = plannedGardenMonthly * months;
  const hoa_payments = (plannedHoaAnnual / 12) * months;
  const property_tax = (plannedPropertyTaxAnnual / 12) * months;
  const total_expenses = calculatePlannedExpenses(maintenance, pool, garden, hoa_payments, property_tax);
  const net_income = calculatePlannedNet(rent_income, total_expenses);

  return {
    rent_income,
    maintenance,
    pool,
    garden,
    hoa_payments,
    property_tax,
    total_expenses,
    net_income,
  };
}

/**
 * Calculate delta (actual YTD - planned YTD)
 */
export function calculateDelta(
  actualYTD: ReturnType<typeof calculateYTD>,
  plannedRent: number,
  plannedMaintenance: number,
  plannedPool: number,
  plannedGarden: number,
  plannedHoa: number,
  plannedPropertyTax: number
) {
  const plannedExpenses = calculatePlannedExpenses(
    plannedMaintenance,
    plannedPool,
    plannedGarden,
    plannedHoa,
    plannedPropertyTax
  );
  const plannedNet = calculatePlannedNet(plannedRent, plannedExpenses);

  return {
    rent_income: actualYTD.rent_income - plannedRent,
    maintenance: actualYTD.maintenance - plannedMaintenance,
    pool: actualYTD.pool - plannedPool,
    garden: actualYTD.garden - plannedGarden,
    hoa_payments: actualYTD.hoa_payments - plannedHoa,
    property_tax: actualYTD.property_tax - plannedPropertyTax,
    total_expenses: actualYTD.total_expenses - plannedExpenses,
    net_income: actualYTD.net_income - plannedNet,
  };
}

/**
 * Calculate appreciation within lease window only
 * @param marketValues - Array of { year, month, value } from monthly data
 * @param leaseStart - Lease start date
 * @param leaseEnd - Lease end date
 * @param costBasis - Fallback cost basis if no market values
 * @param currentEstimate - Fallback current estimate
 * @returns { value: number, pct: number }
 */
export function calculateLeaseAppreciation(
  marketValues: Array<{ year: number; month: number; value: number | null }>,
  leaseStart: string | null | undefined,
  leaseEnd: string | null | undefined,
  costBasis: number,
  currentEstimate: number
): { value: number; pct: number } {
  if (!leaseStart) {
    return { value: 0, pct: 0 };
  }

  const startDate = parseDateOnly(leaseStart);
  if (!startDate) {
    return { value: 0, pct: 0 };
  }
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const endDate = leaseEnd ? parseDateOnly(leaseEnd) : null;
  const effectiveEnd = endDate && endDate < todayUtc ? endDate : todayUtc;

  // Filter market values within lease window
  const leaseValues = marketValues.filter(mv => {
    if (!mv.value) return false;

    const mvDate = new Date(Date.UTC(mv.year, mv.month - 1, 1));
    return mvDate >= startDate && mvDate <= effectiveEnd;
  });

  // Get earliest and latest values within lease window
  let earliestValue = costBasis;
  let latestValue = currentEstimate;

  if (leaseValues.length > 0) {
    // Sort by date
    leaseValues.sort((a, b) => {
      const dateA = new Date(Date.UTC(a.year, a.month - 1, 1));
      const dateB = new Date(Date.UTC(b.year, b.month - 1, 1));
      return dateA.getTime() - dateB.getTime();
    });

    earliestValue = leaseValues[0].value || costBasis;
    latestValue = leaseValues[leaseValues.length - 1].value || currentEstimate;
  }

  const appreciationValue = latestValue - earliestValue;
  const appreciationPct = earliestValue > 0 ? (appreciationValue / earliestValue) * 100 : 0;

  return {
    value: appreciationValue,
    pct: appreciationPct,
  };
}

/**
 * Calculate purchase appreciation (from purchase date to today)
 */
export function calculatePurchaseAppreciation(
  marketValues: Array<{ year: number; month: number; value: number | null }>,
  purchaseDate: string | null | undefined,
  costBasis: number,
  currentEstimate: number
): { value: number; pct: number } {
  if (!purchaseDate) {
    return { value: 0, pct: 0 };
  }

  const startDate = parseDateOnly(purchaseDate);
  if (!startDate) {
    return { value: 0, pct: 0 };
  }
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  // Filter market values from purchase to today
  const purchaseValues = marketValues.filter(mv => {
    if (!mv.value) return false;

    const mvDate = new Date(Date.UTC(mv.year, mv.month - 1, 1));
    return mvDate >= startDate && mvDate <= todayUtc;
  });

  // Get earliest and latest values
  let earliestValue = costBasis;
  let latestValue = currentEstimate;

  if (purchaseValues.length > 0) {
    purchaseValues.sort((a, b) => {
      const dateA = new Date(Date.UTC(a.year, a.month - 1, 1));
      const dateB = new Date(Date.UTC(b.year, b.month - 1, 1));
      return dateA.getTime() - dateB.getTime();
    });

    earliestValue = purchaseValues[0].value || costBasis;
    latestValue = purchaseValues[purchaseValues.length - 1].value || currentEstimate;
  }

  const appreciationValue = latestValue - earliestValue;
  const appreciationPct = earliestValue > 0 ? (appreciationValue / earliestValue) * 100 : 0;

  return {
    value: appreciationValue,
    pct: appreciationPct,
  };
}

/**
 * Calculate appreciation during lease term (from lease_start to lease_end or today)
 * This shows the change in market value from when the lease started to now (or lease end)
 */
export function calculateAppreciationDuringLeaseTerm(
  marketValues: Array<{ year: number; month: number; value: number | null }>,
  leaseStart: string | null | undefined,
  leaseEnd: string | null | undefined,
  costBasis: number,
  currentEstimate: number
): { value: number; pct: number } {
  if (!leaseStart) {
    return { value: 0, pct: 0 };
  }

  const startDate = parseDateOnly(leaseStart);
  if (!startDate) {
    return { value: 0, pct: 0 };
  }
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const endDate = leaseEnd ? parseDateOnly(leaseEnd) : null;
  const resolvedEndDate = endDate ?? todayUtc;
  const effectiveEnd = resolvedEndDate < todayUtc ? resolvedEndDate : todayUtc;

  // Filter market values during lease period
  const leaseValues = marketValues.filter(mv => {
    if (!mv.value) return false;

    const mvDate = new Date(Date.UTC(mv.year, mv.month - 1, 1));
    return mvDate >= startDate && mvDate <= effectiveEnd;
  });

  // Sort by date
  leaseValues.sort((a, b) => {
    const dateA = new Date(Date.UTC(a.year, a.month - 1, 1));
    const dateB = new Date(Date.UTC(b.year, b.month - 1, 1));
    return dateA.getTime() - dateB.getTime();
  });

  // Get value at lease start and current/end
  let startValue = currentEstimate; // Default to current estimate if no data
  let endValue = currentEstimate;

  if (leaseValues.length > 0) {
    // Use first recorded value during lease as start
    startValue = leaseValues[0].value || currentEstimate;
    // Use last recorded value during lease as end
    endValue = leaseValues[leaseValues.length - 1].value || currentEstimate;
  }

  const appreciationValue = endValue - startValue;
  const appreciationPct = startValue > 0 ? (appreciationValue / startValue) * 100 : 0;

  return {
    value: appreciationValue,
    pct: appreciationPct,
  };
}

/**
 * ROI Calculations
 * Pre-Tax ROI = YTD Net Income / Cost Basis × 100
 * Post-Tax ROI = (YTD Net Income - Property Tax) / Cost Basis × 100
 */
export function calculatePreTaxROI(netIncome: number, costBasis: number): number {
  if (costBasis === 0) return 0;
  return (netIncome / costBasis) * 100;
}

export function calculatePostTaxROI(netIncome: number, propertyTax: number, costBasis: number): number {
  if (costBasis === 0) return 0;
  return ((netIncome - propertyTax) / costBasis) * 100;
}

export function calculateProjectedROI(yeTargetNetIncome: number, costBasis: number): number {
  if (costBasis === 0) return 0;
  return (yeTargetNetIncome / costBasis) * 100;
}

export function calculateProjectedPostTaxROI(
  yeTargetNetIncome: number,
  yeTargetPropertyTax: number,
  costBasis: number
): number {
  if (costBasis === 0) return 0;
  return ((yeTargetNetIncome + yeTargetPropertyTax) / costBasis) * 100;
}

/**
 * Calculate maintenance percentage of rent
 */
export function calculateMaintenancePercent(maintenance: number, rent: number): number {
  if (rent === 0) return 0;
  return (maintenance / rent) * 100;
}

/**
 * Calculate appreciation as percentage of cost basis
 */
export function calculateAppreciationPercent(appreciationValue: number, costBasis: number): number {
  if (costBasis === 0) return 0;
  return (appreciationValue / costBasis) * 100;
}

/**
 * Calculate comprehensive ROI including appreciation
 * ROI = (Net Income + Appreciation) / Cost Basis
 */
export function calculateComprehensiveROI(
  netIncome: number,
  appreciationValue: number,
  costBasis: number
): number {
  if (costBasis === 0) return 0;
  return ((netIncome + appreciationValue) / costBasis) * 100;
}

/**
 * Calculate comprehensive pre-tax ROI including appreciation
 * Pre-Tax ROI = (Net Income + Property Tax + Appreciation) / Cost Basis
 */
export function calculateComprehensivePreTaxROI(
  netIncome: number,
  propertyTax: number,
  appreciationValue: number,
  costBasis: number
): number {
  if (costBasis === 0) return 0;
  return ((netIncome + propertyTax + appreciationValue) / costBasis) * 100;
}

/**
 * Calculate total appreciation since purchase
 * Appreciation = Current Market Value - Cost Basis
 */
export function calculateTotalAppreciation(
  currentMarketValue: number,
  costBasis: number
): { value: number; pct: number } {
  const appreciationValue = currentMarketValue - costBasis;
  const appreciationPct = costBasis > 0 ? (appreciationValue / costBasis) * 100 : 0;

  return {
    value: appreciationValue,
    pct: appreciationPct,
  };
}

/**
 * Calculate ROI if home sold today
 * ROI if Sold = (Net Income YTD - Closing Costs + Appreciation) / Cost Basis
 */
export function calculateROIIfSoldToday(
  ytdNetIncome: number,
  closingCosts: number,
  appreciationValue: number,
  costBasis: number
): number {
  if (costBasis === 0) return 0;
  return ((ytdNetIncome - closingCosts + appreciationValue) / costBasis) * 100;
}

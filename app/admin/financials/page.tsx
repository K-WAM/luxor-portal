"use client";

import { useEffect, useState, useMemo } from "react";
import {
  calculateAppreciationDuringLeaseTerm,
  calculateTotalAppreciation,
} from "@/lib/financial-calculations";
import InvestmentPerformanceTable from "@/app/components/InvestmentPerformanceTable";
import { calculateCanonicalMetrics } from "@/lib/calculations/canonical-metrics";
import { PeriodToggle } from "@/app/components/ui/PeriodToggle";
import { getLeaseTermMonths, usePeriodFilter } from "@/app/hooks/usePeriodFilter";
import { formatDateOnly, getDateOnlyParts, parseDateOnly, toDateOnlyString } from "@/lib/date-only";

type Property = {
  id: string;
  address: string;
  home_cost?: number;
  home_repair_cost?: number;
  closing_costs?: number;
  total_cost?: number;
  current_market_estimate?: number;
  target_monthly_rent?: number;
  planned_garden_cost?: number;
  planned_pool_cost?: number;
  planned_hoa_cost?: number;
  planned_pm_fee_monthly?: number;
  purchase_date?: string;
  lease_start?: string;
  financials_updated_at?: string;
};

type MonthlyPerformance = {
  month: number;
  year: number;
  month_name: string;
  rent_income: number;
  maintenance: number;
  pool: number;
  garden: number;
  hoa_payments: number;
  pm_fee?: number;
  property_tax: number;
  total_expenses: number;
  net_income: number;
  property_market_estimate?: number | null;
  updated_at?: string | null;
  hasStoredRecord?: boolean;
  is_future?: boolean;
  notes?: string;
  rent_income_override?: number | null;
  property_tax_override?: number | null;
  market_value_override?: number | null;
  stored_rent_income?: number;
  stored_pool?: number;
  stored_garden?: number;
  stored_hoa_payments?: number;
  stored_pm_fee?: number;
  stored_property_tax?: number;
  stored_property_market_estimate?: number | null;
  billing_rent_income?: number;
  schedule_pool?: number | null;
  schedule_garden?: number | null;
  schedule_hoa_payments?: number | null;
  schedule_pm_fee?: number | null;
  rent_income_source?: "override" | "billing" | "schedule" | "stored" | "legacy_fallback" | "future_blank";
  pool_source?: "override" | "billing" | "schedule" | "stored" | "legacy_fallback" | "future_blank";
  garden_source?: "override" | "billing" | "schedule" | "stored" | "legacy_fallback" | "future_blank";
  hoa_payments_source?: "override" | "billing" | "schedule" | "stored" | "legacy_fallback" | "future_blank";
  pm_fee_source?: "override" | "billing" | "schedule" | "stored" | "legacy_fallback" | "future_blank";
  property_tax_source?: "override" | "billing" | "schedule" | "stored" | "legacy_fallback" | "future_blank";
  property_market_estimate_source?: "override" | "billing" | "schedule" | "stored" | "legacy_fallback" | "future_blank";
  isDirty?: boolean;
};

type LeaseAgreementFinance = {
  id: string | null;
  leaseStartDate: string | null;
  leaseEndDate: string | null;
  monthlyRent: number;
  deposit: number;
  lastMonthRentCollected: boolean;
  status: "upcoming" | "active" | "expired" | "terminated";
  tenantIds: string[];
  tenantNames: string[];
  tenantEmails: string[];
  source: "lease_agreements" | "legacy_property";
  priorLeaseId?: string | null;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type RecurringExpenseSchedule = {
  id: string;
  property_id: string;
  expense_type: "hoa" | "pool" | "garden" | "pm_fee";
  amount: number | string;
  frequency: "monthly" | "annual";
  effective_start_date: string;
  effective_end_date: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type RecurringExpenseForm = {
  expenseType: "hoa" | "pool" | "garden" | "pm_fee";
  amount: string;
  frequency: "monthly" | "annual";
  effectiveStartDate: string;
  effectiveEndDate: string;
  notes: string;
};

const EMPTY_RECURRING_EXPENSE_FORM: RecurringExpenseForm = {
  expenseType: "hoa",
  amount: "",
  frequency: "monthly",
  effectiveStartDate: "",
  effectiveEndDate: "",
  notes: "",
};

const sourceBadgeStyles: Record<
  NonNullable<MonthlyPerformance["rent_income_source"]>,
  string
> = {
  override: "bg-indigo-100 text-indigo-700",
  billing: "bg-emerald-100 text-emerald-700",
  schedule: "bg-blue-100 text-blue-700",
  stored: "bg-slate-100 text-slate-700",
  legacy_fallback: "bg-amber-100 text-amber-700",
  future_blank: "bg-slate-100 text-slate-500",
};

const sourceBadgeLabels: Record<
  NonNullable<MonthlyPerformance["rent_income_source"]>,
  string
> = {
  override: "Override",
  billing: "Billing",
  schedule: "Schedule",
  stored: "Stored",
  legacy_fallback: "Legacy",
  future_blank: "Future",
};

export default function FinancialsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"property" | "monthly">("property");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showFormulas, setShowFormulas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Property financial data
  const [propertyFinancials, setPropertyFinancials] = useState({
    home_cost: "",
    home_repair_cost: "",
    closing_costs: "",
    current_market_estimate: "",
    target_monthly_rent: "",
    planned_garden_cost: "",
    planned_pool_cost: "",
    planned_hoa_cost: "",
    planned_hoa_cost_2: "",
    planned_pm_fee_monthly: "",
    hoa_frequency: "monthly" as "monthly" | "quarterly",
    hoa_frequency_2: "monthly" as "monthly" | "quarterly",
    purchase_date: "",
    lease_start: "",
    lease_end: "",
    deposit: "",
    last_month_rent_collected: false,
  });
  const [leaseAgreements, setLeaseAgreements] = useState<LeaseAgreementFinance[]>([]);
  const [currentLease, setCurrentLease] = useState<LeaseAgreementFinance | null>(null);
  const [loadingLeases, setLoadingLeases] = useState(false);
  const [editingLeaseId, setEditingLeaseId] = useState<string | null>(null);
  const [leaseMetadataDraft, setLeaseMetadataDraft] = useState({
    deposit: "",
    last_month_rent_collected: false,
  });
  const [recurringSchedules, setRecurringSchedules] = useState<RecurringExpenseSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [newSchedule, setNewSchedule] = useState<RecurringExpenseForm>({ ...EMPTY_RECURRING_EXPENSE_FORM });
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, RecurringExpenseForm>>({});

  // Auto-calculated total cost (home + repair + closing)
  const calculatedTotalCost = useMemo(() => {
    const homeCost = parseFloat(propertyFinancials.home_cost) || 0;
    const repairCost = parseFloat(propertyFinancials.home_repair_cost) || 0;
    const closingCost = parseFloat(propertyFinancials.closing_costs) || 0;
    return homeCost + repairCost + closingCost;
  }, [propertyFinancials.home_cost, propertyFinancials.home_repair_cost, propertyFinancials.closing_costs]);

  // Auto-calculated annual HOA cost
  const calculatedAnnualHoa = useMemo(() => {
    const hoa1 = parseFloat(propertyFinancials.planned_hoa_cost) || 0;
    const hoa2 = parseFloat(propertyFinancials.planned_hoa_cost_2) || 0;
    const freq1Multiplier = propertyFinancials.hoa_frequency === "monthly" ? 12 : 4;
    const freq2Multiplier = propertyFinancials.hoa_frequency_2 === "monthly" ? 12 : 4;
    return (hoa1 * freq1Multiplier) + (hoa2 * freq2Multiplier);
  }, [
    propertyFinancials.planned_hoa_cost,
    propertyFinancials.planned_hoa_cost_2,
    propertyFinancials.hoa_frequency,
    propertyFinancials.hoa_frequency_2
  ]);

  // Annual targets - simplified to just YE Target
  const [targetYear, setTargetYear] = useState(new Date().getFullYear());
  const [yeTarget, setYeTarget] = useState({
    rent_income: "",
    maintenance: "",
    pool: "",
    garden: "",
    hoa: "",
    property_tax: "",
  });


  // Monthly performance
  const [performanceYear, setPerformanceYear] = useState(new Date().getFullYear());
  const [allMonthlyData, setAllMonthlyData] = useState<MonthlyPerformance[]>([]);
  const [lastMonthlyUpdate, setLastMonthlyUpdate] = useState<string | null>(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [financialsLoaded, setFinancialsLoaded] = useState(false);
  const [selectedMonthlyEditorKey, setSelectedMonthlyEditorKey] = useState<string>("");

  // Sale closing costs (for ROI if sold calculation)
  const [saleClosingCosts, setSaleClosingCosts] = useState("");

  // Period filter hook for YTD vs Lease Term toggle
  const { periodType, setPeriodType, label: periodLabel } = usePeriodFilter({
    leaseStart: propertyFinancials.lease_start || null,
    leaseEnd: propertyFinancials.lease_end || null,
    currentYear: performanceYear
  });

  const periodLabelShort = useMemo(() => {
    if (periodType === "ytd") return `YTD ${performanceYear}`;
    if (periodType === "alltime") return "All Time";
    return "Lease Term";
  }, [periodType, performanceYear]);

  const daysInMonth = (year: number, monthIndex0: number) => {
    return new Date(year, monthIndex0 + 1, 0).getDate();
  };

  const toUtcDateOnly = (date: Date) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  const diffMonthsInclusive = (start: Date, end: Date) => {
    let months =
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth()) +
      1;
    if (end.getUTCDate() < start.getUTCDate()) months -= 1;
    return Math.max(0, months);
  };

  const getLeaseTimelineStats = (startStr?: string, endStr?: string) => {
    const start = parseDateOnly(startStr);
    const end = parseDateOnly(endStr);
    if (!start || !end) {
      return { monthsElapsed: 0, monthsRemaining: 0, totalMonths: 0 };
    }

    const today = toUtcDateOnly(new Date());
    const effective = today < start ? start : today > end ? end : today;
    const totalMonths = diffMonthsInclusive(start, end);
    const elapsedMonths = diffMonthsInclusive(start, effective);

    return {
      monthsElapsed: Math.min(totalMonths, elapsedMonths),
      monthsRemaining: Math.max(0, totalMonths - elapsedMonths),
      totalMonths,
    };
  };

  const { monthsElapsed: monthsElapsedLease, monthsRemaining } = useMemo(
    () => getLeaseTimelineStats(propertyFinancials.lease_start, propertyFinancials.lease_end),
    [propertyFinancials.lease_start, propertyFinancials.lease_end]
  );

  const plannedYtd = useMemo(() => {
    const rentMonthly = parseFloat(propertyFinancials.target_monthly_rent) || 0;
    const poolMonthly = parseFloat(propertyFinancials.planned_pool_cost) || 0;
    const gardenMonthly = parseFloat(propertyFinancials.planned_garden_cost) || 0;
    const pmFeeMonthly = parseFloat(propertyFinancials.planned_pm_fee_monthly) || 0;
    const hoaAnnual = calculatedAnnualHoa || 0;
    const lastMonthCollected = !!propertyFinancials.last_month_rent_collected;
    const leaseStart = propertyFinancials.lease_start ? getDateOnlyParts(propertyFinancials.lease_start) : null;
    const leaseEnd = propertyFinancials.lease_end ? getDateOnlyParts(propertyFinancials.lease_end) : null;

    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1; // 1-based

    const zeroPlan = {
      monthsElapsed: 0, rent_income: 0, maintenance: 0, pool: 0, garden: 0,
      hoa_payments: 0, pm_fee: 0, property_tax: 0, total_expenses: 0, net_income: 0,
    };

    if (!leaseStart) return zeroPlan;

    // Determine plan date range based on selected period
    let planStart: { year: number; month: number } | null = null;
    let planEnd: { year: number; month: number } | null = null;

    if (periodType === "ytd") {
      if (performanceYear > todayYear) return zeroPlan;
      // Start at lease start month (if lease started this year) or Jan 1
      if (leaseStart.year > performanceYear) return zeroPlan;
      const ytdStartMonth = leaseStart.year === performanceYear ? leaseStart.month : 1;
      planStart = { year: performanceYear, month: ytdStartMonth };
      planEnd = { year: performanceYear, month: performanceYear === todayYear ? todayMonth : 12 };
    } else {
      // lease and alltime: from lease start through today (capped at lease_end for "lease")
      planStart = { year: leaseStart.year, month: leaseStart.month };
      if (periodType === "lease" && leaseEnd) {
        const leaseEndPassed = leaseEnd.year < todayYear || (leaseEnd.year === todayYear && leaseEnd.month <= todayMonth);
        planEnd = leaseEndPassed
          ? { year: leaseEnd.year, month: leaseEnd.month }
          : { year: todayYear, month: todayMonth };
      } else {
        planEnd = { year: todayYear, month: todayMonth };
      }
    }

    if (!planStart || !planEnd) return zeroPlan;
    if (planEnd.year < planStart.year || (planEnd.year === planStart.year && planEnd.month < planStart.month)) return zeroPlan;

    // Build ordered list of (year, month) pairs
    const planMonths: Array<{ year: number; month: number }> = [];
    let y = planStart.year;
    let m = planStart.month;
    while (y < planEnd.year || (y === planEnd.year && m <= planEnd.month)) {
      planMonths.push({ year: y, month: m });
      m++;
      if (m > 12) { m = 1; y++; }
    }

    if (planMonths.length === 0) return zeroPlan;

    // Pure plan rent: target_monthly_rent x months, prorated for lease-start month.
    // Deposit (last month's rent collected upfront) added to lease-start month when checked.
    let rent_income = 0;
    for (const { year, month } of planMonths) {
      const isLeaseStartMonth = year === leaseStart.year && month === leaseStart.month;
      if (isLeaseStartMonth) {
        const dim = daysInMonth(year, month - 1);
        const daysRemaining = dim - leaseStart.day + 1;
        rent_income += rentMonthly * (daysRemaining / dim);
        if (lastMonthCollected) rent_income += rentMonthly; // deposit in lease-start month
      } else {
        rent_income += rentMonthly;
      }
    }

    const monthsElapsedPlanned = planMonths.length;
    const maintenance = rent_income * 0.05;
    const pool = poolMonthly * monthsElapsedPlanned;
    const garden = gardenMonthly * monthsElapsedPlanned;
    const hoa_payments = (hoaAnnual / 12) * monthsElapsedPlanned;
    const pm_fee = pmFeeMonthly * monthsElapsedPlanned;
    const property_tax = 0;
    const total_expenses = maintenance + pool + garden + hoa_payments + pm_fee;
    const net_income = rent_income - total_expenses;

    return {
      monthsElapsed: monthsElapsedPlanned,
      rent_income,
      maintenance,
      pool,
      garden,
      hoa_payments,
      pm_fee,
      property_tax,
      total_expenses,
      net_income,
    };
  }, [
    periodType,
    performanceYear,
    calculatedAnnualHoa,
    propertyFinancials.lease_start,
    propertyFinancials.lease_end,
    propertyFinancials.target_monthly_rent,
    propertyFinancials.planned_pool_cost,
    propertyFinancials.planned_garden_cost,
    propertyFinancials.planned_pm_fee_monthly,
    propertyFinancials.last_month_rent_collected,
  ]);

  const monthsElapsedPurchase = useMemo(() => {
    if (!propertyFinancials.purchase_date) return 0;
    const start = parseDateOnly(propertyFinancials.purchase_date);
    if (!start) return 0;
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (today < start) return 0;
    let months = (today.getUTCFullYear() - start.getUTCFullYear()) * 12;
    months += today.getUTCMonth() - start.getUTCMonth();
    if (today.getUTCDate() >= start.getUTCDate()) months += 1;
    return Math.max(0, months);
  }, [propertyFinancials.purchase_date]);

  const sortedMonthlyData = useMemo(() => {
    return [...allMonthlyData].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }, [allMonthlyData]);

  const displayMonthlyData = useMemo(() => {
    if (!sortedMonthlyData.length) return [];

    if (periodType === "lease" && propertyFinancials.lease_start && propertyFinancials.lease_end) {
      const leaseMonths = getLeaseTermMonths(propertyFinancials.lease_start, propertyFinancials.lease_end);
      const leaseKeys = new Set(leaseMonths.map(m => `${m.year}-${m.month}`));
      return sortedMonthlyData.filter(row => leaseKeys.has(`${row.year}-${row.month}`));
    }

    if (periodType === "alltime") {
      const lastPaidIndex = sortedMonthlyData.reduce((idx, row, i) => {
        return row.rent_income > 0 ? i : idx;
      }, -1);
      if (lastPaidIndex >= 0) {
        return sortedMonthlyData.slice(0, lastPaidIndex + 1);
      }
      return sortedMonthlyData;
    }

    // YTD: filter to the selected year for the table view
    return sortedMonthlyData.filter(row => row.year === performanceYear);
  }, [
    sortedMonthlyData,
    periodType,
    performanceYear,
    propertyFinancials.lease_start,
    propertyFinancials.lease_end,
  ]);

  useEffect(() => {
    if (!displayMonthlyData.length) {
      setSelectedMonthlyEditorKey("");
      return;
    }

    const hasSelectedMonth = displayMonthlyData.some(
      (row) => `${row.year}-${row.month}` === selectedMonthlyEditorKey
    );
    if (!hasSelectedMonth) {
      setSelectedMonthlyEditorKey(
        `${displayMonthlyData[0].year}-${displayMonthlyData[0].month}`
      );
    }
  }, [displayMonthlyData, selectedMonthlyEditorKey]);

  const canonicalMetrics = useMemo(() => {
    const estimatedAnnualPropertyTax = parseFloat(yeTarget.property_tax) || 0;
    const monthlyForCalc = displayMonthlyData.map(m => ({
      ...m,
      property_market_estimate: m.property_market_estimate ?? null,
    }));

    return calculateCanonicalMetrics(
      {
        home_cost: parseFloat(propertyFinancials.home_cost) || 0,
        home_repair_cost: parseFloat(propertyFinancials.home_repair_cost) || 0,
        closing_costs: parseFloat(propertyFinancials.closing_costs) || 0,
        total_cost: calculatedTotalCost,
        current_market_estimate: parseFloat(propertyFinancials.current_market_estimate) || 0,
        purchase_date: propertyFinancials.purchase_date || null,
        lease_start: propertyFinancials.lease_start || null,
        lease_end: propertyFinancials.lease_end || null,
        target_monthly_rent: parseFloat(propertyFinancials.target_monthly_rent) || 0,
        deposit: parseFloat(propertyFinancials.deposit) || 0,
        last_month_rent_collected: propertyFinancials.last_month_rent_collected,
      },
      monthlyForCalc,
      {
        estimatedAnnualPropertyTax,
        // Data is pre-filtered; multiYear prevents year-only filtering for lease/all-time.
        multiYear: periodType !== "ytd"
      }
    );
  }, [
    displayMonthlyData,
    propertyFinancials.home_cost,
    propertyFinancials.home_repair_cost,
    propertyFinancials.closing_costs,
    propertyFinancials.current_market_estimate,
    propertyFinancials.purchase_date,
    propertyFinancials.lease_start,
    propertyFinancials.lease_end,
    propertyFinancials.target_monthly_rent,
    propertyFinancials.deposit,
    propertyFinancials.last_month_rent_collected,
    calculatedTotalCost,
    yeTarget.property_tax,
    periodType,
  ]);

  const actualYtd = useMemo(() => canonicalMetrics.ytd, [canonicalMetrics]);

  // Last-month rent deposit bonus (collected upfront at lease start, covers last month)
  const lastMonthRentBonus = useMemo(() => {
    if (!propertyFinancials.last_month_rent_collected) return 0;
    const rent = parseFloat(propertyFinancials.target_monthly_rent) || 0;
    if (rent > 0) return rent;
    const deposit = parseFloat(propertyFinancials.deposit) || 0;
    return deposit;
  }, [propertyFinancials.last_month_rent_collected, propertyFinancials.target_monthly_rent, propertyFinancials.deposit]);

  // Year the deposit was physically collected (lease-start year)
  const leaseStartYear = useMemo(() => {
    if (!propertyFinancials.lease_start) return null;
    const parts = getDateOnlyParts(propertyFinancials.lease_start);
    return parts?.year ?? null;
  }, [propertyFinancials.lease_start]);

  // Show deposit breakdown sub-row when deposit is physically in the current period's data:
  // alltime/lease views always include lease-start month; ytd only when viewing the lease-start year.
  const showDepositBreakdown = useMemo(() => {
    if (lastMonthRentBonus <= 0) return false;
    if (periodType !== "ytd") return true; // alltime and lease always include lease-start month
    return performanceYear === leaseStartYear;
  }, [lastMonthRentBonus, periodType, performanceYear, leaseStartYear]);

  // YTD appreciation: earliest -> latest market value entered in performanceYear
  const ytdAppreciation = useMemo(() => {
    const yearData = allMonthlyData.filter(
      (m: any) => m.year === performanceYear && m.property_market_estimate && m.property_market_estimate > 0
    ).sort((a: any, b: any) => a.month - b.month);
    if (yearData.length === 0) return { value: 0, pct: 0, hasData: false, earliestMonth: null as number | null };
    const earliest = yearData[0].property_market_estimate as number;
    const latest = yearData[yearData.length - 1].property_market_estimate as number;
    const value = latest - earliest;
    // Excel I33: pct = delta / cost_basis (not / earliest market value)
    const pct = calculatedTotalCost > 0 ? (value / calculatedTotalCost) * 100 : 0;
    return { value, pct, hasData: true, earliestMonth: yearData[0].month as number };
  }, [allMonthlyData, performanceYear]);

  const ytdAppreciationLabel = useMemo(() => {
    if (!ytdAppreciation.hasData || !ytdAppreciation.earliestMonth) return null;
    return new Date(performanceYear, ytdAppreciation.earliestMonth - 1).toLocaleString("default", { month: "short" });
  }, [ytdAppreciation.hasData, ytdAppreciation.earliestMonth, performanceYear]);

  // Label for the lease-end month, used to annotate the last-month deposit row in the table
  const leaseEndMonthLabel = useMemo(() => {
    if (!propertyFinancials.lease_end || lastMonthRentBonus <= 0) return null;
    const parts = getDateOnlyParts(propertyFinancials.lease_end);
    if (!parts) return null;
    return new Date(parts.year, parts.month - 1).toLocaleString("default", { month: "short", year: "numeric" });
  }, [propertyFinancials.lease_end, lastMonthRentBonus]);

  // Appreciation gain metrics (used in InvestmentPerformanceTable)
  const appreciationGains = useMemo(() => {
    const monthsOwned = canonicalMetrics.months_owned;
    const appreciationValue = canonicalMetrics.appreciation_value;
    const costBasis = canonicalMetrics.cost_basis;
    const monthly = monthsOwned > 0 ? appreciationValue / monthsOwned : 0;
    const annualized = monthly * 12;
    return {
      monthlyGain: monthly,
      monthlyGainPct: costBasis > 0 ? (monthly / costBasis * 100) : 0,
      annualizedGain: annualized,
      annualizedGainPct: costBasis > 0 ? (annualized / costBasis * 100) : 0,
    };
  }, [canonicalMetrics.months_owned, canonicalMetrics.appreciation_value, canonicalMetrics.cost_basis]);

  // Expected full-year plan (based on planned inputs) - shown in post-save summary
  const annualPlan = useMemo(() => {
    const rent = (parseFloat(propertyFinancials.target_monthly_rent) || 0) * 12;
    const maintenance = rent * 0.05;
    const pool = (parseFloat(propertyFinancials.planned_pool_cost) || 0) * 12;
    const garden = (parseFloat(propertyFinancials.planned_garden_cost) || 0) * 12;
    const hoa = calculatedAnnualHoa;
    const pmFee = (parseFloat(propertyFinancials.planned_pm_fee_monthly) || 0) * 12;
    const propertyTax = parseFloat(yeTarget.property_tax) || 0;
    const totalExpenses = maintenance + pool + garden + hoa + pmFee;
    const netIncome = rent - totalExpenses;
    return { rent, maintenance, pool, garden, hoa, pmFee, propertyTax, totalExpenses, netIncome };
  }, [propertyFinancials.target_monthly_rent, propertyFinancials.planned_pool_cost, propertyFinancials.planned_garden_cost, propertyFinancials.planned_pm_fee_monthly, calculatedAnnualHoa, yeTarget.property_tax]);

  // Calculate appreciation metrics using helper functions
  const purchaseAppreciation = useMemo(() => {
    // Get most recent market value from monthly data
    const sortedMonthlyData = [...allMonthlyData].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
    const mostRecentMarketValue = sortedMonthlyData.find(m => m.property_market_estimate)?.property_market_estimate
      || parseFloat(propertyFinancials.current_market_estimate)
      || calculatedTotalCost;

    // Calculate total appreciation (Market Value - Cost Basis)
    return calculateTotalAppreciation(mostRecentMarketValue, calculatedTotalCost);
  }, [allMonthlyData, propertyFinancials.current_market_estimate, calculatedTotalCost]);

  // Appreciation during lease term (separate from lease appreciation)
  const appreciationDuringLeaseTerm = useMemo(() => {
    const marketValues = allMonthlyData.map(m => ({
      year: m.year,
      month: m.month,
      value: m.property_market_estimate || null,
    }));

    return calculateAppreciationDuringLeaseTerm(
      marketValues,
      propertyFinancials.lease_start,
      propertyFinancials.lease_end,
      calculatedTotalCost,
      parseFloat(propertyFinancials.current_market_estimate) || calculatedTotalCost
    );
  }, [allMonthlyData, propertyFinancials.current_market_estimate, propertyFinancials.lease_start, propertyFinancials.lease_end, calculatedTotalCost]);

  useEffect(() => {
    loadProperties();
  }, []);

  useEffect(() => {
    if (selectedProperty) {
      setFinancialsLoaded(false);
      loadPropertyFinancials();
      loadAnnualTargets();
    }
  }, [selectedProperty, targetYear, performanceYear]);

  useEffect(() => {
    if (selectedProperty) {
      loadLeaseFinancials();
      loadRecurringSchedules();
      setEditingLeaseId(null);
      setEditingScheduleId(null);
    }
  }, [selectedProperty]);

  useEffect(() => {
    if (selectedProperty && financialsLoaded) {
      loadAllMonthlyPerformance();
    }
  }, [
    selectedProperty,
    performanceYear,
    propertyFinancials.lease_start,
    propertyFinancials.lease_end,
    propertyFinancials.purchase_date,
    financialsLoaded,
    periodType,
  ]);

  // Auto-populate YE Target from property planned costs and auto-calculate maintenance at 5%
  useEffect(() => {
    const monthlyRent = parseFloat(propertyFinancials.target_monthly_rent) || 0;
    const gardenCost = parseFloat(propertyFinancials.planned_garden_cost) || 0;
    const poolCost = parseFloat(propertyFinancials.planned_pool_cost) || 0;

    if (monthlyRent > 0) {
      // Calculate annual rent
      const annualRent = monthlyRent * 12;

      // ALWAYS calculate maintenance as 5% of annual rent (auto-calculated, not manual)
      const maintenanceEstimate = annualRent * 0.05;

      // ALWAYS calculate annual costs
      const annualGarden = gardenCost * 12;
      const annualPool = poolCost * 12;
      // Use calculated annual HOA (handles both HOA inputs with frequencies)
      const annualHoa = calculatedAnnualHoa;

      setYeTarget(prev => ({
        ...prev,
        rent_income: annualRent.toString(),
        maintenance: maintenanceEstimate.toFixed(2),
        garden: annualGarden.toFixed(2),
        pool: annualPool.toFixed(2),
        hoa: annualHoa.toFixed(2),
      }));
    }
  }, [propertyFinancials, calculatedAnnualHoa]);

  const loadProperties = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/properties");
      const data = await res.json();
      if (!res.ok) throw new Error("Failed to load properties");
      setProperties(data);
      if (data.length > 0 && !selectedProperty) {
        setSelectedProperty(data[0].id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load properties");
    } finally {
      setLoading(false);
    }
  };

  const loadPropertyFinancials = async () => {
    try {
      const res = await fetch(`/api/admin/financials/property?propertyId=${selectedProperty}`);
      const data = await res.json();
      if (res.ok && data) {
        setPropertyFinancials({
          home_cost: data.home_cost?.toString() || "",
          home_repair_cost: data.home_repair_cost?.toString() || "",
          closing_costs: data.closing_costs?.toString() || "",
          current_market_estimate: data.current_market_estimate?.toString() || "",
          target_monthly_rent: data.target_monthly_rent?.toString() || "",
          planned_garden_cost: data.planned_garden_cost?.toString() || "",
          planned_pool_cost: data.planned_pool_cost?.toString() || "",
          planned_hoa_cost: data.planned_hoa_cost?.toString() || "",
          planned_hoa_cost_2: data.planned_hoa_cost_2?.toString() || "",
          planned_pm_fee_monthly: data.planned_pm_fee_monthly?.toString() || "",
          hoa_frequency: (data.hoa_frequency as "monthly" | "quarterly") || "monthly",
          hoa_frequency_2: (data.hoa_frequency_2 as "monthly" | "quarterly") || "monthly",
          purchase_date: toDateOnlyString(data.purchase_date) || "",
          lease_start: toDateOnlyString(data.lease_start) || "",
          lease_end: toDateOnlyString(data.lease_end) || "",
          deposit: data.deposit?.toString() || "",
          last_month_rent_collected: !!data.last_month_rent_collected,
        });
        setFinancialsLoaded(true);
      }
    } catch (err: any) {
      console.error("Error loading property financials:", err);
    }
  };

  const loadAnnualTargets = async () => {
    try {
      const res = await fetch(`/api/admin/financials/targets?propertyId=${selectedProperty}&year=${targetYear}`);
      const data = await res.json();
      if (res.ok && data && data.ye_target) {
        setYeTarget({
          rent_income: data.ye_target.rent_income?.toString() || "",
          maintenance: data.ye_target.maintenance?.toString() || "",
          pool: data.ye_target.pool?.toString() || "",
          garden: data.ye_target.garden?.toString() || "",
          hoa: data.ye_target.hoa?.toString() || "",
          property_tax: data.ye_target.property_tax?.toString() || "",
        });
      }
    } catch (err: any) {
      console.error("Error loading annual targets:", err);
    }
  };

  const loadLeaseFinancials = async () => {
    try {
      setLoadingLeases(true);
      const res = await fetch(`/api/admin/lease-agreements?propertyId=${selectedProperty}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load lease agreements");

      const agreements = (data.agreements || []) as LeaseAgreementFinance[];
      const nextCurrentLease = (data.currentLease || null) as LeaseAgreementFinance | null;
      setLeaseAgreements(agreements);
      setCurrentLease(nextCurrentLease);

      if (nextCurrentLease) {
        setPropertyFinancials((prev) => ({
          ...prev,
          lease_start: toDateOnlyString(nextCurrentLease.leaseStartDate) || "",
          lease_end: toDateOnlyString(nextCurrentLease.leaseEndDate) || "",
          target_monthly_rent: nextCurrentLease.monthlyRent ? String(nextCurrentLease.monthlyRent) : "",
          deposit: nextCurrentLease.deposit ? String(nextCurrentLease.deposit) : "",
          last_month_rent_collected: !!nextCurrentLease.lastMonthRentCollected,
        }));
      }
    } catch (err) {
      console.error("Error loading lease financials:", err);
      setError((err as Error).message || "Failed to load lease agreements");
    } finally {
      setLoadingLeases(false);
    }
  };

  const loadRecurringSchedules = async () => {
    try {
      setLoadingSchedules(true);
      const res = await fetch(`/api/admin/financials/recurring-expenses?propertyId=${selectedProperty}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load recurring expense schedules");
      setRecurringSchedules(data || []);
    } catch (err) {
      console.error("Error loading recurring expense schedules:", err);
      setError((err as Error).message || "Failed to load recurring expense schedules");
    } finally {
      setLoadingSchedules(false);
    }
  };

  const loadAllMonthlyPerformance = async () => {
    try {
      setLoadingMonthly(true);
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const leaseStartParts = propertyFinancials.lease_start
        ? getDateOnlyParts(propertyFinancials.lease_start)
        : null;
      const leaseEndParts = propertyFinancials.lease_end
        ? getDateOnlyParts(propertyFinancials.lease_end)
        : null;
      const purchaseParts = propertyFinancials.purchase_date
        ? getDateOnlyParts(propertyFinancials.purchase_date)
        : null;

      const buildMonthsInRange = (
        start: { year: number; month: number },
        end: { year: number; month: number }
      ) => {
        if (end.year < start.year || (end.year === start.year && end.month < start.month)) {
          return [];
        }
        const months: { month: number; year: number; month_name: string }[] = [];
        let year = start.year;
        let month = start.month;
        while (year < end.year || (year === end.year && month <= end.month)) {
          months.push({
            month,
            year,
            month_name: `${monthNames[month - 1]} ${year}`,
          });
          month += 1;
          if (month > 12) {
            month = 1;
            year += 1;
          }
        }
        return months;
      };

      let monthsToLoad: { month: number; year: number; month_name: string }[] = [];

      if (periodType === "lease" && leaseStartParts && leaseEndParts) {
        monthsToLoad = buildMonthsInRange(leaseStartParts, leaseEndParts);
      } else if (periodType === "alltime") {
        const start = purchaseParts || leaseStartParts || { year: performanceYear, month: 1 };
        const now = new Date();
        const end = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
        monthsToLoad = buildMonthsInRange(start, end);
      } else {
        const start = { year: performanceYear, month: 1 };
        const end = { year: performanceYear, month: 12 };
        monthsToLoad = buildMonthsInRange(start, end);
      }

      // Fallback to Jan-Dec if range is invalid or empty
      if (monthsToLoad.length === 0) {
        monthsToLoad = monthNames.map((name, idx) => ({
          month: idx + 1,
          year: performanceYear,
          month_name: `${name} ${performanceYear}`,
        }));
      }

      const rangeStart = monthsToLoad[0];
      const rangeEnd = monthsToLoad[monthsToLoad.length - 1];
      const params = new URLSearchParams({
        propertyId: selectedProperty,
        startYear: String(rangeStart.year),
        startMonth: String(rangeStart.month),
        endYear: String(rangeEnd.year),
        endMonth: String(rangeEnd.month),
      });

      const res = await fetch(`/api/admin/financials/monthly?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load monthly performance");
      }

      const resultMap = new Map<string, MonthlyPerformance>();
      for (const row of (data.rows || []) as MonthlyPerformance[]) {
        resultMap.set(`${row.year}-${row.month}`, row);
      }

      const results = monthsToLoad.map(({ month, year, month_name }) => {
        const row = resultMap.get(`${year}-${month}`);
        if (row) {
          return {
            ...row,
            month,
            year,
            month_name,
            isDirty: false,
          };
        }
        return {
          month,
          year,
          month_name,
          rent_income: 0,
          maintenance: 0,
          pool: 0,
          garden: 0,
          hoa_payments: 0,
          pm_fee: 0,
          property_tax: 0,
          total_expenses: 0,
          net_income: 0,
          property_market_estimate: null,
          updated_at: null,
          hasStoredRecord: false,
          is_future: false,
          notes: "",
          rent_income_override: null,
          property_tax_override: null,
          market_value_override: null,
          stored_rent_income: 0,
          stored_pool: 0,
          stored_garden: 0,
          stored_hoa_payments: 0,
          stored_pm_fee: 0,
          stored_property_tax: 0,
          stored_property_market_estimate: null,
          billing_rent_income: 0,
          schedule_pool: null,
          schedule_garden: null,
          schedule_hoa_payments: null,
          schedule_pm_fee: null,
          rent_income_source: "stored",
          pool_source: "stored",
          garden_source: "stored",
          hoa_payments_source: "stored",
          pm_fee_source: "stored",
          property_tax_source: "stored",
          property_market_estimate_source: "stored",
          isDirty: false,
        } satisfies MonthlyPerformance;
      });

      setAllMonthlyData(results);

      // Find most recent update
      const mostRecent = results
        .filter(r => r.updated_at)
        .sort((a, b) => new Date(b.updated_at!).getTime() - new Date(a.updated_at!).getTime())[0];

      if (mostRecent) {
        setLastMonthlyUpdate(mostRecent.updated_at!);
      }
    } catch (err: any) {
      console.error("Error loading monthly performance:", err);
    } finally {
      setLoadingMonthly(false);
    }
  };

  const savePropertyFinancials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
    const res = await fetch("/api/admin/financials/property", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId: selectedProperty,
        home_cost: propertyFinancials.home_cost,
        home_repair_cost: propertyFinancials.home_repair_cost,
        closing_costs: propertyFinancials.closing_costs,
        current_market_estimate: propertyFinancials.current_market_estimate,
        purchase_date: propertyFinancials.purchase_date,
      }),
    });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save property financials");
      }

      // Also save the annual targets (property_tax field lives here)
      await fetch("/api/admin/financials/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: selectedProperty,
          year: targetYear,
          plan: {},
          ye_target: {
            rent_income: parseFloat(yeTarget.rent_income) || null,
            maintenance: parseFloat(yeTarget.maintenance) || null,
            pool: parseFloat(yeTarget.pool) || null,
            garden: parseFloat(yeTarget.garden) || null,
            hoa: parseFloat(yeTarget.hoa) || null,
            property_tax: parseFloat(yeTarget.property_tax) || null,
            maintenance_percentage_target: 5,
          },
        }),
      });

      setSuccess("Property financials saved successfully!");
      await loadPropertyFinancials();
      await loadProperties(); // Reload to get updated timestamps
    } catch (err: any) {
      setError(err.message || "Failed to save property financials");
    } finally {
      setSaving(false);
    }
  };


  const recalculateMonthlyDraft = (row: MonthlyPerformance): MonthlyPerformance => {
    const rentIncome =
      row.rent_income_override !== null && row.rent_income_override !== undefined
        ? row.rent_income_override
        : row.rent_income_source === "billing"
          ? row.billing_rent_income || 0
          : row.stored_rent_income || 0;

    const pool =
      row.pool_source === "schedule"
        ? row.schedule_pool || 0
        : row.pool_source === "legacy_fallback"
          ? row.pool
          : row.stored_pool || row.pool || 0;

    const garden =
      row.garden_source === "schedule"
        ? row.schedule_garden || 0
        : row.garden_source === "legacy_fallback"
          ? row.garden
          : row.stored_garden || row.garden || 0;

    const hoa =
      row.hoa_payments_source === "schedule"
        ? row.schedule_hoa_payments || 0
        : row.hoa_payments_source === "legacy_fallback"
          ? row.hoa_payments
          : row.stored_hoa_payments || row.hoa_payments || 0;

    const pmFee =
      row.pm_fee_source === "schedule"
        ? row.schedule_pm_fee || 0
        : row.pm_fee_source === "legacy_fallback"
          ? row.pm_fee || 0
          : row.stored_pm_fee || row.pm_fee || 0;

    const propertyTax =
      row.property_tax_override !== null && row.property_tax_override !== undefined
        ? row.property_tax_override
        : row.stored_property_tax || 0;

    const marketValue =
      row.market_value_override !== null && row.market_value_override !== undefined
        ? row.market_value_override
        : row.stored_property_market_estimate ?? null;

    const totalExpenses = (row.maintenance || 0) + pool + garden + hoa + pmFee;
    const netIncome = rentIncome - totalExpenses;

    return {
      ...row,
      rent_income: rentIncome,
      pool,
      garden,
      hoa_payments: hoa,
      pm_fee: pmFee,
      property_tax: propertyTax,
      property_market_estimate: marketValue,
      total_expenses: totalExpenses,
      net_income: netIncome,
      rent_income_source:
        row.rent_income_override !== null && row.rent_income_override !== undefined
          ? "override"
          : row.rent_income_source === "billing"
            ? "billing"
            : row.rent_income_source === "future_blank"
              ? "future_blank"
              : "stored",
      property_tax_source:
        row.property_tax_override !== null && row.property_tax_override !== undefined
          ? "override"
          : "stored",
      property_market_estimate_source:
        row.market_value_override !== null && row.market_value_override !== undefined
          ? "override"
          : "stored",
    };
  };

  const updateMonthlyDraft = (
    monthKey: string,
    patch: Partial<Pick<MonthlyPerformance, "maintenance" | "rent_income_override" | "property_tax_override" | "market_value_override" | "notes">>
  ) => {
    setAllMonthlyData((prev) =>
      prev.map((row) => {
        if (`${row.year}-${row.month}` !== monthKey) return row;
        return recalculateMonthlyDraft({
          ...row,
          ...patch,
          isDirty: true,
        });
      })
    );
  };

  const hasMeaningfulMonthlyEdits = (row: MonthlyPerformance) =>
    !!row.hasStoredRecord ||
    (row.maintenance || 0) !== 0 ||
    row.rent_income_override !== null ||
    row.property_tax_override !== null ||
    row.market_value_override !== null ||
    !!String(row.notes || "").trim();

  const saveAllMonthlyPerformance = async () => {
    if (displayMonthlyData.length === 0) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const rowsToSave = displayMonthlyData.filter(
        (monthData) => monthData.isDirty && hasMeaningfulMonthlyEdits(monthData)
      );

      if (!rowsToSave.length) {
        setSuccess("No monthly override changes to save.");
        return;
      }

      for (const monthData of rowsToSave) {
        const res = await fetch("/api/admin/financials/monthly", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyId: selectedProperty,
            year: monthData.year,
            month: monthData.month,
            maintenance: monthData.maintenance || 0,
            rent_income_override: monthData.rent_income_override,
            property_tax_override: monthData.property_tax_override,
            market_value_override: monthData.market_value_override,
            notes: monthData.notes || null,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to save ${monthData.month_name}`);
        }
      }
      setSuccess("Monthly performance overrides saved successfully.");
      await loadAllMonthlyPerformance();
    } catch (err: any) {
      setError(err.message || "Failed to save monthly performance");
    } finally {
      setSaving(false);
    }
  };

  const selectedMonthlyEditorRow = useMemo(
    () =>
      displayMonthlyData.find(
        (row) => `${row.year}-${row.month}` === selectedMonthlyEditorKey
      ) || null,
    [displayMonthlyData, selectedMonthlyEditorKey]
  );

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString();
  };

  const formatExpenseType = (expenseType: string) => {
    switch (expenseType) {
      case "hoa":
        return "HOA";
      case "pool":
        return "Pool";
      case "garden":
        return "Garden";
      case "pm_fee":
        return "PM Fee";
      default:
        return expenseType;
    }
  };

  const renderSourceBadge = (
    source: MonthlyPerformance["rent_income_source"] | undefined
  ) => {
    if (!source) return null;
    return (
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sourceBadgeStyles[source]}`}
      >
        {sourceBadgeLabels[source]}
      </span>
    );
  };

  const formatSourceReferenceValue = (value: number | null | undefined) => {
    if (value === null || value === undefined || value === 0) return "-";
    return formatCurrency(value);
  };

  const formatLeaseStatus = (status: LeaseAgreementFinance["status"]) => {
    return status.replace("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const toScheduleForm = (schedule: RecurringExpenseSchedule): RecurringExpenseForm => ({
    expenseType: schedule.expense_type,
    amount: String(schedule.amount ?? ""),
    frequency: schedule.frequency,
    effectiveStartDate: toDateOnlyString(schedule.effective_start_date) || "",
    effectiveEndDate: toDateOnlyString(schedule.effective_end_date) || "",
    notes: schedule.notes || "",
  });

  const beginLeaseMetadataEdit = (lease: LeaseAgreementFinance) => {
    if (!lease.id || lease.source !== "lease_agreements") return;
    setEditingLeaseId(lease.id);
    setLeaseMetadataDraft({
      deposit: lease.deposit ? String(lease.deposit) : "",
      last_month_rent_collected: !!lease.lastMonthRentCollected,
    });
  };

  const saveLeaseMetadata = async (lease: LeaseAgreementFinance) => {
    if (!lease.id) return;

    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/admin/lease-agreements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: lease.id,
          leaseStartDate: lease.leaseStartDate,
          leaseEndDate: lease.leaseEndDate,
          monthlyRent: lease.monthlyRent,
          tenantIds: lease.tenantIds,
          notes: lease.notes || "",
          deposit: leaseMetadataDraft.deposit === "" ? null : parseFloat(leaseMetadataDraft.deposit) || 0,
          lastMonthRentCollected: leaseMetadataDraft.last_month_rent_collected,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update lease metadata");
      }

      setSuccess("Lease financial metadata updated successfully.");
      setEditingLeaseId(null);
      await loadLeaseFinancials();
      await loadPropertyFinancials();
    } catch (err) {
      setError((err as Error).message || "Failed to update lease metadata");
    } finally {
      setSaving(false);
    }
  };

  const startEditingSchedule = (schedule: RecurringExpenseSchedule) => {
    setEditingScheduleId(schedule.id);
    setScheduleDrafts((prev) => ({
      ...prev,
      [schedule.id]: toScheduleForm(schedule),
    }));
  };

  const saveExistingSchedule = async (scheduleId: string) => {
    const draft = scheduleDrafts[scheduleId];
    if (!draft) return;

    try {
      setSavingSchedule(true);
      setError(null);
      const res = await fetch("/api/admin/financials/recurring-expenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: scheduleId,
          propertyId: selectedProperty,
          expenseType: draft.expenseType,
          amount: draft.amount,
          frequency: draft.frequency,
          effectiveStartDate: draft.effectiveStartDate,
          effectiveEndDate: draft.effectiveEndDate || null,
          notes: draft.notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update recurring expense schedule");

      setEditingScheduleId(null);
      setSuccess("Recurring expense schedule updated successfully.");
      await loadRecurringSchedules();
    } catch (err) {
      setError((err as Error).message || "Failed to update recurring expense schedule");
    } finally {
      setSavingSchedule(false);
    }
  };

  const createRecurringSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingSchedule(true);
      setError(null);
      const res = await fetch("/api/admin/financials/recurring-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: selectedProperty,
          expenseType: newSchedule.expenseType,
          amount: newSchedule.amount,
          frequency: newSchedule.frequency,
          effectiveStartDate: newSchedule.effectiveStartDate,
          effectiveEndDate: newSchedule.effectiveEndDate || null,
          notes: newSchedule.notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create recurring expense schedule");

      setNewSchedule({ ...EMPTY_RECURRING_EXPENSE_FORM });
      setSuccess("Recurring expense schedule added successfully.");
      await loadRecurringSchedules();
    } catch (err) {
      setError((err as Error).message || "Failed to create recurring expense schedule");
    } finally {
      setSavingSchedule(false);
    }
  };

  // Copy previous row's values to current row
  const copyPreviousRow = (_currentIndex: number) => {};

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Financial Management</h1>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Financial Management</h1>
        <p className="text-gray-600">No properties found. Please add properties first.</p>
      </div>
    );
  }

  const selectedProp = properties.find(p => p.id === selectedProperty);
  const legacyRecurringFallbackRows = [
    {
      key: "target_rent",
      label: "Target Monthly Rent",
      amount: parseFloat(propertyFinancials.target_monthly_rent) || 0,
      frequency: "monthly",
      note: "Legacy fallback still used by current Monthly Performance calculations.",
    },
    {
      key: "garden",
      label: "Garden",
      amount: parseFloat(propertyFinancials.planned_garden_cost) || 0,
      frequency: "monthly",
      note: "Legacy fallback until recurring schedules are wired into calculations.",
    },
    {
      key: "pool",
      label: "Pool",
      amount: parseFloat(propertyFinancials.planned_pool_cost) || 0,
      frequency: "monthly",
      note: "Legacy fallback until recurring schedules are wired into calculations.",
    },
    {
      key: "hoa_1",
      label: "HOA #1",
      amount: parseFloat(propertyFinancials.planned_hoa_cost) || 0,
      frequency: propertyFinancials.hoa_frequency,
      note: "Legacy fallback until recurring schedules are wired into calculations.",
    },
    {
      key: "hoa_2",
      label: "HOA #2",
      amount: parseFloat(propertyFinancials.planned_hoa_cost_2) || 0,
      frequency: propertyFinancials.hoa_frequency_2,
      note: "Legacy fallback until recurring schedules are wired into calculations.",
    },
    {
      key: "pm_fee",
      label: "PM Fee",
      amount: parseFloat(propertyFinancials.planned_pm_fee_monthly) || 0,
      frequency: "monthly",
      note: "Legacy fallback until recurring schedules are wired into calculations.",
    },
  ];

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      <h1 className="text-3xl font-bold mb-6">Financial Management</h1>
      <p className="text-gray-600 mb-6">
        Manage property financials, year-end targets, and monthly performance data.
      </p>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {success}
        </div>
      )}

      {/* Property Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Select Property</label>
        <select
          value={selectedProperty}
          onChange={(e) => setSelectedProperty(e.target.value)}
          className="w-full max-w-md border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {properties.map((prop) => (
            <option key={prop.id} value={prop.id}>
              {prop.address}
            </option>
          ))}
        </select>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab("property")}
              className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "property"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Property Financials
            </button>
            <button
              onClick={() => setActiveTab("monthly")}
              className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "monthly"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Monthly Performance
            </button>
          </div>
          {activeTab === "monthly" && (
            <div className="pb-3 flex items-center gap-3">
              <span className="text-sm text-slate-600">{periodLabel}</span>
              <PeriodToggle value={periodType} onChange={setPeriodType} />
            </div>
          )}
        </div>
      </div>

      {/* Property Financials Tab */}
      {activeTab === "property" && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Property-wide Financial Data</h2>
          <p className="text-sm text-gray-600 mb-6">
            Edit acquisition and valuation inputs here. Lease-linked values and recurring expense schedules are managed in separate sections below.
          </p>
          <form onSubmit={savePropertyFinancials} className="space-y-6">
            {/* Financial Data Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-4 py-2 text-left text-sm font-semibold">Field</th>
                    <th className="border border-slate-300 px-4 py-2 text-left text-sm font-semibold">Value</th>
                    <th className="border border-slate-300 px-4 py-2 text-left text-sm font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-slate-300 px-4 py-2 font-medium">Home Cost</td>
                    <td className="border border-slate-300 px-4 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={propertyFinancials.home_cost}
                        onChange={(e) => setPropertyFinancials({ ...propertyFinancials, home_cost: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1"
                        placeholder="775000"
                      />
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-gray-600">Purchase price</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-4 py-2 font-medium">Repair Cost</td>
                    <td className="border border-slate-300 px-4 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={propertyFinancials.home_repair_cost}
                        onChange={(e) => setPropertyFinancials({ ...propertyFinancials, home_repair_cost: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1"
                        placeholder="30000"
                      />
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-gray-600">Renovation costs</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-4 py-2 font-medium">Closing Costs</td>
                    <td className="border border-slate-300 px-4 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={propertyFinancials.closing_costs}
                        onChange={(e) => setPropertyFinancials({ ...propertyFinancials, closing_costs: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1"
                        placeholder="0"
                      />
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-gray-600">Transaction costs</td>
                  </tr>
                  <tr className="bg-blue-50">
                    <td className="border border-slate-300 px-4 py-2 font-bold">Total Cost</td>
                    <td className="border border-slate-300 px-4 py-2">
                      <input
                        type="text"
                        value={formatCurrency(calculatedTotalCost)}
                        disabled
                        className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-semibold"
                      />
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-gray-600">Auto: Home + Repair + Closing</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-4 py-2 font-medium">Current Market Estimate</td>
                    <td className="border border-slate-300 px-4 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={propertyFinancials.current_market_estimate}
                        onChange={(e) => setPropertyFinancials({ ...propertyFinancials, current_market_estimate: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1"
                        placeholder="928000"
                      />
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-gray-600">Current appraisal value</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-4 py-2 font-medium">Purchase Date</td>
                    <td className="border border-slate-300 px-4 py-2">
                      <input
                        type="date"
                        value={propertyFinancials.purchase_date}
                        onChange={(e) => setPropertyFinancials({ ...propertyFinancials, purchase_date: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1"
                      />
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-gray-600">Date of acquisition</td>
                  </tr>
                  <tr className="bg-amber-50">
                    <td className="border border-slate-300 px-4 py-2 font-medium">Expected Annual Property Tax</td>
                    <td className="border border-slate-300 px-4 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={yeTarget.property_tax}
                        onChange={(e) => setYeTarget({ ...yeTarget, property_tax: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1"
                        placeholder="11000"
                      />
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-gray-600">Used for post-tax ROI and year-end targets</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {saving ? "Saving..." : "Save Property Financials"}
            </button>
          </form>

          <div className="mt-8 space-y-8">
            <section className="border border-slate-200 rounded-lg p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Lease-Linked Financial Data</h3>
                  <p className="text-sm text-slate-600">
                    Linked from lease records when available. Legacy property lease fields are shown only as fallback when no lease record exists.
                  </p>
                </div>
                <a
                  href="/admin/properties"
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  Open Properties
                </a>
              </div>

              {loadingLeases ? (
                <p className="text-sm text-slate-500">Loading lease records...</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-300 text-sm">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Source</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Status</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Lease Start</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Lease End</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Monthly Rent</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Security Deposit</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Last Month Rent Collected</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Tenants</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(leaseAgreements.length > 0 ? leaseAgreements : currentLease ? [currentLease] : []).map((lease) => {
                        const isEditing = !!lease.id && editingLeaseId === lease.id;
                        const isLinkedLease = lease.source === "lease_agreements" && !!lease.id;
                        return (
                          <tr key={lease.id || "legacy-fallback"} className={lease.source === "legacy_property" ? "bg-amber-50/40" : ""}>
                            <td className="border border-slate-300 px-3 py-2">
                              <div className="font-medium text-slate-900">
                                {lease.source === "lease_agreements" ? "Linked from lease" : "Legacy fallback"}
                              </div>
                              {lease.priorLeaseId ? (
                                <div className="text-xs text-slate-500">Renewal linked</div>
                              ) : null}
                            </td>
                            <td className="border border-slate-300 px-3 py-2">{formatLeaseStatus(lease.status)}</td>
                            <td className="border border-slate-300 px-3 py-2">{formatDateOnly(lease.leaseStartDate) || "-"}</td>
                            <td className="border border-slate-300 px-3 py-2">{formatDateOnly(lease.leaseEndDate) || "-"}</td>
                            <td className="border border-slate-300 px-3 py-2">{formatCurrency(lease.monthlyRent || 0)}</td>
                            <td className="border border-slate-300 px-3 py-2">
                              {isEditing ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={leaseMetadataDraft.deposit}
                                  onChange={(e) => setLeaseMetadataDraft((prev) => ({ ...prev, deposit: e.target.value }))}
                                  className="w-28 border border-slate-300 rounded px-2 py-1"
                                  placeholder="0"
                                />
                              ) : (
                                formatCurrency(lease.deposit || 0)
                              )}
                            </td>
                            <td className="border border-slate-300 px-3 py-2">
                              {isEditing ? (
                                <label className="inline-flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={leaseMetadataDraft.last_month_rent_collected}
                                    onChange={(e) =>
                                      setLeaseMetadataDraft((prev) => ({
                                        ...prev,
                                        last_month_rent_collected: e.target.checked,
                                      }))
                                    }
                                    className="h-4 w-4 rounded border-slate-300"
                                  />
                                  <span>{leaseMetadataDraft.last_month_rent_collected ? "Collected" : "Not collected"}</span>
                                </label>
                              ) : lease.lastMonthRentCollected ? (
                                "Collected upfront"
                              ) : (
                                "Not collected"
                              )}
                            </td>
                            <td className="border border-slate-300 px-3 py-2">
                              {lease.tenantNames.length > 0 ? lease.tenantNames.join(", ") : "No tenants linked"}
                            </td>
                            <td className="border border-slate-300 px-3 py-2">
                              {isLinkedLease ? (
                                isEditing ? (
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => saveLeaseMetadata(lease)}
                                      disabled={saving}
                                      className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingLeaseId(null)}
                                      className="px-3 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => beginLeaseMetadataEdit(lease)}
                                    className="px-3 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                                  >
                                    Edit security deposit / last month
                                  </button>
                                )
                              ) : (
                                <span className="text-xs text-slate-500">Add or edit a lease in Properties first.</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {leaseAgreements.length === 0 && !currentLease && (
                        <tr>
                          <td colSpan={9} className="border border-slate-300 px-3 py-4 text-center text-slate-500">
                            No lease data found for this property yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="border border-slate-200 rounded-lg p-5">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Recurring Expense Schedules</h3>
                <p className="text-sm text-slate-600">
                  Manage date-effective HOA, pool, garden, and PM fee schedules here. Existing planned property fields remain legacy fallback until automation is switched later.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-300 text-sm">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Type</th>
                          <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Amount</th>
                          <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Frequency</th>
                          <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Start</th>
                          <th className="border border-slate-300 px-3 py-2 text-left font-semibold">End</th>
                          <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Notes</th>
                          <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loadingSchedules ? (
                          <tr>
                            <td colSpan={7} className="border border-slate-300 px-3 py-4 text-center text-slate-500">
                              Loading recurring expense schedules...
                            </td>
                          </tr>
                        ) : recurringSchedules.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="border border-slate-300 px-3 py-4 text-center text-slate-500">
                              No recurring expense schedules saved yet.
                            </td>
                          </tr>
                        ) : (
                          recurringSchedules.map((schedule) => {
                            const isEditing = editingScheduleId === schedule.id;
                            const draft = scheduleDrafts[schedule.id] || toScheduleForm(schedule);
                            return (
                              <tr key={schedule.id}>
                                <td className="border border-slate-300 px-3 py-2">
                                  {isEditing ? (
                                    <select
                                      value={draft.expenseType}
                                      onChange={(e) =>
                                        setScheduleDrafts((prev) => ({
                                          ...prev,
                                          [schedule.id]: {
                                            ...draft,
                                            expenseType: e.target.value as RecurringExpenseForm["expenseType"],
                                          },
                                        }))
                                      }
                                      className="w-full border border-slate-300 rounded px-2 py-1"
                                    >
                                      <option value="hoa">{"-> HOA"}</option>
                                      <option value="pool">{"-> Pool"}</option>
                                      <option value="garden">{"-> Garden"}</option>
                                      <option value="pm_fee">PM Fee</option>
                                    </select>
                                  ) : (
                                    formatExpenseType(schedule.expense_type)
                                  )}
                                </td>
                                <td className="border border-slate-300 px-3 py-2">
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={draft.amount}
                                      onChange={(e) =>
                                        setScheduleDrafts((prev) => ({
                                          ...prev,
                                          [schedule.id]: { ...draft, amount: e.target.value },
                                        }))
                                      }
                                      className="w-28 border border-slate-300 rounded px-2 py-1"
                                    />
                                  ) : (
                                    formatCurrency(parseFloat(String(schedule.amount || 0)) || 0)
                                  )}
                                </td>
                                <td className="border border-slate-300 px-3 py-2">
                                  {isEditing ? (
                                    <select
                                      value={draft.frequency}
                                      onChange={(e) =>
                                        setScheduleDrafts((prev) => ({
                                          ...prev,
                                          [schedule.id]: {
                                            ...draft,
                                            frequency: e.target.value as RecurringExpenseForm["frequency"],
                                          },
                                        }))
                                      }
                                      className="w-full border border-slate-300 rounded px-2 py-1"
                                    >
                                      <option value="monthly">Monthly</option>
                                      <option value="annual">Annual</option>
                                    </select>
                                  ) : (
                                    schedule.frequency
                                  )}
                                </td>
                                <td className="border border-slate-300 px-3 py-2">
                                  {isEditing ? (
                                    <input
                                      type="date"
                                      value={draft.effectiveStartDate}
                                      onChange={(e) =>
                                        setScheduleDrafts((prev) => ({
                                          ...prev,
                                          [schedule.id]: { ...draft, effectiveStartDate: e.target.value },
                                        }))
                                      }
                                      className="w-full border border-slate-300 rounded px-2 py-1"
                                    />
                                  ) : (
                                    formatDateOnly(schedule.effective_start_date) || "-"
                                  )}
                                </td>
                                <td className="border border-slate-300 px-3 py-2">
                                  {isEditing ? (
                                    <input
                                      type="date"
                                      value={draft.effectiveEndDate}
                                      onChange={(e) =>
                                        setScheduleDrafts((prev) => ({
                                          ...prev,
                                          [schedule.id]: { ...draft, effectiveEndDate: e.target.value },
                                        }))
                                      }
                                      className="w-full border border-slate-300 rounded px-2 py-1"
                                    />
                                  ) : (
                                    formatDateOnly(schedule.effective_end_date) || "Open-ended"
                                  )}
                                </td>
                                <td className="border border-slate-300 px-3 py-2">
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      value={draft.notes}
                                      onChange={(e) =>
                                        setScheduleDrafts((prev) => ({
                                          ...prev,
                                          [schedule.id]: { ...draft, notes: e.target.value },
                                        }))
                                      }
                                      className="w-full border border-slate-300 rounded px-2 py-1"
                                      placeholder="Optional notes"
                                    />
                                  ) : (
                                    schedule.notes || "-"
                                  )}
                                </td>
                                <td className="border border-slate-300 px-3 py-2">
                                  {isEditing ? (
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => saveExistingSchedule(schedule.id)}
                                        disabled={savingSchedule}
                                        className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300"
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingScheduleId(null)}
                                        className="px-3 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => startEditingSchedule(schedule)}
                                      className="px-3 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                                    >
                                      Edit
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <h4 className="font-semibold text-amber-900 mb-2">Legacy fallback values still in use</h4>
                    <p className="text-sm text-amber-800 mb-3">
                      Current Monthly Performance calculations still read these property-level fields until a later logic migration switches to schedules.
                    </p>
                    <div className="space-y-2">
                      {legacyRecurringFallbackRows.map((row) => (
                        <div key={row.key} className="flex items-start justify-between gap-4 rounded border border-amber-100 bg-white px-3 py-2">
                          <div>
                            <div className="font-medium text-slate-900">{row.label}</div>
                            <div className="text-xs text-slate-500">{row.note}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-slate-900">{formatCurrency(row.amount)}</div>
                            <div className="text-xs uppercase tracking-wide text-slate-500">{row.frequency}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <form onSubmit={createRecurringSchedule} className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
                  <div>
                    <h4 className="font-semibold text-slate-900">Add recurring schedule</h4>
                    <p className="text-sm text-slate-600">Create a new effective-dated recurring cost without overwriting historical rows.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Expense type</span>
                      <select
                        value={newSchedule.expenseType}
                        onChange={(e) =>
                          setNewSchedule((prev) => ({
                            ...prev,
                            expenseType: e.target.value as RecurringExpenseForm["expenseType"],
                          }))
                        }
                        className="w-full rounded border border-slate-300 px-3 py-2"
                      >
                        <option value="hoa">{"-> HOA"}</option>
                        <option value="pool">{"-> Pool"}</option>
                        <option value="garden">{"-> Garden"}</option>
                        <option value="pm_fee">PM Fee</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Amount</span>
                      <input
                        type="number"
                        step="0.01"
                        value={newSchedule.amount}
                        onChange={(e) => setNewSchedule((prev) => ({ ...prev, amount: e.target.value }))}
                        className="w-full rounded border border-slate-300 px-3 py-2"
                        placeholder="0.00"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Frequency</span>
                      <select
                        value={newSchedule.frequency}
                        onChange={(e) =>
                          setNewSchedule((prev) => ({
                            ...prev,
                            frequency: e.target.value as RecurringExpenseForm["frequency"],
                          }))
                        }
                        className="w-full rounded border border-slate-300 px-3 py-2"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="annual">Annual</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Effective start</span>
                      <input
                        type="date"
                        value={newSchedule.effectiveStartDate}
                        onChange={(e) => setNewSchedule((prev) => ({ ...prev, effectiveStartDate: e.target.value }))}
                        className="w-full rounded border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Effective end</span>
                      <input
                        type="date"
                        value={newSchedule.effectiveEndDate}
                        onChange={(e) => setNewSchedule((prev) => ({ ...prev, effectiveEndDate: e.target.value }))}
                        className="w-full rounded border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="mb-1 block font-medium text-slate-700">Notes</span>
                      <input
                        type="text"
                        value={newSchedule.notes}
                        onChange={(e) => setNewSchedule((prev) => ({ ...prev, notes: e.target.value }))}
                        className="w-full rounded border border-slate-300 px-3 py-2"
                        placeholder="Optional notes"
                      />
                    </label>
                  </div>
                  <p className="text-xs text-slate-500">
                    Overlapping schedules for the same property and expense type are blocked to preserve clean historical ranges.
                  </p>
                  <button
                    type="submit"
                    disabled={savingSchedule}
                    className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300"
                  >
                    {savingSchedule ? "Saving..." : "Add Schedule"}
                  </button>
                </form>
              </div>
            </section>
          </div>

          {/* Last Updated Indicator */}
          {selectedProp && (
            <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded">
              <p className="text-sm">
                <span className="font-semibold">Financials saved for:</span> {selectedProp.address}
              </p>
              <p className="text-sm mt-1">
                <span className="font-semibold">Last updated:</span> {formatDate(selectedProp.financials_updated_at)}
              </p>
            </div>
          )}

          {/* Projected Income Summary - shown when financials are loaded */}
          {financialsLoaded && calculatedTotalCost > 0 && (
            <div className="mt-6 border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-800 px-5 py-3">
                <h3 className="text-white font-semibold text-sm uppercase tracking-wide">Projected Annual Income Summary</h3>
                <p className="text-slate-300 text-xs mt-0.5">Full-year projection based on current planned costs</p>
              </div>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 px-4 py-2 text-left font-semibold text-slate-700 w-1/2">Category</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold text-slate-700 w-1/4">Annual Amount</th>
                    <th className="border border-slate-200 px-4 py-2 text-left font-semibold text-slate-500 text-xs w-1/4">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-green-50">
                    <td className="border border-slate-200 px-4 py-2 font-semibold text-green-800">Projected Gross Income</td>
                    <td className="border border-slate-200 px-4 py-2 text-right font-semibold text-green-800">{formatCurrency(annualPlan.rent)}</td>
                    <td className="border border-slate-200 px-4 py-2 text-xs text-slate-500">{formatCurrency(parseFloat(propertyFinancials.target_monthly_rent) || 0)}/mo x 12</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-200 px-4 py-2 text-slate-600 pl-8">{"-> Maintenance (5% of rent)"}</td>
                    <td className="border border-slate-200 px-4 py-2 text-right text-slate-700">{formatCurrency(annualPlan.maintenance)}</td>
                    <td className="border border-slate-200 px-4 py-2 text-xs text-slate-400">5% of gross rent</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-200 px-4 py-2 text-slate-600 pl-8">{"-> HOA"}</td>
                    <td className="border border-slate-200 px-4 py-2 text-right text-slate-700">{formatCurrency(annualPlan.hoa)}</td>
                    <td className="border border-slate-200 px-4 py-2 text-xs text-slate-400">Annual total (all HOAs)</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-200 px-4 py-2 text-slate-600 pl-8">{"-> Garden"}</td>
                    <td className="border border-slate-200 px-4 py-2 text-right text-slate-700">{formatCurrency(annualPlan.garden)}</td>
                    <td className="border border-slate-200 px-4 py-2 text-xs text-slate-400">{formatCurrency(parseFloat(propertyFinancials.planned_garden_cost) || 0)}/mo x 12</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-200 px-4 py-2 text-slate-600 pl-8">{"-> Pool"}</td>
                    <td className="border border-slate-200 px-4 py-2 text-right text-slate-700">{formatCurrency(annualPlan.pool)}</td>
                    <td className="border border-slate-200 px-4 py-2 text-xs text-slate-400">{formatCurrency(parseFloat(propertyFinancials.planned_pool_cost) || 0)}/mo x 12</td>
                  </tr>
                  <tr className="bg-red-50">
                    <td className="border border-slate-200 px-4 py-2 font-semibold text-red-800">Projected Total Expenses</td>
                    <td className="border border-slate-200 px-4 py-2 text-right font-semibold text-red-800">{formatCurrency(annualPlan.totalExpenses)}</td>
                    <td className="border border-slate-200 px-4 py-2 text-xs text-slate-500">Excl. property tax</td>
                  </tr>
                  <tr className={annualPlan.netIncome >= 0 ? "bg-blue-50" : "bg-amber-50"}>
                    <td className={`border border-slate-200 px-4 py-2 font-semibold ${annualPlan.netIncome >= 0 ? "text-blue-800" : "text-amber-800"}`}>Net Income (pre-tax)</td>
                    <td className={`border border-slate-200 px-4 py-2 text-right font-semibold ${annualPlan.netIncome >= 0 ? "text-blue-800" : "text-amber-800"}`}>{formatCurrency(annualPlan.netIncome)}</td>
                    <td className="border border-slate-200 px-4 py-2 text-xs text-slate-400">Gross income minus expenses</td>
                  </tr>
                  {annualPlan.propertyTax > 0 && (
                    <>
                      <tr>
                        <td className="border border-slate-200 px-4 py-2 text-slate-600 pl-8">{"-> Property Tax (est.)"}</td>
                        <td className="border border-slate-200 px-4 py-2 text-right text-slate-700">{formatCurrency(annualPlan.propertyTax)}</td>
                        <td className="border border-slate-200 px-4 py-2 text-xs text-slate-400">From YE target input above</td>
                      </tr>
                      <tr className={annualPlan.netIncome - annualPlan.propertyTax >= 0 ? "bg-blue-50" : "bg-amber-50"}>
                        <td className={`border border-slate-200 px-4 py-2 font-semibold ${annualPlan.netIncome - annualPlan.propertyTax >= 0 ? "text-blue-800" : "text-amber-800"}`}>Net Income (post-tax)</td>
                        <td className={`border border-slate-200 px-4 py-2 text-right font-semibold ${annualPlan.netIncome - annualPlan.propertyTax >= 0 ? "text-blue-800" : "text-amber-800"}`}>{formatCurrency(annualPlan.netIncome - annualPlan.propertyTax)}</td>
                        <td className="border border-slate-200 px-4 py-2 text-xs text-slate-400">After property tax</td>
                      </tr>
                    </>
                  )}
                  <tr className="bg-slate-100 border-t-2 border-slate-300">
                    <td className="border border-slate-200 px-4 py-2 font-semibold text-slate-800">Projected ROI (pre-tax)</td>
                    <td className="border border-slate-200 px-4 py-2 text-right font-semibold text-slate-800">
                      {`${(annualPlan.netIncome / calculatedTotalCost * 100).toFixed(2)}%`}
                    </td>
                    <td className="border border-slate-200 px-4 py-2 text-xs text-slate-400">Net income / cost basis ({formatCurrency(calculatedTotalCost)})</td>
                  </tr>
                  {annualPlan.propertyTax > 0 && (
                    <tr className="bg-slate-100">
                      <td className="border border-slate-200 px-4 py-2 font-semibold text-slate-800">Projected ROI (post-tax)</td>
                      <td className="border border-slate-200 px-4 py-2 text-right font-semibold text-slate-800">
                        {`${((annualPlan.netIncome - annualPlan.propertyTax) / calculatedTotalCost * 100).toFixed(2)}%`}
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-xs text-slate-400">After property tax / cost basis</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Post-Save Calculated Summary */}
          {success && (
            <div className="mt-6 border border-blue-200 rounded-lg overflow-hidden">
              <div className="bg-blue-600 px-5 py-3">
                <h3 className="text-white font-semibold text-sm uppercase tracking-wide">Expected Annual Summary</h3>
                <p className="text-blue-100 text-xs mt-0.5">Based on current planned costs - full year projection</p>
              </div>
              <div className="bg-white p-5">
                {/* Primary metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                  <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                    <div className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Expected Gross Income</div>
                    <div className="text-2xl font-bold text-green-800">{formatCurrency(annualPlan.rent)}</div>
                    <div className="text-xs text-green-600 mt-1">Annual rent ({formatCurrency(parseFloat(propertyFinancials.target_monthly_rent) || 0)}/mo)</div>
                  </div>
                  <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                    <div className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">Expected Total Expenses</div>
                    <div className="text-2xl font-bold text-red-800">{formatCurrency(annualPlan.totalExpenses)}</div>
                    <div className="text-xs text-red-600 mt-1">Excl. property tax</div>
                  </div>
                  <div className={`rounded-lg border p-4 ${annualPlan.netIncome >= 0 ? "bg-blue-50 border-blue-200" : "bg-amber-50 border-amber-200"}`}>
                    <div className={`text-xs font-semibold uppercase tracking-wide mb-1 ${annualPlan.netIncome >= 0 ? "text-blue-700" : "text-amber-700"}`}>Expected Net Income</div>
                    <div className={`text-2xl font-bold ${annualPlan.netIncome >= 0 ? "text-blue-800" : "text-amber-800"}`}>{formatCurrency(annualPlan.netIncome)}</div>
                    <div className={`text-xs mt-1 ${annualPlan.netIncome >= 0 ? "text-blue-600" : "text-amber-600"}`}>Gross income minus expenses</div>
                  </div>
                </div>
                {/* Supporting breakdown */}
                <div className="border-t border-slate-100 pt-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Expense Breakdown</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {[
                      { label: "Expected Maintenance", value: annualPlan.maintenance, note: "5% of rent" },
                      { label: "Expected Property Tax", value: annualPlan.propertyTax, note: "Annual estimate" },
                      { label: "Expected HOA Total", value: annualPlan.hoa, note: "Annual" },
                      { label: "Expected Garden Total", value: annualPlan.garden, note: "Annual" },
                      { label: "Expected Pool Total", value: annualPlan.pool, note: "Annual" },
                    ].map(({ label, value, note }) => (
                      <div key={label} className="bg-slate-50 border border-slate-200 rounded-md p-3">
                        <div className="text-xs text-slate-500 font-medium mb-1">{label}</div>
                        <div className="text-base font-semibold text-slate-800">{formatCurrency(value)}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{note}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Monthly Performance Tab */}
      {activeTab === "monthly" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          {/* Tab header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Monthly Performance {periodType === "ytd" ? `- ${performanceYear}` : `(${periodLabelShort})`}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Rent and recurring expenses are computed at read-time. Save only maintenance and approved overrides.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {periodType === "ytd" && (
                <input
                  type="number"
                  value={performanceYear}
                  onChange={(e) => setPerformanceYear(parseInt(e.target.value))}
                  className="w-24 border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
              <button
                type="button"
                onClick={saveAllMonthlyPerformance}
                disabled={saving}
                className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save Overrides"}
              </button>
            </div>
          </div>
          <div className="p-6">

          {/* Info Strip */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              {/* Lease Information */}
              <div className="border-r border-blue-300 pr-4">
                <div className="font-semibold text-blue-900 mb-2">Lease Timeline</div>
                <div className="mb-1">
                  <span className="font-medium">Start:</span>{" "}
                  {formatDateOnly(propertyFinancials.lease_start) || "Unknown"}
                </div>
                <div className="mb-1">
                  <span className="font-medium">End:</span>{" "}
                  {formatDateOnly(propertyFinancials.lease_end) || "Unknown"}
                </div>
                <div className="mb-1">
                  <span className="font-medium">Months Elapsed:</span> {monthsElapsedLease}
                </div>
                <div className="mb-1">
                  <span className="font-medium">Months Remaining:</span>{" "}
                  {monthsRemaining !== null ? monthsRemaining : "N/A"}
                </div>
                <div>
                  <span className="font-medium">Appreciation During Lease Term:</span>{" "}
                  <span className={appreciationDuringLeaseTerm.value >= 0 ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>
                    {formatCurrency(appreciationDuringLeaseTerm.value)} ({appreciationDuringLeaseTerm.pct >= 0 ? "+" : ""}{appreciationDuringLeaseTerm.pct.toFixed(2)}%)
                  </span>
                </div>
              </div>

              {/* Purchase Information */}
              <div className="border-r border-blue-300 pr-4">
                <div className="font-semibold text-blue-900 mb-2">Purchase Timeline</div>
                <div className="mb-1">
                  <span className="font-medium">Date:</span>{" "}
                  {formatDateOnly(propertyFinancials.purchase_date) || "Unknown"}
                </div>
                <div className="mb-1">
                  <span className="font-medium">Months Elapsed:</span> {monthsElapsedPurchase}
                </div>
                <div>
                  <span className="font-medium">Appreciation:</span>{" "}
                  <span className={purchaseAppreciation.value >= 0 ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>
                    {formatCurrency(purchaseAppreciation.value)} ({purchaseAppreciation.pct >= 0 ? "+" : ""}{purchaseAppreciation.pct.toFixed(2)}%)
                  </span>
                </div>
              </div>

              {/* Current Value */}
              <div>
                <div className="font-semibold text-blue-900 mb-2">Current Status</div>
                <div className="mb-1">
                  <span className="font-medium">Market Value:</span>{" "}
                  {formatCurrency(parseFloat(propertyFinancials.current_market_estimate) || 0)}
                </div>
                <div className="mb-1">
                  <span className="font-medium">Cost Basis:</span>{" "}
                  {formatCurrency(calculatedTotalCost)}
                </div>
                <div className="mb-1">
                  <span className="font-medium">Received Deposit:</span>{" "}
                  {formatCurrency(parseFloat(propertyFinancials.deposit) || 0)}
                </div>
                <div className="mb-1 ml-4 text-xs">
                  <span className="font-medium">Purchase price:</span>{" "}
                  {formatCurrency(parseFloat(propertyFinancials.home_cost) || 0)}
                </div>
                <div className="mb-1 ml-4 text-xs">
                  <span className="font-medium">Repairs:</span>{" "}
                  {formatCurrency(parseFloat(propertyFinancials.home_repair_cost) || 0)}
                </div>
                <div>
                  <span className="font-medium">Performance Year:</span> {performanceYear}
                </div>
              </div>
            </div>
          </div>

          {!loadingMonthly && selectedMonthlyEditorRow && (
            <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                    Monthly Override Editor
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Auto values are read-only here. Save only maintenance, overrides, and notes.
                  </p>
                </div>
                <label className="flex flex-col gap-1 text-sm text-slate-600">
                  <span className="font-medium">Month</span>
                  <select
                    value={selectedMonthlyEditorKey}
                    onChange={(e) => setSelectedMonthlyEditorKey(e.target.value)}
                    className="min-w-[14rem] rounded-md border border-slate-300 px-3 py-2"
                  >
                    {displayMonthlyData.map((row) => (
                      <option key={`${row.year}-${row.month}`} value={`${row.year}-${row.month}`}>
                        {row.month_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {[
                  { label: "Billing Rent", value: formatSourceReferenceValue(selectedMonthlyEditorRow.billing_rent_income), source: selectedMonthlyEditorRow.rent_income_source === "billing" ? "Billing" : "Reference" },
                  { label: "HOA Schedule", value: formatSourceReferenceValue(selectedMonthlyEditorRow.schedule_hoa_payments), source: "Schedule" },
                  { label: "Pool Schedule", value: formatSourceReferenceValue(selectedMonthlyEditorRow.schedule_pool), source: "Schedule" },
                  { label: "Garden Schedule", value: formatSourceReferenceValue(selectedMonthlyEditorRow.schedule_garden), source: "Schedule" },
                  { label: "PM Fee Schedule", value: formatSourceReferenceValue(selectedMonthlyEditorRow.schedule_pm_fee), source: "Schedule" },
                ].map((item) => (
                  <div key={item.label} className="rounded-md border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">{item.value}</div>
                    <div className="mt-1 text-xs text-slate-400">{item.source}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-slate-600">
                  <span className="font-medium">Maintenance (manual actual)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={selectedMonthlyEditorRow.maintenance || ""}
                    onChange={(e) =>
                      updateMonthlyDraft(selectedMonthlyEditorKey, {
                        maintenance: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="rounded-md border border-slate-300 px-3 py-2 text-right"
                    placeholder="0"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-600">
                  <span className="font-medium">Rent Override</span>
                  <input
                    type="number"
                    step="0.01"
                    value={selectedMonthlyEditorRow.rent_income_override ?? ""}
                    onChange={(e) =>
                      updateMonthlyDraft(selectedMonthlyEditorKey, {
                        rent_income_override: e.target.value === "" ? null : parseFloat(e.target.value) || 0,
                      })
                    }
                    className="rounded-md border border-slate-300 px-3 py-2 text-right"
                    placeholder="Leave blank to use billing or stored value"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-600">
                  <span className="font-medium">Property Tax Override</span>
                  <input
                    type="number"
                    step="0.01"
                    value={selectedMonthlyEditorRow.property_tax_override ?? ""}
                    onChange={(e) =>
                      updateMonthlyDraft(selectedMonthlyEditorKey, {
                        property_tax_override: e.target.value === "" ? null : parseFloat(e.target.value) || 0,
                      })
                    }
                    className="rounded-md border border-slate-300 px-3 py-2 text-right"
                    placeholder="Leave blank to use stored value"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-slate-600">
                  <span className="font-medium">Market Value Override</span>
                  <input
                    type="number"
                    step="0.01"
                    value={selectedMonthlyEditorRow.market_value_override ?? ""}
                    onChange={(e) =>
                      updateMonthlyDraft(selectedMonthlyEditorKey, {
                        market_value_override: e.target.value === "" ? null : parseFloat(e.target.value) || 0,
                      })
                    }
                    className="rounded-md border border-slate-300 px-3 py-2 text-right"
                    placeholder="Leave blank to use stored value"
                  />
                </label>
              </div>

              <label className="mt-4 flex flex-col gap-1 text-sm text-slate-600">
                <span className="font-medium">Notes</span>
                <textarea
                  value={selectedMonthlyEditorRow.notes || ""}
                  onChange={(e) =>
                    updateMonthlyDraft(selectedMonthlyEditorKey, {
                      notes: e.target.value,
                    })
                  }
                  rows={3}
                  className="rounded-md border border-slate-300 px-3 py-2"
                  placeholder="Optional notes for this month"
                />
              </label>
            </div>
          )}

          {/* YTD Summary Cards */}
          {!loadingMonthly && calculatedTotalCost > 0 && (
            <div className="mb-6">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                YTD Performance - {performanceYear}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {
                    label: "YTD Income ROI",
                    value: `${(actualYtd.net_income / calculatedTotalCost * 100).toFixed(2)}%`,
                    sub: `Net ${formatCurrency(actualYtd.net_income)} / cost basis`,
                    color: actualYtd.net_income >= 0 ? "text-emerald-700" : "text-red-600",
                  },
                  {
                    label: `YTD Home Appreciation (${performanceYear})`,
                    value: ytdAppreciation.hasData
                      ? `${ytdAppreciation.pct >= 0 ? "+" : ""}${ytdAppreciation.pct.toFixed(2)}%`
                      : "-",
                    sub: ytdAppreciation.hasData
                      ? formatCurrency(ytdAppreciation.value)
                      : "No market data this year",
                    color: ytdAppreciation.pct >= 0 ? "text-emerald-700" : "text-red-600",
                  },
                  {
                    label: "Appreciation Since Purchase",
                    value: formatCurrency(purchaseAppreciation.value),
                    sub: `${purchaseAppreciation.pct.toFixed(2)}% of cost basis`,
                    color: purchaseAppreciation.value >= 0 ? "text-emerald-700" : "text-red-600",
                  },
                  {
                    label: "Total YTD ROI (Net + YTD Appr.)",
                    value: ytdAppreciation.hasData
                      ? `${((actualYtd.net_income + ytdAppreciation.value) / calculatedTotalCost * 100).toFixed(2)}%`
                      : `${(actualYtd.net_income / calculatedTotalCost * 100).toFixed(2)}%`,
                    sub: ytdAppreciation.hasData
                      ? `Net income + YTD appreciation / cost basis`
                      : "Net income only - no market data this year",
                    color: (actualYtd.net_income + (ytdAppreciation.hasData ? ytdAppreciation.value : 0)) >= 0
                      ? "text-emerald-700" : "text-red-600",
                  },
                ].map(({ label, value, sub, color }) => (
                  <div key={label} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                    <div className="text-xs text-slate-500 font-medium mb-1">{label}</div>
                    <div className={`text-xl font-bold ${color}`}>{value}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
                  </div>
                ))}
              </div>
              {showDepositBreakdown && (
                <div className="mt-2 text-xs text-slate-400">
                  Gross income includes last-month deposit ({formatCurrency(lastMonthRentBonus)}) - collected at lease start, covers {leaseEndMonthLabel ?? "last month of lease"}.
                </div>
              )}
            </div>
          )}

          {/* All 12 Months Table */}
          {loadingMonthly ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-slate-600">Loading monthly data...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-300 text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-3 py-2 text-left font-semibold sticky left-0 bg-slate-100 z-20">Month</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">Rent Income</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">Maintenance</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">{"-> Pool"}</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">{"-> Garden"}</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">{"-> HOA"}</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">PM Fee</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">Property Tax</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">Market Value</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-blue-50">Total Expenses</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-green-50">Net Income</th>
                  </tr>
                </thead>
                <tbody>
                  {displayMonthlyData.map((monthData) => {
                    const monthKey = `${monthData.year}-${monthData.month}`;
                    const isSelected = selectedMonthlyEditorKey === monthKey;
                    return (
                      <tr
                        key={monthKey}
                        className={isSelected ? "bg-blue-50" : monthData.rent_income > 0 ? "bg-white" : "bg-gray-50"}
                      >
                        <td className={`border border-slate-300 px-3 py-2 font-medium sticky left-0 ${isSelected ? "bg-blue-50" : "bg-white"}`}>
                          <div>{monthData.month_name}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {monthData.isDirty && (
                              <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                Unsaved
                              </span>
                            )}
                            {monthData.is_future && (
                              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                Future
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-right">
                          <div className="font-medium text-slate-900">{formatCurrency(monthData.rent_income)}</div>
                          <div className="mt-1 flex justify-end">{renderSourceBadge(monthData.rent_income_source)}</div>
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-right">
                          <div className="font-medium text-slate-900">{formatCurrency(monthData.maintenance || 0)}</div>
                          <div className="mt-1 text-[11px] text-slate-500">Manual actual</div>
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-right">
                          <div className="font-medium text-slate-900">{formatCurrency(monthData.pool || 0)}</div>
                          <div className="mt-1 flex justify-end">{renderSourceBadge(monthData.pool_source)}</div>
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-right">
                          <div className="font-medium text-slate-900">{formatCurrency(monthData.garden || 0)}</div>
                          <div className="mt-1 flex justify-end">{renderSourceBadge(monthData.garden_source)}</div>
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-right">
                          <div className="font-medium text-slate-900">{formatCurrency(monthData.hoa_payments || 0)}</div>
                          <div className="mt-1 flex justify-end">{renderSourceBadge(monthData.hoa_payments_source)}</div>
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-right">
                          <div className="font-medium text-slate-900">{formatCurrency(monthData.pm_fee || 0)}</div>
                          <div className="mt-1 flex justify-end">{renderSourceBadge(monthData.pm_fee_source)}</div>
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-right">
                          <div className="font-medium text-slate-900">{formatCurrency(monthData.property_tax || 0)}</div>
                          <div className="mt-1 flex justify-end">{renderSourceBadge(monthData.property_tax_source)}</div>
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-right">
                          <div className="font-medium text-slate-900">
                            {monthData.property_market_estimate !== null && monthData.property_market_estimate !== undefined
                              ? formatCurrency(monthData.property_market_estimate)
                              : "-"}
                          </div>
                          <div className="mt-1 flex justify-end">{renderSourceBadge(monthData.property_market_estimate_source)}</div>
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-right bg-blue-50 font-semibold">
                          {formatCurrency(monthData.total_expenses)}
                        </td>
                        <td className={`border border-slate-300 px-3 py-2 text-right font-semibold ${monthData.net_income >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                          {formatCurrency(monthData.net_income)}
                        </td>
                      </tr>
                    );
                  })}

                {/* Totals Row */}
                <tr className="bg-slate-200 font-bold border-t-2 border-slate-400">
                  <td className="border border-slate-300 px-3 py-2 sticky left-0 bg-slate-200">
                    {periodType === "ytd" ? "YTD Total" : "Period Total"}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right">
                    {formatCurrency(actualYtd.rent_income)}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right">
                    {formatCurrency(actualYtd.maintenance)}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right">
                    {formatCurrency(actualYtd.pool)}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right">
                    {formatCurrency(actualYtd.garden)}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right">
                    {formatCurrency(actualYtd.hoa_payments)}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right">
                    {formatCurrency(actualYtd.pm_fee || 0)}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right">
                    {formatCurrency(actualYtd.property_tax)}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right">
                    {/* Market Value total not aggregated */}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right bg-blue-100">
                    {formatCurrency(actualYtd.total_expenses)}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right bg-green-100">
                    {formatCurrency(actualYtd.net_income)}
                  </td>
                </tr>

                {/* Plan Row - pure plan for the selected period, prorated lease-start month, deposit included */}
                <tr className="bg-purple-50 font-semibold border-t border-slate-300">
                  <td className="border border-slate-300 px-3 py-2 sticky left-0 bg-purple-50">
                    Plan ({plannedYtd.monthsElapsed} mo)
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right">
                    {formatCurrency(plannedYtd.rent_income)}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right">
                    {formatCurrency(plannedYtd.maintenance)}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right">
                    {formatCurrency(plannedYtd.pool)}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right">
                    {formatCurrency(plannedYtd.garden)}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right">
                    {formatCurrency(plannedYtd.hoa_payments)}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right">
                    {formatCurrency(plannedYtd.pm_fee || 0)}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right">
                    {formatCurrency(plannedYtd.property_tax)}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right bg-purple-100">
                    {/* Plan market value not aggregated */}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right bg-purple-100">
                    {formatCurrency(plannedYtd.total_expenses)}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right bg-purple-100">
                    {formatCurrency(plannedYtd.net_income)}
                  </td>
                </tr>

                {/* Year-end Target Row (Full 12 months) */}
                {(() => {
                  const yearEndTarget = {
                    rent_income: parseFloat(yeTarget.rent_income) || 0,
                    maintenance: parseFloat(yeTarget.maintenance) || 0,
                    pool: parseFloat(yeTarget.pool) || 0,
                    garden: parseFloat(yeTarget.garden) || 0,
                    hoa: parseFloat(yeTarget.hoa) || 0,
                    pm_fee: (parseFloat(propertyFinancials.planned_pm_fee_monthly) || 0) * 12,
                    property_tax: parseFloat(yeTarget.property_tax) || 0,
                    total_expenses: 0,
                    net_income: 0,
                  };

                  // total_expenses EXCLUDES property_tax, INCLUDES pm_fee
                  yearEndTarget.total_expenses = yearEndTarget.maintenance + yearEndTarget.pool +
                    yearEndTarget.garden + yearEndTarget.hoa + yearEndTarget.pm_fee;
                  // net_income = rent_income - total_expenses (EXCLUDES property_tax)
                  yearEndTarget.net_income = yearEndTarget.rent_income - yearEndTarget.total_expenses;

                  return (
                    <tr className="bg-amber-50 font-bold border-t-2 border-amber-400">
                      <td className="border border-slate-300 px-3 py-2 sticky left-0 bg-amber-50">
                        Year-end Target
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-right">
                        {formatCurrency(yearEndTarget.rent_income)}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-right">
                        {formatCurrency(yearEndTarget.maintenance)}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-right">
                        {formatCurrency(yearEndTarget.pool)}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-right">
                        {formatCurrency(yearEndTarget.garden)}
                      </td>
                    <td className="border border-slate-300 px-3 py-2 text-right">
                      {formatCurrency(yearEndTarget.hoa)}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right">
                      {formatCurrency(yearEndTarget.pm_fee)}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right">
                      {formatCurrency(yearEndTarget.property_tax)}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right bg-amber-100">
                      {/* Year-end market value placeholder */}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right bg-amber-100">
                      {formatCurrency(yearEndTarget.total_expenses)}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right bg-amber-100">
                      {formatCurrency(yearEndTarget.net_income)}
                    </td>
                    </tr>
                  );
                })()}
                </tbody>
              </table>
            </div>
          )}

          {/* ROI Display - Excel A29:I43 layout */}
          {!loadingMonthly && allMonthlyData.length > 0 && (
            <div className="mt-6 p-6 bg-slate-50 border border-slate-200 rounded-lg">
              <h3 className="font-semibold text-slate-900 mb-4 text-lg">
                Investment Performance ({periodLabelShort})
              </h3>
              {(() => {
                const costBasis = canonicalMetrics.cost_basis;
                const yeTargetRent = parseFloat(yeTarget.rent_income) || 0;
                const yeTargetMaint = parseFloat(yeTarget.maintenance) || 0;
                const yeTargetPool = parseFloat(yeTarget.pool) || 0;
                const yeTargetGarden = parseFloat(yeTarget.garden) || 0;
                const yeTargetHoa = parseFloat(yeTarget.hoa) || 0;
                const yeTargetTax = parseFloat(yeTarget.property_tax) || 0;
                const yeTargetPmFee = (parseFloat(propertyFinancials.planned_pm_fee_monthly) || 0) * 12;
                const yeTargetTotalExp = yeTargetMaint + yeTargetPool + yeTargetGarden + yeTargetHoa + yeTargetPmFee;
                const yeTargetNet = yeTargetRent - yeTargetTotalExp;
                const hasYeTargetData = yeTargetRent > 0;
                const actualMaintenancePct = actualYtd.rent_income > 0
                  ? (actualYtd.maintenance / actualYtd.rent_income * 100)
                  : 0;
                return (
                  <InvestmentPerformanceTable
                    actual={{
                      grossIncome: actualYtd.rent_income,
                      maintenance: actualYtd.maintenance,
                      maintenancePct: actualMaintenancePct,
                      hoaPoolGarden: actualYtd.hoa_payments + actualYtd.pool + actualYtd.garden,
                      pmFee: actualYtd.pm_fee || 0,
                      totalExpenses: actualYtd.total_expenses,
                      netIncome: actualYtd.net_income,
                      propertyTax: actualYtd.property_tax,
                    }}
                    plan={{
                      grossIncome: plannedYtd.rent_income,
                      maintenance: plannedYtd.maintenance,
                      hoaPoolGarden: plannedYtd.hoa_payments + plannedYtd.pool + plannedYtd.garden,
                      pmFee: plannedYtd.pm_fee,
                      totalExpenses: plannedYtd.total_expenses,
                      netIncome: plannedYtd.net_income,
                    }}
                    yeTarget={hasYeTargetData ? {
                      grossIncome: yeTargetRent,
                      maintenance: yeTargetMaint,
                      hoaPoolGarden: yeTargetPool + yeTargetGarden + yeTargetHoa,
                      pmFee: yeTargetPmFee,
                      totalExpenses: yeTargetTotalExp,
                      netIncome: yeTargetNet,
                      propertyTax: yeTargetTax,
                    } : null}
                    roi={{
                      preTax: costBasis > 0 ? (actualYtd.net_income / costBasis * 100) : 0,
                      postTax: costBasis > 0 ? ((actualYtd.net_income - (actualYtd.property_tax || 0)) / costBasis * 100) : 0,
                      appreciationPct: canonicalMetrics.appreciation_pct,
                      planRoi: costBasis > 0 ? (plannedYtd.net_income / costBasis * 100) : 0,
                      yeTargetRoi: hasYeTargetData && costBasis > 0 ? (yeTargetNet / costBasis * 100) : null,
                    }}
                    home={{
                      costBasis,
                      currentMarketValue: canonicalMetrics.current_market_value,
                      appreciationValue: canonicalMetrics.appreciation_value,
                      appreciationPct: canonicalMetrics.appreciation_pct,
                      ytdAppreciationValue: ytdAppreciation.value,
                      ytdAppreciationPct: ytdAppreciation.pct,
                      ytdLabel: ytdAppreciationLabel,
                      monthlyGain: appreciationGains.monthlyGain,
                      monthlyGainPct: appreciationGains.monthlyGainPct,
                      annualizedGain: appreciationGains.annualizedGain,
                      annualizedGainPct: appreciationGains.annualizedGainPct,
                      monthsOwned: canonicalMetrics.months_owned,
                    }}
                    closingCosts={saleClosingCosts}
                    onClosingCostsChange={setSaleClosingCosts}
                    lastMonthDeposit={showDepositBreakdown ? lastMonthRentBonus : 0}
                    leaseEndMonthLabel={leaseEndMonthLabel}
                  />
                );
              })()}
            </div>
          )}

          {/* Formula Reference Accordion */}
          <div className="mt-8 border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowFormulas(f => !f)}
              className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
            >
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Formula Reference
              </span>
              <span className="text-slate-400 text-sm">{showFormulas ? "Hide" : "Show"}</span>
            </button>
            {showFormulas && (
              <div className="px-5 py-4 text-xs text-slate-600 space-y-4 bg-white">

                <div>
                  <div className="font-semibold text-slate-700 mb-1.5 uppercase tracking-wide text-[10px]">Basis &amp; Period</div>
                  <table className="w-full border-collapse">
                    <tbody className="divide-y divide-slate-100">
                      {[
                        ["Cost Basis", "Purchase Price + Repairs + Closing Costs"],
                        ["Months Elapsed (Plan)", "Months from lease start (or Jan 1) through current month, capped at 12. First month prorated by days remaining."],
                        ["Months Owned", "DATEDIF(purchase_date, today, 'm') - full months since purchase"],
                      ].map(([label, formula]) => (
                        <tr key={label}>
                          <td className="py-1.5 pr-4 font-medium text-slate-700 whitespace-nowrap w-52">{label}</td>
                          <td className="py-1.5 text-slate-500 font-mono text-[11px]">{formula}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <div className="font-semibold text-slate-700 mb-1.5 uppercase tracking-wide text-[10px]">Plan Values (selected period)</div>
                  <table className="w-full border-collapse">
                    <tbody className="divide-y divide-slate-100">
                      {[
                        ["Plan Period", "YTD: lease-start month (or Jan) through current month of selected year. Lease / All-Time: lease-start through today (capped at lease_end for Lease view)."],
                        ["Plan Gross Income", "target_monthly_rent x months_elapsed. First month prorated by days remaining after lease start. Includes deposit (target_monthly_rent) in lease-start month when last_month_rent_collected is checked. Pure plan - no actual override."],
                        ["Plan Maintenance", "Plan Gross Income x 5%"],
                        ["Plan Pool / Garden", "planned_monthly_cost x months_elapsed"],
                        ["Plan HOA", "(planned_annual_hoa / 12) x months_elapsed"],
                        ["Plan PM Fee", "planned_pm_fee_monthly x months_elapsed"],
                        ["Plan Total Expenses", "Maintenance + HOA + Pool + Garden + PM Fee  (property tax excluded)"],
                        ["Plan Net Income", "Plan Gross Income - Plan Total Expenses"],
                      ].map(([label, formula]) => (
                        <tr key={label}>
                          <td className="py-1.5 pr-4 font-medium text-slate-700 whitespace-nowrap w-52">{label}</td>
                          <td className="py-1.5 text-slate-500 font-mono text-[11px]">{formula}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <div className="font-semibold text-slate-700 mb-1.5 uppercase tracking-wide text-[10px]">Income &amp; Expenses (Actual)</div>
                  <table className="w-full border-collapse">
                    <tbody className="divide-y divide-slate-100">
                      {[
                        ["Gross Income", "Sum of monthly rent_income for the period. Includes last-month deposit in the month it was physically received."],
                        ["Last-Month Deposit (sub-row)", "target_monthly_rent collected upfront at lease start. Shown as an informational breakdown of Gross Income when the deposit falls within the current view period."],
                        ["Maintenance %", "Maintenance / Gross Income x 100  |  Target: < 5%"],
                        ["Total Expenses", "Maintenance + HOA + Pool + Garden + PM Fee  (property tax excluded from this line)"],
                        ["Net Income", "Gross Income - Total Expenses"],
                        ["Property Tax", "Actual entered - displayed below the line, not included in Net Income or Total Expenses"],
                      ].map(([label, formula]) => (
                        <tr key={label}>
                          <td className="py-1.5 pr-4 font-medium text-slate-700 whitespace-nowrap w-52">{label}</td>
                          <td className="py-1.5 text-slate-500 font-mono text-[11px]">{formula}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <div className="font-semibold text-slate-700 mb-1.5 uppercase tracking-wide text-[10px]">ROI Calculations</div>
                  <table className="w-full border-collapse">
                    <tbody className="divide-y divide-slate-100">
                      {[
                        ["ROI - Net Income (Pre-Tax)", "Net Income / Cost Basis x 100"],
                        ["ROI Post Property Tax", "(Net Income - Property Tax) / Cost Basis x 100"],
                        ["Projected ROI (Pre-Tax)", "(target_monthly_rent - planned_pool - planned_garden - planned_hoa - planned_pm_fee) x 12 / Cost Basis x 100"],
                        ["ROI if Sold", "(Net Income - Property Tax - Est. Closing Costs + Appreciation since purchase) / Cost Basis x 100"],
                        ["Delta to Plan", "(Actual - Plan) / |Plan| x 100  |  Green = favorable, Red = unfavorable"],
                      ].map(([label, formula]) => (
                        <tr key={label}>
                          <td className="py-1.5 pr-4 font-medium text-slate-700 whitespace-nowrap w-52">{label}</td>
                          <td className="py-1.5 text-slate-500 font-mono text-[11px]">{formula}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <div className="font-semibold text-slate-700 mb-1.5 uppercase tracking-wide text-[10px]">Home Value &amp; Appreciation</div>
                  <table className="w-full border-collapse">
                    <tbody className="divide-y divide-slate-100">
                      {[
                        ["Appreciation since purchase", "(Current Market Value - Cost Basis) / Cost Basis x 100"],
                        ["YTD Appreciation", "(Latest - Earliest market estimate entered in performance year) / Cost Basis x 100"],
                        ["Monthly Gain", "Appreciation since purchase ($) / Months Owned"],
                        ["Annualized Gain", "Monthly Gain x 12"],
                      ].map(([label, formula]) => (
                        <tr key={label}>
                          <td className="py-1.5 pr-4 font-medium text-slate-700 whitespace-nowrap w-52">{label}</td>
                          <td className="py-1.5 text-slate-500 font-mono text-[11px]">{formula}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <div className="font-semibold text-slate-700 mb-1.5 uppercase tracking-wide text-[10px]">YTD Performance Cards</div>
                  <table className="w-full border-collapse">
                    <tbody className="divide-y divide-slate-100">
                      {[
                        ["YTD Income ROI", "Net Income / Cost Basis x 100"],
                        ["YTD Home Appreciation", "(Latest - Earliest market estimate in year) / Cost Basis x 100"],
                        ["Appreciation Since Purchase", "(Current Market Value - Cost Basis) / Cost Basis x 100"],
                        ["Total YTD ROI", "(Net Income + YTD Appreciation $) / Cost Basis x 100"],
                      ].map(([label, formula]) => (
                        <tr key={label}>
                          <td className="py-1.5 pr-4 font-medium text-slate-700 whitespace-nowrap w-52">{label}</td>
                          <td className="py-1.5 text-slate-500 font-mono text-[11px]">{formula}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              </div>
            )}
          </div>

          {/* Last Updated Indicator */}
          {lastMonthlyUpdate && (
            <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded">
              <p className="text-sm">
                <span className="font-semibold">Monthly performance updated for:</span> {selectedProp?.address}
              </p>
              <p className="text-sm mt-1">
                <span className="font-semibold">Last updated:</span> {formatDate(lastMonthlyUpdate)}
              </p>
            </div>
          )}
          </div>{/* end p-6 */}
        </div>
      )}

      {/* Property List with Last Updated Timestamps */}
      <div className="mt-8 bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-xl font-semibold mb-4">All Properties - Financial Data Status</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-4 py-2 text-left text-sm font-semibold">Property</th>
                <th className="border border-slate-300 px-4 py-2 text-left text-sm font-semibold">Financials Saved</th>
                <th className="border border-slate-300 px-4 py-2 text-left text-sm font-semibold">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((prop) => (
                <tr key={prop.id} className={prop.id === selectedProperty ? "bg-blue-50" : ""}>
                  <td className="border border-slate-300 px-4 py-2">{prop.address}</td>
                  <td className="border border-slate-300 px-4 py-2">
                    {prop.financials_updated_at ? (
                      <span className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">Yes</span>
                    ) : (
                      <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                        No data
                      </span>
                    )}
                  </td>
                  <td className="border border-slate-300 px-4 py-2 text-sm">
                    {formatDate(prop.financials_updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


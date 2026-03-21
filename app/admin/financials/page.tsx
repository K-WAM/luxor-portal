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
  updated_at?: string;
};

export default function FinancialsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"property" | "monthly">("property");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  // Auto-calculated YE Target values
  const calculatedYeTarget = useMemo(() => {
    const rent = parseFloat(yeTarget.rent_income) || 0;
    const maint = parseFloat(yeTarget.maintenance) || 0;
    const pool = parseFloat(yeTarget.pool) || 0;
    const garden = parseFloat(yeTarget.garden) || 0;
    const hoa = parseFloat(yeTarget.hoa) || 0;
    const propTax = parseFloat(yeTarget.property_tax) || 0;

    // Excel formula: total_expenses = maintenance + pool + garden + hoa (EXCLUDES property_tax)
    const totalExpenses = maint + pool + garden + hoa;
    // Excel formula: net_income = rent_income - total_expenses (EXCLUDES property_tax)
    const netIncome = rent - totalExpenses;

    return {
      total_expenses: totalExpenses,
      net_income: netIncome,
    };
  }, [yeTarget]);

  // Monthly performance
  const [performanceYear, setPerformanceYear] = useState(new Date().getFullYear());
  const [allMonthlyData, setAllMonthlyData] = useState<MonthlyPerformance[]>([]);
  const [lastMonthlyUpdate, setLastMonthlyUpdate] = useState<string | null>(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [financialsLoaded, setFinancialsLoaded] = useState(false);

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
    const leaseStart = propertyFinancials.lease_start
      ? getDateOnlyParts(propertyFinancials.lease_start)
      : null;

    const today = new Date();
    const refYear = today.getFullYear();
    const refMonth = today.getMonth(); // 0-based

    const zeroPlan = {
      monthsElapsed: 0,
      rent_income: 0,
      maintenance: 0,
      pool: 0,
      garden: 0,
      hoa_payments: 0,
      pm_fee: 0,
      property_tax: 0,
      total_expenses: 0,
      net_income: 0,
    };

    if (performanceYear > refYear) return zeroPlan;

    // Start month: lease start month if in/before this year, else Jan
    let startMonth = 0;
    if (leaseStart) {
      const startYear = leaseStart.year;
      if (startYear > performanceYear) return zeroPlan;
      startMonth = startYear < performanceYear ? 0 : leaseStart.month - 1;
    }

    const effectiveCurrentMonth = performanceYear === refYear ? refMonth : 11; // inclusive of current month
    if (effectiveCurrentMonth < startMonth) return zeroPlan;

    const monthsElapsedBase = Math.min(12, effectiveCurrentMonth - startMonth + 1);
    // Keep UX rule: count current month as fully elapsed (+1), capped at 12.
    const monthsElapsedPlanned = Math.min(12, monthsElapsedBase + 1);

    // Map of actual rent by month for the performance year (overrides plan if present)
    const monthlyMap = new Map<number, number>();
    allMonthlyData
      .filter((m) => m.year === performanceYear)
      .forEach((m) => {
        monthlyMap.set(m.month, m.rent_income || 0);
      });

    let rent_income = 0;
    const startMonthIndex = startMonth; // 0-based

    for (let i = 0; i < monthsElapsedPlanned; i++) {
      const monthIndex = startMonthIndex + i;
      if (monthIndex > 11) break;
      const monthNumber = monthIndex + 1; // 1-based for data

      // If a rent value exists for that month, use it (captures mid-lease changes/previous rents)
      const overrideRent = monthlyMap.get(monthNumber);
      if (overrideRent !== undefined) {
        rent_income += overrideRent;
        continue;
      }

      // Otherwise use plan rent (prorate first month if lease starts this year and this is the start month)
      if (leaseStart && leaseStart.year === performanceYear && monthIndex === leaseStart.month - 1) {
        const dim = daysInMonth(performanceYear, monthIndex);
        const daysRemaining = dim - leaseStart.day + 1;
        rent_income += rentMonthly * (daysRemaining / dim);
      } else {
        rent_income += rentMonthly;
      }
    }

    // Maintenance planned as 5% of rent income (matches targets logic)
    const maintenance = rent_income * 0.05;
    const pool = poolMonthly * monthsElapsedPlanned;
    const garden = gardenMonthly * monthsElapsedPlanned;
    const hoa_payments = (hoaAnnual / 12) * monthsElapsedPlanned;
    const pm_fee = pmFeeMonthly * monthsElapsedPlanned;
    const property_tax = 0; // plan row leaves tax out unless a separate plan is defined

    // Excel rule: total_expenses excludes property_tax
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
    allMonthlyData,
    calculatedAnnualHoa,
    performanceYear,
    propertyFinancials.lease_start,
    propertyFinancials.planned_garden_cost,
    propertyFinancials.planned_pm_fee_monthly,
    propertyFinancials.planned_pool_cost,
    propertyFinancials.target_monthly_rent,
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

  // Last-month rent deposit bonus (added by canonical metrics, shown separately)
  const lastMonthRentBonus = useMemo(() => {
    if (!propertyFinancials.last_month_rent_collected) return 0;
    const rent = parseFloat(propertyFinancials.target_monthly_rent) || 0;
    if (rent > 0) return rent;
    const deposit = parseFloat(propertyFinancials.deposit) || 0;
    return deposit;
  }, [propertyFinancials.last_month_rent_collected, propertyFinancials.target_monthly_rent, propertyFinancials.deposit]);

  // YTD totals excluding the last-month rent deposit (for display in YTD cards/tables)
  const displayYtd = useMemo(() => ({
    ...actualYtd,
    rent_income: actualYtd.rent_income - lastMonthRentBonus,
    net_income: actualYtd.net_income - lastMonthRentBonus,
  }), [actualYtd, lastMonthRentBonus]);

  // YTD appreciation: earliest → latest market value entered in performanceYear
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

      // Load data for each month in the list
      const promises = monthsToLoad.map(async ({ month, year, month_name }) => {
        const res = await fetch(`/api/admin/financials/monthly?propertyId=${selectedProperty}&year=${year}&month=${month}`);
        const data = await res.json();

        if (res.ok && data && data.rent_income !== undefined) {
          // Excel formula: total_expenses = maintenance + pool + garden + hoa + pm_fee (EXCLUDES property_tax)
          const totalExp =
            (data.maintenance || 0) +
            (data.pool || 0) +
            (data.garden || 0) +
            (data.hoa_payments || 0) +
            (data.pm_fee || 0);
          // Excel formula: net_income = rent_income - total_expenses (EXCLUDES property_tax)
          const netInc = (data.rent_income || 0) - totalExp;
          return {
            month,
            year,
            month_name,
            rent_income: data.rent_income || 0,
            maintenance: data.maintenance || 0,
            pool: data.pool || 0,
            garden: data.garden || 0,
            hoa_payments: data.hoa_payments || 0,
            pm_fee: data.pm_fee || 0,
            property_tax: data.property_tax || 0,
            total_expenses: totalExp,
            net_income: netInc,
            property_market_estimate: data.property_market_estimate ?? null,
            updated_at: data.updated_at || null,
          };
        } else {
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
          };
        }
      });

      const results = await Promise.all(promises);
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
        ...propertyFinancials,
        last_month_rent_collected: propertyFinancials.last_month_rent_collected,
        deposit: propertyFinancials.deposit,
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


  const saveMonthlyPerformance = async (month: number, year: number, field: string, value: any) => {
    try {
      const currentMonth = allMonthlyData.find(m => m.month === month && m.year === year);
      if (!currentMonth) return;

      const updatedData = { ...currentMonth, [field]: value };

      const res = await fetch("/api/admin/financials/monthly", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: selectedProperty,
          year: year,
          month: month,
          rent_income: field === 'rent_income' ? parseFloat(value) || 0 : updatedData.rent_income,
          rent_paid: false,
          maintenance: field === 'maintenance' ? parseFloat(value) || 0 : updatedData.maintenance,
          pool: field === 'pool' ? parseFloat(value) || 0 : updatedData.pool,
          garden: field === 'garden' ? parseFloat(value) || 0 : updatedData.garden,
          hoa_payments: field === 'hoa_payments' ? parseFloat(value) || 0 : updatedData.hoa_payments,
          pm_fee: field === 'pm_fee' ? parseFloat(value) || 0 : updatedData.pm_fee || 0,
          property_tax: field === 'property_tax' ? parseFloat(value) || 0 : updatedData.property_tax,
          property_market_estimate: field === 'property_market_estimate' ? parseFloat(value) || 0 : (updatedData as any).property_market_estimate || null,
        }),
      });

      if (res.ok) {
        await loadAllMonthlyPerformance();
      }
    } catch (err: any) {
      console.error("Error saving monthly performance:", err);
    }
  };

  const saveAllMonthlyPerformance = async () => {
    if (displayMonthlyData.length === 0) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      for (const monthData of displayMonthlyData) {
        await fetch("/api/admin/financials/monthly", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyId: selectedProperty,
            year: monthData.year,
            month: monthData.month,
            rent_income: monthData.rent_income || 0,
            rent_paid: false,
            maintenance: monthData.maintenance || 0,
            pool: monthData.pool || 0,
            garden: monthData.garden || 0,
            hoa_payments: monthData.hoa_payments || 0,
            pm_fee: monthData.pm_fee || 0,
            property_tax: monthData.property_tax || 0,
            property_market_estimate: monthData.property_market_estimate ?? null,
          }),
        });
      }
      setSuccess("Monthly performance saved successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to save monthly performance");
    } finally {
      setSaving(false);
    }
  };

  const addNewMonthRow = () => {
    setAllMonthlyData(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      let nextMonth = last.month;
      let nextYear = last.year;
      nextMonth += 1;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      return [
        ...prev,
        {
          ...prev[prev.length - 1],
          month: nextMonth,
          year: nextYear,
          month_name: `${monthNames[nextMonth - 1]} ${nextYear}`,
          updated_at: undefined,
        }
      ];
    });
  };

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
          <h2 className="text-xl font-semibold mb-4">Property Financial Data</h2>
          <p className="text-sm text-gray-600 mb-6">
            Enter one-time property financial information. Total Cost is auto-calculated.
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
                  <tr>
                    <td className="border border-slate-300 px-4 py-2 font-medium">Lease Start Date</td>
                    <td className="border border-slate-300 px-4 py-2">
                      <input
                        type="date"
                        value={propertyFinancials.lease_start}
                        onChange={(e) => setPropertyFinancials({ ...propertyFinancials, lease_start: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1"
                      />
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-gray-600">When lease begins</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-4 py-2 font-medium">Lease End Date</td>
                    <td className="border border-slate-300 px-4 py-2">
                      <input
                        type="date"
                        value={propertyFinancials.lease_end}
                        onChange={(e) => setPropertyFinancials({ ...propertyFinancials, lease_end: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1"
                      />
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-gray-600">When lease expires</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-4 py-2 font-medium">Deposit</td>
                    <td className="border border-slate-300 px-4 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={propertyFinancials.deposit}
                        onChange={(e) => setPropertyFinancials({ ...propertyFinancials, deposit: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1"
                        placeholder="0"
                      />
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-gray-600">Security / last-month deposit</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-4 py-2 font-medium">Last month rent collected</td>
                    <td className="border border-slate-300 px-4 py-2">
                      <input
                        id="last-month-rent-collected"
                        type="checkbox"
                        checked={propertyFinancials.last_month_rent_collected}
                        onChange={(e) => setPropertyFinancials({ ...propertyFinancials, last_month_rent_collected: e.target.checked })}
                        className="h-4 w-4 text-blue-600 border-slate-300 rounded"
                      />
                    </td>
                    <td className="border border-slate-300 px-4 py-2 text-sm text-gray-600">Check if last month’s rent was received upfront</td>
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

            {/* Planned Monthly Costs Table */}
            <div className="mt-6">
              <h3 className="font-semibold mb-3 text-lg">Planned Monthly Costs</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 px-4 py-2 text-left text-sm font-semibold">Expense Type</th>
                      <th className="border border-slate-300 px-4 py-2 text-left text-sm font-semibold">Monthly Amount ($)</th>
                      <th className="border border-slate-300 px-4 py-2 text-left text-sm font-semibold">Annual Amount ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-medium">Target Monthly Rent</td>
                      <td className="border border-slate-300 px-4 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={propertyFinancials.target_monthly_rent}
                          onChange={(e) => setPropertyFinancials({ ...propertyFinancials, target_monthly_rent: e.target.value })}
                          className="w-full border border-slate-300 rounded px-2 py-1"
                          placeholder="5750"
                        />
                      </td>
                      <td className="border border-slate-300 px-4 py-2 text-sm">
                        {formatCurrency((parseFloat(propertyFinancials.target_monthly_rent) || 0) * 12)}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-medium">Planned Garden Cost</td>
                      <td className="border border-slate-300 px-4 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={propertyFinancials.planned_garden_cost}
                          onChange={(e) => setPropertyFinancials({ ...propertyFinancials, planned_garden_cost: e.target.value })}
                          className="w-full border border-slate-300 rounded px-2 py-1"
                          placeholder="150"
                        />
                      </td>
                      <td className="border border-slate-300 px-4 py-2 text-sm">
                        {formatCurrency((parseFloat(propertyFinancials.planned_garden_cost) || 0) * 12)}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-medium">Planned Pool Cost</td>
                      <td className="border border-slate-300 px-4 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={propertyFinancials.planned_pool_cost}
                          onChange={(e) => setPropertyFinancials({ ...propertyFinancials, planned_pool_cost: e.target.value })}
                          className="w-full border border-slate-300 rounded px-2 py-1"
                          placeholder="200"
                        />
                      </td>
                      <td className="border border-slate-300 px-4 py-2 text-sm">
                        {formatCurrency((parseFloat(propertyFinancials.planned_pool_cost) || 0) * 12)}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-medium">Planned HOA Cost #1</td>
                      <td className="border border-slate-300 px-4 py-2">
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={propertyFinancials.planned_hoa_cost}
                            onChange={(e) => setPropertyFinancials({ ...propertyFinancials, planned_hoa_cost: e.target.value })}
                            className="flex-1 border border-slate-300 rounded px-2 py-1"
                            placeholder="200"
                          />
                          <select
                            value={propertyFinancials.hoa_frequency}
                            onChange={(e) => setPropertyFinancials({ ...propertyFinancials, hoa_frequency: e.target.value as "monthly" | "quarterly" })}
                            className="border border-slate-300 rounded px-2 py-1"
                          >
                            <option value="monthly">Monthly</option>
                            <option value="quarterly">Quarterly</option>
                          </select>
                        </div>
                      </td>
                      <td className="border border-slate-300 px-4 py-2 text-sm">
                        {formatCurrency((parseFloat(propertyFinancials.planned_hoa_cost) || 0) * (propertyFinancials.hoa_frequency === "monthly" ? 12 : 4))}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-medium">Planned HOA Cost #2</td>
                      <td className="border border-slate-300 px-4 py-2">
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={propertyFinancials.planned_hoa_cost_2}
                            onChange={(e) => setPropertyFinancials({ ...propertyFinancials, planned_hoa_cost_2: e.target.value })}
                            className="flex-1 border border-slate-300 rounded px-2 py-1"
                            placeholder="0"
                          />
                          <select
                            value={propertyFinancials.hoa_frequency_2}
                            onChange={(e) => setPropertyFinancials({ ...propertyFinancials, hoa_frequency_2: e.target.value as "monthly" | "quarterly" })}
                            className="border border-slate-300 rounded px-2 py-1"
                          >
                            <option value="monthly">Monthly</option>
                            <option value="quarterly">Quarterly</option>
                          </select>
                        </div>
                      </td>
                      <td className="border border-slate-300 px-4 py-2 text-sm">
                        {formatCurrency((parseFloat(propertyFinancials.planned_hoa_cost_2) || 0) * (propertyFinancials.hoa_frequency_2 === "monthly" ? 12 : 4))}
                      </td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="border border-slate-300 px-4 py-2 font-semibold">Total Annual HOA</td>
                      <td className="border border-slate-300 px-4 py-2"></td>
                      <td className="border border-slate-300 px-4 py-2 text-sm font-semibold">
                        {formatCurrency(calculatedAnnualHoa)}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-4 py-2 font-medium">Planned PM Fee (monthly)</td>
                      <td className="border border-slate-300 px-4 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={propertyFinancials.planned_pm_fee_monthly}
                          onChange={(e) => setPropertyFinancials({ ...propertyFinancials, planned_pm_fee_monthly: e.target.value })}
                          className="w-full border border-slate-300 rounded px-2 py-1"
                          placeholder="0"
                        />
                      </td>
                      <td className="border border-slate-300 px-4 py-2 text-sm">
                        {formatCurrency((parseFloat(propertyFinancials.planned_pm_fee_monthly) || 0) * 12)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {saving ? "Saving..." : "Save Property Financials"}
            </button>
          </form>

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

          {/* Projected Income Summary — shown when financials are loaded */}
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
                    <td className="border border-slate-200 px-4 py-2 text-xs text-slate-500">{formatCurrency(parseFloat(propertyFinancials.target_monthly_rent) || 0)}/mo × 12</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-200 px-4 py-2 text-slate-600 pl-8">↳ Maintenance (5% of rent)</td>
                    <td className="border border-slate-200 px-4 py-2 text-right text-slate-700">{formatCurrency(annualPlan.maintenance)}</td>
                    <td className="border border-slate-200 px-4 py-2 text-xs text-slate-400">5% of gross rent</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-200 px-4 py-2 text-slate-600 pl-8">↳ HOA</td>
                    <td className="border border-slate-200 px-4 py-2 text-right text-slate-700">{formatCurrency(annualPlan.hoa)}</td>
                    <td className="border border-slate-200 px-4 py-2 text-xs text-slate-400">Annual total (all HOAs)</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-200 px-4 py-2 text-slate-600 pl-8">↳ Garden</td>
                    <td className="border border-slate-200 px-4 py-2 text-right text-slate-700">{formatCurrency(annualPlan.garden)}</td>
                    <td className="border border-slate-200 px-4 py-2 text-xs text-slate-400">{formatCurrency(parseFloat(propertyFinancials.planned_garden_cost) || 0)}/mo × 12</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-200 px-4 py-2 text-slate-600 pl-8">↳ Pool</td>
                    <td className="border border-slate-200 px-4 py-2 text-right text-slate-700">{formatCurrency(annualPlan.pool)}</td>
                    <td className="border border-slate-200 px-4 py-2 text-xs text-slate-400">{formatCurrency(parseFloat(propertyFinancials.planned_pool_cost) || 0)}/mo × 12</td>
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
                        <td className="border border-slate-200 px-4 py-2 text-slate-600 pl-8">↳ Property Tax (est.)</td>
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
                    <td className="border border-slate-200 px-4 py-2 text-xs text-slate-400">Net income ÷ cost basis ({formatCurrency(calculatedTotalCost)})</td>
                  </tr>
                  {annualPlan.propertyTax > 0 && (
                    <tr className="bg-slate-100">
                      <td className="border border-slate-200 px-4 py-2 font-semibold text-slate-800">Projected ROI (post-tax)</td>
                      <td className="border border-slate-200 px-4 py-2 text-right font-semibold text-slate-800">
                        {`${((annualPlan.netIncome - annualPlan.propertyTax) / calculatedTotalCost * 100).toFixed(2)}%`}
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-xs text-slate-400">After property tax ÷ cost basis</td>
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
                <p className="text-blue-100 text-xs mt-0.5">Based on current planned costs — full year projection</p>
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
                Monthly Performance {periodType === "ytd" ? `— ${performanceYear}` : `(${periodLabelShort})`}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">Enter actuals per month, then save.</p>
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
                onClick={addNewMonthRow}
                className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800"
              >
                + Month
              </button>
              <button
                type="button"
                onClick={saveAllMonthlyPerformance}
                disabled={saving}
                className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : "Save"}
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

          {/* YTD Summary Cards */}
          {!loadingMonthly && calculatedTotalCost > 0 && (
            <div className="mb-6">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                YTD Performance — {performanceYear}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {
                    label: "YTD Income ROI",
                    value: `${(displayYtd.net_income / calculatedTotalCost * 100).toFixed(2)}%`,
                    sub: `Net ${formatCurrency(displayYtd.net_income)} ÷ cost basis${lastMonthRentBonus > 0 ? " *" : ""}`,
                    color: displayYtd.net_income >= 0 ? "text-emerald-700" : "text-red-600",
                  },
                  {
                    label: `YTD Home Appreciation (${performanceYear})`,
                    value: ytdAppreciation.hasData
                      ? `${ytdAppreciation.pct >= 0 ? "+" : ""}${ytdAppreciation.pct.toFixed(2)}%`
                      : "—",
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
                    label: "Total YTD ROI (incl. Appr.)",
                    value: `${((displayYtd.net_income + purchaseAppreciation.value) / calculatedTotalCost * 100).toFixed(2)}%`,
                    sub: "Net income + appreciation",
                    color: (displayYtd.net_income + purchaseAppreciation.value) >= 0 ? "text-emerald-700" : "text-red-600",
                  },
                ].map(({ label, value, sub, color }) => (
                  <div key={label} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                    <div className="text-xs text-slate-500 font-medium mb-1">{label}</div>
                    <div className={`text-xl font-bold ${color}`}>{value}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
                  </div>
                ))}
              </div>
              {lastMonthRentBonus > 0 && (
                <div className="mt-2 text-xs text-slate-400">
                  * Excludes last-month deposit ({formatCurrency(lastMonthRentBonus)}) — collected upfront, not in {performanceYear} YTD.
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
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">Pool</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">Garden</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">HOA</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">PM Fee</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">Property Tax</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">Market Value</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-blue-50">Total Expenses</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-green-50">Net Income</th>
                  </tr>
                </thead>
                <tbody>
                  {displayMonthlyData.map((monthData) => (
                  <tr key={`${monthData.year}-${monthData.month}`} className={monthData.rent_income > 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="border border-slate-300 px-3 py-2 font-medium sticky left-0 bg-white">
                      {monthData.month_name}
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={monthData.rent_income || ""}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          setAllMonthlyData(prev => prev.map((m) => {
                            if (m.year === monthData.year && m.month === monthData.month) {
                              // Excel: total_expenses EXCLUDES property_tax
                              const totalExp =
                                (m.maintenance || 0) +
                                (m.pool || 0) +
                                (m.garden || 0) +
                                (m.hoa_payments || 0) +
                                (m.pm_fee || 0);
                              return { ...m, rent_income: value, total_expenses: totalExp, net_income: value - totalExp };
                            }
                            return m;
                          }));
                        }}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={monthData.maintenance || ""}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          setAllMonthlyData(prev => prev.map((m) => {
                            if (m.year === monthData.year && m.month === monthData.month) {
                              const totalExp =
                                value +
                                (m.pool || 0) +
                                (m.garden || 0) +
                                (m.hoa_payments || 0) +
                                (m.pm_fee || 0);
                              return { ...m, maintenance: value, total_expenses: totalExp, net_income: (m.rent_income || 0) - totalExp };
                            }
                            return m;
                          }));
                        }}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={monthData.pool || ""}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          setAllMonthlyData(prev => prev.map((m) => {
                            if (m.year === monthData.year && m.month === monthData.month) {
                              const totalExp =
                                (m.maintenance || 0) +
                                value +
                                (m.garden || 0) +
                                (m.hoa_payments || 0) +
                                (m.pm_fee || 0);
                              return { ...m, pool: value, total_expenses: totalExp, net_income: (m.rent_income || 0) - totalExp };
                            }
                            return m;
                          }));
                        }}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={monthData.garden || ""}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          setAllMonthlyData(prev => prev.map((m) => {
                            if (m.year === monthData.year && m.month === monthData.month) {
                              const totalExp =
                                (m.maintenance || 0) +
                                (m.pool || 0) +
                                value +
                                (m.hoa_payments || 0) +
                                (m.pm_fee || 0);
                              return { ...m, garden: value, total_expenses: totalExp, net_income: (m.rent_income || 0) - totalExp };
                            }
                            return m;
                          }));
                        }}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={monthData.hoa_payments || ""}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          setAllMonthlyData(prev => prev.map((m) => {
                            if (m.year === monthData.year && m.month === monthData.month) {
                              const totalExp =
                                (m.maintenance || 0) +
                                (m.pool || 0) +
                                (m.garden || 0) +
                                value +
                                (m.pm_fee || 0);
                              return { ...m, hoa_payments: value, total_expenses: totalExp, net_income: (m.rent_income || 0) - totalExp };
                            }
                            return m;
                          }));
                        }}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={monthData.pm_fee || ""}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          setAllMonthlyData(prev => prev.map((m) => {
                            if (m.year === monthData.year && m.month === monthData.month) {
                              const totalExp =
                                (m.maintenance || 0) +
                                (m.pool || 0) +
                                (m.garden || 0) +
                                (m.hoa_payments || 0) +
                                value;
                              return { ...m, pm_fee: value, total_expenses: totalExp, net_income: (m.rent_income || 0) - totalExp };
                            }
                            return m;
                          }));
                        }}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={monthData.property_tax || ""}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          setAllMonthlyData(prev => prev.map((m) => {
                            if (m.year === monthData.year && m.month === monthData.month) {
                              // Property tax does NOT affect total_expenses or net_income in Excel formula
                              return { ...m, property_tax: value };
                            }
                            return m;
                          }));
                        }}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={monthData.property_market_estimate ?? ""}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          setAllMonthlyData(prev => prev.map((m) =>
                            m.year === monthData.year && m.month === monthData.month
                              ? { ...m, property_market_estimate: value }
                              : m
                          ));
                        }}
                        className="w-full border border-slate-300 rounded px-2 py-1 text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right bg-blue-50 font-semibold">
                      {formatCurrency(monthData.total_expenses)}
                    </td>
                    <td className={`border border-slate-300 px-3 py-2 text-right font-semibold ${monthData.net_income >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {formatCurrency(monthData.net_income)}
                    </td>
                  </tr>
                ))}

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

                {/* Plan Row (elapsed months including current month, with first month proration) */}
                <tr className="bg-purple-50 font-semibold border-t border-slate-300">
                  <td className="border border-slate-300 px-3 py-2 sticky left-0 bg-purple-50">
                    Plan (thru {plannedYtd.monthsElapsed} mo)
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
                    property_tax: parseFloat(yeTarget.property_tax) || 0,
                    total_expenses: 0,
                    net_income: 0,
                  };

                  // Excel formula: total_expenses EXCLUDES property_tax
                  yearEndTarget.total_expenses = yearEndTarget.maintenance + yearEndTarget.pool +
                    yearEndTarget.garden + yearEndTarget.hoa;
                  // Excel formula: net_income = rent_income - total_expenses (EXCLUDES property_tax)
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
                      {formatCurrency(0)}
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

          {/* ROI Display — Excel A29:I43 layout */}
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
                // Use displayYtd (deposit excluded) so gross income, net income, and ROI all match the YTD cards
                const displayMaintenancePct = displayYtd.rent_income > 0
                  ? (displayYtd.maintenance / displayYtd.rent_income * 100)
                  : 0;
                return (
                  <InvestmentPerformanceTable
                    actual={{
                      grossIncome: displayYtd.rent_income,
                      maintenance: displayYtd.maintenance,
                      maintenancePct: displayMaintenancePct,
                      hoaPoolGarden: displayYtd.hoa_payments + displayYtd.pool + displayYtd.garden,
                      pmFee: displayYtd.pm_fee || 0,
                      totalExpenses: displayYtd.total_expenses,
                      netIncome: displayYtd.net_income,
                      propertyTax: displayYtd.property_tax,
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
                      preTax: costBasis > 0 ? (displayYtd.net_income / costBasis * 100) : 0,
                      postTax: costBasis > 0 ? ((displayYtd.net_income - (displayYtd.property_tax || 0)) / costBasis * 100) : 0,
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
                  />
                );
              })()}
            </div>
          )}

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
                      <span className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                        ✓ Yes
                      </span>
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

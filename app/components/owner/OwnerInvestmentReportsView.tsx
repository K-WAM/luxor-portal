"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { calculateCanonicalMetrics } from "@/lib/calculations/canonical-metrics";
import { calculateExpectedRoi } from "@/lib/financial-calculations";
import InvestmentPerformanceTable from "@/app/components/InvestmentPerformanceTable";
import { PeriodToggle } from "@/app/components/ui/PeriodToggle";
import { usePeriodFilter } from "@/app/hooks/usePeriodFilter";
import { formatDateOnly, getDateOnlyParts, parseDateOnly } from "@/lib/date-only";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { createClient } from "@/lib/supabase/client";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

type PropertyFinancials = {
  id: string;
  address: string;
  home_cost: number;
  home_repair_cost: number;
  closing_costs: number;
  total_cost: number;
  current_market_estimate: number;
  target_monthly_rent: number;
  planned_garden_cost?: number;
  planned_pool_cost?: number;
  planned_hoa_cost?: number;
  planned_pm_fee_monthly?: number;
  purchase_date: string;
  lease_start?: string;
  lease_end?: string;
  last_month_rent_collected?: boolean;
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
  total_expenses: number;
  net_income: number;
  property_tax: number;
  property_market_estimate: number | null;
  updated_at?: string | null;
};

type CalculatedMetrics = {
  ytd_rent_income: number;
  ytd_maintenance: number;
  ytd_pool: number;
  ytd_garden: number;
  ytd_hoa: number;
  ytd_pm_fee: number;
  ytd_total_expenses: number;
  ytd_net_income: number;
  ytd_property_tax: number;
  cost_basis: number;
  current_market_value: number;
  appreciation_value: number;
  appreciation_pct: number;
  roi_pre_tax: number;
  roi_post_tax: number;
  roi_with_appreciation: number;
  maintenance_pct: number;
  months_owned: number;
};

type YeTarget = {
  rent_income: number;
  maintenance: number;
  pool: number;
  garden: number;
  hoa: number;
  property_tax: number;
  total_expenses: number;
  net_income: number;
} | null;

export default function OwnerInvestmentReportsView() {
  const { user, role } = useAuth();
  const [meInfo, setMeInfo] = useState<{ email: string | null; role: string | null; properties?: any[]; user_id?: string } | null>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [property, setProperty] = useState<PropertyFinancials | null>(null);
  const [monthly, setMonthly] = useState<MonthlyPerformance[]>([]);
  const [rawMetrics, setRawMetrics] = useState<CalculatedMetrics | null>(null);
  const [yeTarget, setYeTarget] = useState<YeTarget>(null);
  const [saleClosingCosts, setSaleClosingCosts] = useState("");

  // Period filter hook for YTD vs Lease Term toggle
  const { periodType, setPeriodType, monthsInPeriod, label: periodLabel } = usePeriodFilter({
    leaseStart: property?.lease_start,
    leaseEnd: property?.lease_end,
    currentYear: selectedYear
  });

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    monthly.forEach((m) => {
      if (Number.isFinite(m.year)) years.add(m.year);
    });
    if (years.size === 0) years.add(selectedYear);
    return Array.from(years).sort((a, b) => a - b);
  }, [monthly, selectedYear]);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[availableYears.length - 1]);
    }
  }, [availableYears, selectedYear]);

  // Filter monthly data based on selected period
  const filteredMonthly = useMemo(() => {
    if (!monthly || monthly.length === 0) return [];

    // For "alltime", don't filter by months (show all months)
    if (periodType === "alltime") {
      return [...monthly].sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
      });
    }

    // For "lease", filter to exact lease term months (may span years)
    if (periodType === "lease" && property?.lease_start && property?.lease_end) {
      const { getLeaseTermMonths } = require("@/app/hooks/usePeriodFilter");
      const leaseMonths: Array<{year: number; month: number}> = getLeaseTermMonths(property.lease_start, property.lease_end);

      return monthly.filter(m =>
        leaseMonths.some((lm: {year: number; month: number}) => lm.year === m.year && lm.month === m.month)
      ).sort((a, b) => {
        // Sort by year first, then month
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
      });
    }

    // For "ytd", filter to only include months in the current year up to current month
    if (periodType === "ytd" && monthsInPeriod && monthsInPeriod.length > 0) {
      return monthly
        .filter(m => m.year === selectedYear && monthsInPeriod.includes(m.month))
        .sort((a, b) => a.month - b.month);
    }

    return monthly;
  }, [monthly, monthsInPeriod, periodType, property, selectedYear]);

  const chronologicalMonthly = useMemo(() => {
    return [...filteredMonthly].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }, [filteredMonthly]);

  const allChronologicalMonthly = useMemo(() => {
    return [...monthly].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }, [monthly]);

  const normalizeFinancialRows = (source: MonthlyPerformance[]) => {
    const normalized = source.map((m) => {
      const grossIncome = Number(m.rent_income || 0);
      const maintenance = Number(m.maintenance || 0);
      const hoa = Number(m.hoa_payments || 0);
      const pool = Number(m.pool || 0);
      const garden = Number(m.garden || 0);
      const pmFee = Number(m.pm_fee || 0);
      const knownExpenses = maintenance + hoa + pool + garden + pmFee;
      const storedTotalExpenses = Number(m.total_expenses || 0);
      const otherExpenses = Math.max(0, storedTotalExpenses - knownExpenses);
      const totalExpenses = knownExpenses + otherExpenses;
      const netIncome = grossIncome - totalExpenses;
      return {
        label: m.month_name,
        sortKey: `${m.year}-${String(m.month).padStart(2, "0")}`,
        grossIncome,
        maintenance,
        hoa,
        pool,
        garden,
        pmFee,
        otherExpenses,
        totalExpenses,
        netIncome,
        expenseRatio: grossIncome > 0 ? (totalExpenses / grossIncome) * 100 : 0,
      };
    });

    const trimmed = normalized.filter((m) => {
      return (
        m.grossIncome !== 0 ||
        m.maintenance !== 0 ||
        m.hoa !== 0 ||
        m.pool !== 0 ||
        m.garden !== 0 ||
        m.pmFee !== 0 ||
        m.otherExpenses !== 0 ||
        m.totalExpenses !== 0 ||
        m.netIncome !== 0
      );
    });

    return trimmed.length > 0 ? trimmed : normalized;
  };

  const periodFinancialRows = useMemo(() => {
    return normalizeFinancialRows(chronologicalMonthly);
  }, [chronologicalMonthly]);

  const allTimeFinancialRows = useMemo(() => {
    return normalizeFinancialRows(allChronologicalMonthly);
  }, [allChronologicalMonthly]);

  const isAllTimeReport = periodType === "alltime";
  const financialRowsForView = isAllTimeReport ? allTimeFinancialRows : periodFinancialRows;

  const financialAggregate = useMemo(() => {
    return financialRowsForView.reduce(
      (acc, row) => {
        acc.grossIncome += row.grossIncome;
        acc.maintenance += row.maintenance;
        acc.hoa += row.hoa;
        acc.pool += row.pool;
        acc.garden += row.garden;
        acc.pmFee += row.pmFee;
        acc.otherExpenses += row.otherExpenses;
        acc.totalExpenses += row.totalExpenses;
        acc.netIncome += row.netIncome;
        return acc;
      },
      {
        grossIncome: 0,
        maintenance: 0,
        hoa: 0,
        pool: 0,
        garden: 0,
        pmFee: 0,
        otherExpenses: 0,
        totalExpenses: 0,
        netIncome: 0,
      }
    );
  }, [financialRowsForView]);

  const financialStatementRow = useMemo(() => {
    return {
      label: periodLabel,
      sortKey: periodType,
      grossIncome: financialAggregate.grossIncome,
      maintenance: financialAggregate.maintenance,
      hoa: financialAggregate.hoa,
      pool: financialAggregate.pool,
      garden: financialAggregate.garden,
      pmFee: financialAggregate.pmFee,
      otherExpenses: financialAggregate.otherExpenses,
      totalExpenses: financialAggregate.totalExpenses,
      netIncome: financialAggregate.netIncome,
      expenseRatio:
        financialAggregate.grossIncome > 0
          ? (financialAggregate.totalExpenses / financialAggregate.grossIncome) * 100
          : 0,
    };
  }, [financialAggregate, periodLabel, periodType]);

  const marketEstimateData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    return chronologicalMonthly.filter((m) => {
      const hasValue = (m.property_market_estimate || 0) > 0;
      const notFuture =
        m.year < currentYear || (m.year === currentYear && m.month <= currentMonth);
      return hasValue && notFuture;
    });
  }, [chronologicalMonthly]);

  // YTD appreciation: earliest to latest market value in selectedYear
  const ytdAppreciationData = useMemo(() => {
    const yearData = monthly
      .filter((m) => m.year === selectedYear && (m.property_market_estimate || 0) > 0)
      .sort((a, b) => a.month - b.month);
    if (yearData.length === 0) return { value: 0, pct: 0, hasData: false, label: null as string | null };
    const earliest = parseFloat(String(yearData[0].property_market_estimate ?? 0)) || 0;
    const latest = parseFloat(String(yearData[yearData.length - 1].property_market_estimate ?? 0)) || 0;
    const value = latest - earliest;
    return {
      value,
      pct: 0, // computed after metrics is available; handled at render time
      hasData: true,
      label: new Date(selectedYear, yearData[0].month - 1).toLocaleString("default", { month: "short" }),
    };
  }, [monthly, selectedYear]);

  // Recalculate metrics when period type or data changes
  const metrics = useMemo(() => {
    if (!property || !monthly || monthly.length === 0) return rawMetrics;

    // Filter data based on period type BEFORE passing to canonical metrics
    let dataForCalculation = monthly;

    if (periodType === 'ytd') {
      // YTD: Only include data from the selected year
      dataForCalculation = monthly.filter(m => m.year === selectedYear);
    } else if (periodType === 'lease') {
      // Lease Term: Use filteredMonthly which already has the correct lease months
      dataForCalculation = filteredMonthly;
    } else if (periodType === 'alltime') {
      // All Time: Use all available data
      dataForCalculation = monthly;
    }

    // Convert to canonical format - USE ACTUAL YEAR FROM DATA!
    const monthlyData = dataForCalculation.map(m => ({
      month: m.month,
      year: m.year, // CRITICAL: Use actual year, not selectedYear!
      rent_income: m.rent_income || 0,
      maintenance: m.maintenance || 0,
      pool: m.pool || 0,
      garden: m.garden || 0,
      hoa_payments: m.hoa_payments || 0,
      pm_fee: m.pm_fee || 0,
      property_tax: m.property_tax || 0,
      property_market_estimate: m.property_market_estimate
    }));

    const propertyData = {
      home_cost: property.home_cost || 0,
      home_repair_cost: property.home_repair_cost || 0,
      closing_costs: property.closing_costs || 0,
      total_cost: property.total_cost || 0,
      current_market_estimate: property.current_market_estimate || 0,
      purchase_date: property.purchase_date,
      lease_start: property.lease_start,
      lease_end: property.lease_end,
      target_monthly_rent: property.target_monthly_rent,
      last_month_rent_collected: property.last_month_rent_collected
    };

    // No monthsFilter needed - we've already filtered the data above
    const canonicalMetrics = calculateCanonicalMetrics(
      propertyData,
      monthlyData,
      {
        // Data is pre-filtered; multiYear prevents year-only filtering for lease/all-time.
        multiYear: periodType !== "ytd"
      }
    );

    return {
      ytd_rent_income: canonicalMetrics.ytd.rent_income,
      ytd_maintenance: canonicalMetrics.ytd.maintenance,
      ytd_pool: canonicalMetrics.ytd.pool,
      ytd_garden: canonicalMetrics.ytd.garden,
      ytd_hoa: canonicalMetrics.ytd.hoa_payments,
      ytd_pm_fee: canonicalMetrics.ytd.pm_fee,
      ytd_total_expenses: canonicalMetrics.ytd.total_expenses,
      ytd_net_income: canonicalMetrics.ytd.net_income,
      ytd_property_tax: canonicalMetrics.ytd.property_tax,
      cost_basis: canonicalMetrics.cost_basis,
      current_market_value: canonicalMetrics.current_market_value,
      appreciation_value: canonicalMetrics.appreciation_value,
      appreciation_pct: canonicalMetrics.appreciation_pct,
      roi_pre_tax: canonicalMetrics.roi_pre_tax,
      roi_post_tax: canonicalMetrics.roi_post_tax,
      roi_with_appreciation: canonicalMetrics.roi_with_appreciation,
      maintenance_pct: canonicalMetrics.maintenance_pct,
      months_owned: canonicalMetrics.months_owned
    };
  }, [property, monthly, selectedYear, periodType, monthsInPeriod, rawMetrics]);

  useEffect(() => {
    const loadMe = async () => {
      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          setMeInfo(null);
          return;
        }
        const res = await fetch("/api/me", {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setMeInfo(data);
        } else {
          setMeInfo(null);
        }
      } catch {
        setMeInfo(null);
      }
    };
    loadMe();
  }, []);

  useEffect(() => {
    loadOwnerProperties();
  }, [user, role]);

  useEffect(() => {
    if (selectedPropertyId && selectedPropertyId !== "mock-1") {
      loadFinancialData();
    }
  }, [selectedPropertyId, selectedYear]);

  const loadOwnerProperties = async () => {
    try {
      // Load properties associated with this owner from user_properties table
        const res = await fetch(`/api/properties`, { cache: "no-store" });
        const data = await res.json();

      if (!res.ok) {
        throw new Error("Failed to load properties");
      }

      setProperties(data);

      if (data.length > 0) {
        // Preserve existing selection if still present; otherwise select first.
        const stillExists = data.find((p: any) => p.id === selectedPropertyId);
        setSelectedPropertyId(stillExists ? selectedPropertyId : data[0].id);
      }
    } catch (err: any) {
      console.error("Error loading properties:", err);
      setError("Failed to load properties");
    } finally {
      setLoading(false);
    }
  };


  const loadFinancialData = async () => {
    try {
      setLoading(true);

      // Fetch data for the selected year
      const res = await fetch(
        `/api/owner/financial-metrics?propertyId=${selectedPropertyId}&year=${selectedYear}`,
        { cache: "no-store" }
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load financial data");
      }

      setProperty(data.property);

      // Determine which years we need to fetch based on period type and property dates
      const yearsToFetch = new Set<number>([selectedYear]);

      if (data.property) {
        // For lease term: fetch lease years
        if (data.property.lease_start && data.property.lease_end) {
          const leaseStart = getDateOnlyParts(data.property.lease_start);
          const leaseEnd = getDateOnlyParts(data.property.lease_end);
          if (leaseStart && leaseEnd) {
            for (let year = leaseStart.year; year <= leaseEnd.year; year++) {
              yearsToFetch.add(year);
            }
          }
        }

        // For all time: fetch from purchase date to current year
        if (data.property.purchase_date) {
          const purchase = getDateOnlyParts(data.property.purchase_date);
          const currentYear = new Date().getFullYear();
          if (purchase) {
            for (let year = purchase.year; year <= currentYear; year++) {
              yearsToFetch.add(year);
            }
          }
        }
      }

      // Fetch data from all required years
      const allMonthlyData = [...(data.monthly || [])];
      const otherYears = Array.from(yearsToFetch).filter(y => y !== selectedYear);

      for (const year of otherYears) {
        try {
          const yearRes = await fetch(
            `/api/owner/financial-metrics?propertyId=${selectedPropertyId}&year=${year}`,
            { cache: "no-store" }
          );

          if (yearRes.ok) {
            const yearData = await yearRes.json();
            if (yearData.monthly) {
              allMonthlyData.push(...yearData.monthly);
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch data for year ${year}:`, err);
        }
      }

      setMonthly(allMonthlyData);

        // Use pre-computed metrics from server (canonical calculations) as base
        if (data.metrics) {
          setRawMetrics({
            ytd_rent_income: data.metrics.ytd.rent_income,
            ytd_maintenance: data.metrics.ytd.maintenance,
            ytd_pool: data.metrics.ytd.pool,
            ytd_garden: data.metrics.ytd.garden,
            ytd_hoa: data.metrics.ytd.hoa_payments,
            ytd_pm_fee: data.metrics.ytd.pm_fee ?? 0,
            ytd_total_expenses: data.metrics.ytd.total_expenses,
            ytd_net_income: data.metrics.ytd.net_income,
            ytd_property_tax: data.metrics.ytd.property_tax,
            cost_basis: data.metrics.cost_basis,
            current_market_value: data.metrics.current_market_value,
            appreciation_value: data.metrics.appreciation_value,
            appreciation_pct: data.metrics.appreciation_pct,
            roi_pre_tax: data.metrics.roi_pre_tax,
            roi_post_tax: data.metrics.roi_post_tax,
            roi_with_appreciation: data.metrics.roi_with_appreciation,
            maintenance_pct: data.metrics.maintenance_pct,
            months_owned: data.metrics.months_owned,
          });
        }
        setYeTarget(data.yeTarget ?? null);
      setError(null);
    } catch (err: any) {
      console.error("Error loading financial data:", err);
      setError(err.message || "Failed to load financial data");
      setRawMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercentage = (value: number, decimals = 2) => {
    return value.toFixed(decimals) + "%";
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
        <div className="text-slate-700 text-xl">Loading your investment data...</div>
      </div>
    );
  }

  if (error || !metrics || !property) {
    return (
      <div className="p-0">
        <div className="max-w-2xl w-full bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
          <div className="text-center">
            <div className="text-slate-900 text-2xl mb-4 font-semibold">Property Dashboard</div>
            <div className="text-red-600 mb-4">
              {error || "No financial data available"}
            </div>
            <div className="text-slate-600 text-sm">
              Please contact your administrator to set up property financials and enter monthly data.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Projected ROI: canonical single calc using annual plan net income / cost basis.
  // Same formula used in admin dashboard and admin financials page.
  const projectedRoi = calculateExpectedRoi({
    targetMonthlyRent: property.target_monthly_rent || 0,
    plannedPoolMonthly: property.planned_pool_cost || 0,
    plannedGardenMonthly: property.planned_garden_cost || 0,
    plannedHoaMonthly: property.planned_hoa_cost || 0,
    plannedPmFeeMonthly: property.planned_pm_fee_monthly || 0,
    costBasis: metrics.cost_basis || 0,
  });
  const elapsedMonths = Math.max(
    filteredMonthly.filter(m => (m.rent_income || 0) > 0 || (m.total_expenses || 0) > 0).length,
    1
  );

  // Plan values for the same elapsed period (all plan expense lines, including PM fee)
  const planRentPeriod = (property.target_monthly_rent || 0) * elapsedMonths;
  const planMaintenancePeriod = planRentPeriod * 0.05;
  const planHoaPoolGardenPeriod = (
    (property.planned_pool_cost || 0) +
    (property.planned_garden_cost || 0) +
    (property.planned_hoa_cost || 0)
  ) * elapsedMonths;
  const planPmFeePeriod = (property.planned_pm_fee_monthly || 0) * elapsedMonths;
  const planNetIncomePeriod = planRentPeriod - planMaintenancePeriod - planHoaPoolGardenPeriod - planPmFeePeriod;
  const planRoiPeriod = metrics.cost_basis > 0
    ? (planNetIncomePeriod / metrics.cost_basis) * 100
    : 0;

  // Performance: grade against plan-based projected ROI (same unified calc)
  const performanceStatus =
    projectedRoi >= 5 && metrics.maintenance_pct < 5 ? "green" :
    projectedRoi >= 3 && metrics.maintenance_pct < 7 ? "yellow" : "red";
  const performanceLabel = performanceStatus === "green" ? "Excellent" : performanceStatus === "yellow" ? "Good" : "Needs Attention";
  const leaseStartDate = parseDateOnly(property.lease_start);
  const leaseEndDate = parseDateOnly(property.lease_end);
  const renewalDate = leaseEndDate ? new Date(leaseEndDate.getTime() - 90 * 24 * 60 * 60 * 1000) : null;
  const listingDate = leaseEndDate ? new Date(leaseEndDate.getTime() - 60 * 24 * 60 * 60 * 1000) : null;
  const todayDate = new Date();
  const getMonthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
  const getMonthEnd = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const addMonths = (date: Date, months: number) => new Date(date.getFullYear(), date.getMonth() + months, 1);
  const formatTimelineMonth = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const formatTimelineYear = (date: Date) =>
    date.toLocaleDateString("en-US", { year: "2-digit" });
  const timelineRangeStartBase = leaseStartDate || renewalDate || listingDate || leaseEndDate || todayDate;
  const timelineRangeEndBase = leaseEndDate || listingDate || renewalDate || leaseStartDate || todayDate;
  const timelineRangeStart = getMonthStart(addMonths(timelineRangeStartBase, -1));
  const timelineRangeEnd = getMonthEnd(addMonths(timelineRangeEndBase, 1));
  const timelineSpan = Math.max(timelineRangeEnd.getTime() - timelineRangeStart.getTime(), 1);
  const getTimelinePercent = (date: Date | null) => {
    if (!date) return 0;
    return Math.min(100, Math.max(0, ((date.getTime() - timelineRangeStart.getTime()) / timelineSpan) * 100));
  };
  const timelineMonths: Date[] = [];
  for (
    let cursor = getMonthStart(timelineRangeStart);
    cursor.getTime() <= timelineRangeEnd.getTime();
    cursor = addMonths(cursor, 1)
  ) {
    timelineMonths.push(new Date(cursor));
  }
  const activeRole = (meInfo?.role || role || "unknown") as string;
  const roleBadgeClass =
    activeRole === "admin"
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : activeRole === "owner"
        ? "bg-purple-100 text-purple-800 border-purple-200"
        : activeRole === "tenant"
          ? "bg-blue-100 text-blue-800 border-blue-200"
          : activeRole === "viewer"
            ? "bg-slate-200 text-slate-800 border-slate-300"
            : "bg-slate-100 text-slate-700 border-slate-200";

  const hasOperatingData = filteredMonthly.length > 0;
  const hasCostBasis = metrics.cost_basis > 0;
  const hasMarketValue = metrics.current_market_value > 0;
  const hasMaintenanceRatio = metrics.ytd_rent_income > 0;
  const hasAppreciationData = hasCostBasis && hasMarketValue;
  const currentValueDelta = hasAppreciationData ? metrics.current_market_value - metrics.cost_basis : null;

  const formatSignedCurrency = (value: number) => `${value >= 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`;

  const toneClassMap = {
    strong: "bg-green-50 text-green-700 border-green-200",
    stable: "bg-sky-50 text-sky-700 border-sky-200",
    watch: "bg-amber-50 text-amber-700 border-amber-200",
    attention: "bg-rose-50 text-rose-700 border-rose-200",
    neutral: "bg-slate-50 text-slate-600 border-slate-200",
  } as const;

  const assessNetIncome = () => {
    if (!hasOperatingData) return { label: "Not enough data yet", tone: "neutral" as const };
    if (metrics.ytd_net_income >= planNetIncomePeriod && metrics.ytd_net_income > 0) return { label: "Strong", tone: "strong" as const };
    if (metrics.ytd_net_income >= 0) return { label: "Stable", tone: "stable" as const };
    if (metrics.ytd_net_income >= -Math.max(planRentPeriod * 0.05, 1)) return { label: "Watch", tone: "watch" as const };
    return { label: "Needs attention", tone: "attention" as const };
  };

  const assessRoi = () => {
    if (!hasCostBasis || !hasOperatingData) return { label: "Not enough data yet", tone: "neutral" as const };
    if (metrics.roi_pre_tax >= 5) return { label: "Strong", tone: "strong" as const };
    if (metrics.roi_pre_tax >= 3) return { label: "Stable", tone: "stable" as const };
    if (metrics.roi_pre_tax >= 0) return { label: "Watch", tone: "watch" as const };
    return { label: "Needs attention", tone: "attention" as const };
  };

  const assessMaintenance = () => {
    if (!hasMaintenanceRatio) return { label: "Not enough data yet", tone: "neutral" as const };
    if (metrics.maintenance_pct < 5) return { label: "Strong", tone: "strong" as const };
    if (metrics.maintenance_pct < 7) return { label: "Stable", tone: "stable" as const };
    if (metrics.maintenance_pct < 10) return { label: "Watch", tone: "watch" as const };
    return { label: "Needs attention", tone: "attention" as const };
  };

  const assessAppreciation = () => {
    if (!hasAppreciationData || currentValueDelta === null) return { label: "Not enough data yet", tone: "neutral" as const };
    if (currentValueDelta > 0) return { label: "Strong", tone: "strong" as const };
    if (currentValueDelta === 0) return { label: "Stable", tone: "stable" as const };
    if (currentValueDelta >= -(metrics.cost_basis * 0.03)) return { label: "Watch", tone: "watch" as const };
    return { label: "Needs attention", tone: "attention" as const };
  };

  const assessValuePosition = () => {
    if (!hasAppreciationData || currentValueDelta === null) return { label: "Not enough data yet", tone: "neutral" as const };
    if (currentValueDelta >= metrics.cost_basis * 0.1) return { label: "Strong", tone: "strong" as const };
    if (currentValueDelta >= 0) return { label: "Stable", tone: "stable" as const };
    if (currentValueDelta >= -(metrics.cost_basis * 0.03)) return { label: "Watch", tone: "watch" as const };
    return { label: "Needs attention", tone: "attention" as const };
  };

  const netIncomeAssessment = assessNetIncome();
  const roiAssessment = assessRoi();
  const maintenanceAssessment = assessMaintenance();
  const appreciationAssessment = assessAppreciation();
  const valueAssessment = assessValuePosition();

  const summaryCards = [
    {
      title: "Net income",
      value: hasOperatingData ? formatCurrency(metrics.ytd_net_income) : "Not enough data yet",
      detail: hasOperatingData ? `${periodLabel} operating result` : "Waiting for billed rent or recorded monthly activity.",
      assessment: netIncomeAssessment,
    },
    {
      title: "ROI",
      value: hasCostBasis && hasOperatingData ? formatPercentage(metrics.roi_pre_tax) : "Not enough data yet",
      detail: hasCostBasis ? `Projected plan ROI ${formatPercentage(projectedRoi)}` : "Add a cost basis to evaluate return.",
      assessment: roiAssessment,
    },
    {
      title: "Maintenance burden",
      value: hasMaintenanceRatio ? formatPercentage(metrics.maintenance_pct) : "Not enough data yet",
      detail: hasMaintenanceRatio ? `${formatCurrency(metrics.ytd_maintenance)} of ${formatCurrency(metrics.ytd_rent_income)} rent` : "Needs rent and maintenance data in the selected period.",
      assessment: maintenanceAssessment,
    },
    {
      title: "Appreciation since purchase",
      value: currentValueDelta !== null ? formatSignedCurrency(currentValueDelta) : "Not enough data yet",
      detail: hasAppreciationData ? formatPercentage(metrics.appreciation_pct) : "Needs both cost basis and market value.",
      assessment: appreciationAssessment,
    },
    {
      title: "Current value vs cost basis",
      value: hasAppreciationData ? `${formatCurrency(metrics.current_market_value)} vs ${formatCurrency(metrics.cost_basis)}` : "Not enough data yet",
      detail: hasAppreciationData ? `Gap ${formatSignedCurrency(currentValueDelta ?? 0)}` : "Cost basis or current value is still missing.",
      assessment: valueAssessment,
    },
  ];

  const interpretationItems = [
    {
      title: "Income performance",
      assessment: netIncomeAssessment,
      body: hasOperatingData
        ? `${periodLabel} net income is ${formatCurrency(metrics.ytd_net_income)} against a plan of ${formatCurrency(planNetIncomePeriod)}.`
        : "Not enough data yet to compare income against plan.",
    },
    {
      title: "Maintenance pressure",
      assessment: maintenanceAssessment,
      body: hasMaintenanceRatio
        ? `Maintenance is ${formatPercentage(metrics.maintenance_pct)} of rent, with a target below 5%.`
        : "Not enough data yet to rate maintenance against rent.",
    },
    {
      title: "Property appreciation",
      assessment: appreciationAssessment,
      body: hasAppreciationData && currentValueDelta !== null
        ? `Current value is ${formatCurrency(metrics.current_market_value)} versus a cost basis of ${formatCurrency(metrics.cost_basis)}.`
        : "Not enough data yet to rate appreciation.",
    },
    {
      title: "Overall status",
      assessment: {
        label: performanceLabel === "Needs Attention" ? "Needs attention" : performanceLabel === "Excellent" ? "Strong" : "Stable",
        tone: performanceStatus === "green" ? "strong" as const : performanceStatus === "yellow" ? "stable" as const : "attention" as const,
      },
      body: `Projected ROI is ${formatPercentage(projectedRoi)} and maintenance is ${formatPercentage(metrics.maintenance_pct)} of rent for the selected report window.`,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="sticky top-0 z-20 rounded-xl border border-slate-200 bg-white px-4 py-5 shadow-sm md:top-4 md:px-8 md:py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-8 mb-4">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900 mb-1">
                  Investment Performance
                </h1>
                <p className="text-sm text-slate-600">
                  {property?.address || "Select a property"} - {periodLabel}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-700">
                <span className="px-2 py-1 rounded-full bg-slate-100 border border-slate-200">
                  {meInfo?.email || user?.email || "Signed out"}
                </span>
                <span className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${roleBadgeClass}`}>
                  {activeRole.toUpperCase()}
                </span>
              </div>
              <div className="flex gap-3">
                <select
                  value={selectedPropertyId}
                  onChange={(e) => setSelectedPropertyId(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.address}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  disabled={periodType !== "ytd"}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {availableYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
                <PeriodToggle value={periodType} onChange={setPeriodType} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8 space-y-8">

        {/* 1. Investment summary */}
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Investment Performance Summary</h2>
              <p className="mt-1 text-sm text-slate-500">
                A short operating summary for the selected property and report window.
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              {periodLabel}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            {summaryCards.map((card) => (
              <div key={card.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.title}</div>
                    <div className="mt-3 text-2xl font-semibold text-slate-900">{card.value}</div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClassMap[card.assessment.tone]}`}>
                    {card.assessment.label}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-500">{card.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Plain-English interpretation */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Plain-English Interpretation</h2>
              <p className="mt-1 text-sm text-slate-500">
                Short takeaways tied to the same underlying metrics shown below.
              </p>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
              performanceStatus === "green" ? "bg-green-50 border-green-200 text-green-700" :
              performanceStatus === "yellow" ? "bg-yellow-50 border-yellow-200 text-yellow-700" :
              "bg-red-50 border-red-200 text-red-700"
            }`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${performanceStatus === "green" ? "bg-green-500" : performanceStatus === "yellow" ? "bg-yellow-500" : "bg-red-500"}`} />
              {performanceLabel}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {interpretationItems.map((item) => (
              <div key={item.title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClassMap[item.assessment.tone]}`}>
                    {item.assessment.label}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Performance thresholds */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-slate-100 bg-white px-4 py-3 text-xs text-slate-500">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Thresholds</span>
          <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />Excellent: ROI &gt;= 5%, Maintenance &lt; 5%</span>
          <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-500" />Good: ROI &gt;= 3%, Maintenance &lt; 7%</span>
          <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />Needs Attention: below target</span>
          <span className="ml-auto text-slate-400">
            Now: {formatPercentage(projectedRoi)} projected ROI | {formatPercentage(metrics.maintenance_pct)} maintenance{" -> "}
            <span className={`font-semibold ${performanceStatus === "green" ? "text-green-600" : performanceStatus === "yellow" ? "text-yellow-600" : "text-red-600"}`}>{performanceLabel}</span>
          </span>
        </div>
        {/* 2. Unit Timeline */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Unit Timeline</h2>
              <p className="text-sm text-slate-500 mt-1">Renewal period begins 90 days before lease expiry; listing period begins 60 days before expiry.</p>
            </div>
          </div>
          {leaseStartDate && leaseEndDate ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                  <div className="text-xs uppercase tracking-wide text-slate-400">Lease Start</div>
                  <div className="font-medium text-slate-900">{formatDateOnly(property.lease_start)}</div>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                  <div className="text-xs uppercase tracking-wide text-slate-400">Renewal Period</div>
                  <div className="font-medium text-slate-900">{formatDateOnly(renewalDate?.toISOString().slice(0, 10) || null)}</div>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                  <div className="text-xs uppercase tracking-wide text-slate-400">Listing Period</div>
                  <div className="font-medium text-slate-900">{formatDateOnly(listingDate?.toISOString().slice(0, 10) || null)}</div>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                  <div className="text-xs uppercase tracking-wide text-slate-400">Lease End</div>
                  <div className="font-medium text-slate-900">{formatDateOnly(property.lease_end)}</div>
                </div>
              </div>
              <div className="relative h-52 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden px-4 py-4">
                <div className="absolute inset-x-4 top-3">
                  {timelineMonths.map((month) => (
                    <div
                      key={`${month.getFullYear()}-${month.getMonth()}`}
                      className="absolute -translate-x-1/2"
                      style={{ left: `${getTimelinePercent(month)}%` }}
                    >
                      <div className="text-[11px] font-semibold tracking-wide text-slate-700">
                        {formatTimelineMonth(month)}
                      </div>
                      <div className="text-[11px] text-slate-400">{formatTimelineYear(month)}</div>
                      <div className="absolute left-1/2 top-8 h-32 w-px -translate-x-1/2 bg-slate-200" />
                    </div>
                  ))}
                </div>
                <div
                  className="absolute top-14 h-9 rounded-md bg-emerald-300/80"
                  style={{
                    left: `${getTimelinePercent(leaseStartDate)}%`,
                    width: `${Math.max(getTimelinePercent(leaseEndDate) - getTimelinePercent(leaseStartDate), 6)}%`,
                    minWidth: "4rem",
                  }}
                />
                <div className="absolute left-6 top-[4.6rem] text-xs font-medium uppercase tracking-wide text-emerald-900">
                  Lease Term
                </div>
                <div
                  className="absolute top-28 flex min-h-[2.75rem] items-center justify-center rounded-md bg-slate-300/90 px-2 text-center text-[11px] font-medium leading-tight text-slate-700"
                  style={{
                    left: `${getTimelinePercent(renewalDate)}%`,
                    width: `${Math.max(getTimelinePercent(leaseEndDate) - getTimelinePercent(renewalDate), 6)}%`,
                    minWidth: "4.5rem",
                  }}
                >
                  <span>Renewal<br />Period</span>
                </div>
                <div
                  className="absolute top-40 flex min-h-[2.75rem] items-center justify-center rounded-md bg-slate-800/90 px-2 text-center text-[11px] font-medium leading-tight text-white"
                  style={{
                    left: `${getTimelinePercent(listingDate)}%`,
                    width: `${Math.max(getTimelinePercent(leaseEndDate) - getTimelinePercent(listingDate), 6)}%`,
                    minWidth: "4.5rem",
                  }}
                >
                  <span>Listing<br />Period</span>
                </div>
                <div
                  className="absolute top-0 bottom-0 w-px bg-slate-800"
                  style={{ left: `${getTimelinePercent(todayDate)}%` }}
                />
                <div
                  className="absolute top-1 h-3 w-3 -translate-x-1/2 rounded-full bg-slate-800"
                  style={{ left: `${getTimelinePercent(todayDate)}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              Lease start and end dates are required to render the unit timeline.
            </div>
          )}
        </div>

        {/* 5. Detailed metrics */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Detailed Metrics</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Keep the full numeric table available without making it the first thing owners see.
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 group-open:hidden">
                Show details
              </span>
              <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 group-open:inline-flex">
                Hide details
              </span>
            </summary>
            <div className="mt-5 border-t border-slate-100 pt-5">
              <InvestmentPerformanceTable
                actual={{
                  grossIncome: metrics.ytd_rent_income,
                  maintenance: metrics.ytd_maintenance,
                  maintenancePct: metrics.maintenance_pct,
                  hoaPoolGarden: metrics.ytd_hoa + metrics.ytd_pool + metrics.ytd_garden,
                  pmFee: metrics.ytd_pm_fee,
                  totalExpenses: metrics.ytd_total_expenses,
                  netIncome: metrics.ytd_net_income,
                  propertyTax: metrics.ytd_property_tax,
                }}
                plan={{
                  grossIncome: planRentPeriod,
                  maintenance: planMaintenancePeriod,
                  hoaPoolGarden: planHoaPoolGardenPeriod,
                  pmFee: planPmFeePeriod,
                  totalExpenses: planMaintenancePeriod + planHoaPoolGardenPeriod + planPmFeePeriod,
                  netIncome: planNetIncomePeriod,
                }}
                yeTarget={yeTarget ? {
                  grossIncome: yeTarget.rent_income,
                  maintenance: yeTarget.maintenance,
                  hoaPoolGarden: yeTarget.hoa + yeTarget.pool + yeTarget.garden,
                  pmFee: yeTarget.net_income < yeTarget.rent_income - yeTarget.maintenance - yeTarget.hoa - yeTarget.pool - yeTarget.garden
                    ? yeTarget.rent_income - yeTarget.maintenance - yeTarget.hoa - yeTarget.pool - yeTarget.garden - yeTarget.net_income
                    : 0,
                  totalExpenses: yeTarget.total_expenses,
                  netIncome: yeTarget.net_income,
                  propertyTax: yeTarget.property_tax,
                } : null}
                roi={{
                  preTax: metrics.roi_pre_tax,
                  postTax: metrics.roi_post_tax,
                  appreciationPct: metrics.appreciation_pct,
                  planRoi: planRoiPeriod,
                  yeTargetRoi: yeTarget && metrics.cost_basis > 0 ? (yeTarget.net_income / metrics.cost_basis) * 100 : null,
                }}
                home={{
                  costBasis: metrics.cost_basis,
                  currentMarketValue: metrics.current_market_value,
                  appreciationValue: metrics.appreciation_value,
                  appreciationPct: metrics.appreciation_pct,
                  ytdAppreciationValue: ytdAppreciationData.value,
                  ytdAppreciationPct: metrics.cost_basis > 0 ? (ytdAppreciationData.value / metrics.cost_basis * 100) : 0,
                  ytdLabel: ytdAppreciationData.label,
                  monthlyGain: metrics.months_owned > 0 ? metrics.appreciation_value / metrics.months_owned : 0,
                  monthlyGainPct: metrics.months_owned > 0 && metrics.cost_basis > 0 ? (metrics.appreciation_value / metrics.months_owned / metrics.cost_basis * 100) : 0,
                  annualizedGain: metrics.months_owned > 0 ? metrics.appreciation_value / metrics.months_owned * 12 : 0,
                  annualizedGainPct: metrics.months_owned > 0 && metrics.cost_basis > 0 ? (metrics.appreciation_value / metrics.months_owned * 12 / metrics.cost_basis * 100) : 0,
                  monthsOwned: metrics.months_owned,
                }}
                closingCosts={saleClosingCosts}
                onClosingCostsChange={setSaleClosingCosts}
              />
            </div>
          </details>
        </div>

        {/* 6. Expense summary */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                {`Expense Summary - ${periodLabel}`}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                One consolidated expense breakdown for the selected reporting window.
              </p>
            </div>
            <span className="text-xs font-medium text-slate-500">
              Gross {formatCurrency(financialStatementRow.grossIncome)} - Expenses {formatCurrency(financialStatementRow.totalExpenses)} = Net {formatCurrency(financialStatementRow.netIncome)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-semibold">Category</th>
                  <th className="py-2 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="py-3 pr-4 text-slate-700">Maintenance</td>
                  <td className="py-3 text-slate-900">{formatCurrency(financialStatementRow.maintenance)}</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-3 pr-4 text-slate-700">HOA / Pool / Garden</td>
                  <td className="py-3 text-slate-900">{formatCurrency(financialStatementRow.hoa + financialStatementRow.pool + financialStatementRow.garden)}</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-3 pr-4 text-slate-700">PM Fee</td>
                  <td className="py-3 text-slate-900">{formatCurrency(financialStatementRow.pmFee)}</td>
                </tr>
                {financialStatementRow.otherExpenses > 0 ? (
                  <tr className="border-b border-slate-100">
                    <td className="py-3 pr-4 text-slate-700">Other</td>
                    <td className="py-3 text-slate-900">{formatCurrency(financialStatementRow.otherExpenses)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td className="py-3 pr-4 font-semibold text-slate-900">Total Expenses</td>
                  <td className="py-3 font-semibold text-slate-900">{formatCurrency(financialStatementRow.totalExpenses)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 7. Charts */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                  {`Income Statement - ${periodLabel}`}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {`Aggregated across the currently selected ${periodLabel.toLowerCase()} reporting window.`}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                financialStatementRow.netIncome >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}>
                {financialStatementRow.netIncome >= 0 ? "Positive Net" : "Negative Net"}
              </span>
            </div>
            <Bar
              data={{
                labels: ["Gross Income", "Total Expenses", "Net Income"],
                datasets: [{
                  data: [
                    financialStatementRow.grossIncome,
                    financialStatementRow.totalExpenses,
                    financialStatementRow.netIncome,
                  ],
                  backgroundColor: [
                    "#0f766e",
                    "#c2410c",
                    financialStatementRow.netIncome >= 0 ? "#15803d" : "#dc2626",
                  ],
                  borderRadius: 6,
                }]
              }}
              options={{
                devicePixelRatio: 2,
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: "rgba(15,23,42,0.92)",
                    titleColor: "#f8fafc",
                    bodyColor: "#e2e8f0",
                    padding: 10,
                    callbacks: {
                      label: (context) => `${context.label}: ${formatCurrency(context.parsed.y || 0)}`,
                    }
                  }
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: {
                      color: "#64748b",
                      font: { size: 11 },
                      callback: (value) => "$" + value.toLocaleString(),
                    },
                    grid: { color: "#f1f5f9" }
                  },
                  x: {
                    ticks: { color: "#64748b", font: { size: 10 } },
                    grid: { display: false }
                  }
                }
              }}
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Financial Performance Trend</h3>
              <p className="mt-1 text-xs text-slate-500">
                Net income trend with reconciled tooltip detail for gross income, expenses, and expense ratio.
              </p>
            </div>
            <Line
              data={{
                labels: financialRowsForView.map((row) => row.label),
                datasets: [{
                  label: "Net Income",
                  data: financialRowsForView.map((row) => row.netIncome),
                  borderWidth: 3,
                  tension: 0.3,
                  fill: false,
                  segment: {
                    borderColor: (ctx) => {
                      const nextValue = Number(ctx.p1.parsed.y || 0);
                      return nextValue < 0 ? "#dc2626" : "#15803d";
                    },
                  },
                  pointRadius: 4,
                  pointHoverRadius: 6,
                  pointBackgroundColor: financialRowsForView.map((row) => row.netIncome < 0 ? "#dc2626" : "#15803d"),
                  pointBorderColor: financialRowsForView.map((row) => row.netIncome < 0 ? "#dc2626" : "#15803d"),
                }]
              }}
              options={{
                devicePixelRatio: 2,
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: "rgba(15,23,42,0.92)",
                    titleColor: "#f8fafc",
                    bodyColor: "#e2e8f0",
                    padding: 10,
                    callbacks: {
                      label: (context) => `Net Income: ${formatCurrency(context.parsed.y || 0)}`,
                      afterLabel: (context) => {
                        const row = financialRowsForView[context.dataIndex];
                        if (!row) return [];
                        return [
                          `Rent Income: ${formatCurrency(row.grossIncome)}`,
                          `Total Expenses: ${formatCurrency(row.totalExpenses)}`,
                          `Expense Ratio: ${formatPercentage(row.expenseRatio)}`,
                        ];
                      },
                    }
                  }
                },
                scales: {
                  y: {
                    ticks: {
                      color: "#64748b",
                      font: { size: 11 },
                      callback: (value) => "$" + value.toLocaleString(),
                    },
                    grid: { color: "#f1f5f9" }
                  },
                  x: {
                    ticks: { color: "#64748b", font: { size: 10 } },
                    grid: { display: false }
                  }
                }
              }}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <Line
              data={{
                labels: marketEstimateData.map(m => m.month_name),
                datasets: [{
                  label: "Property Market Estimate",
                  data: marketEstimateData.map(m => m.property_market_estimate || 0),
                  borderColor: "#4472c4",
                  backgroundColor: "rgba(68,114,196,0.07)",
                  borderWidth: 2.5,
                  tension: 0.3,
                  fill: true,
                  pointRadius: 4,
                  pointHoverRadius: 6,
                  pointBackgroundColor: "#4472c4",
                }]
              }}
              options={{
                devicePixelRatio: 2, responsive: true, maintainAspectRatio: true,
                plugins: {
                  title: { display: true, text: "Property Market Estimate", color: "#475569", font: { size: 13 } },
                  legend: { display: false },
                  tooltip: { backgroundColor: "rgba(15,23,42,0.92)", titleColor: "#f8fafc", bodyColor: "#e2e8f0", padding: 10, callbacks: { label: (context) => formatCurrency(context.parsed.y || 0) } }
                },
                scales: {
                  y: { ticks: { color: "#64748b", font: { size: 11 }, callback: (value) => "$" + value.toLocaleString() }, grid: { color: "#f1f5f9" } },
                  x: { ticks: { color: "#64748b", font: { size: 10 } }, grid: { display: false } }
                }
              }}
            />
          </div>
        </div>
      </div>

    </div>
  );
}


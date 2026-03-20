"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/app/context/AuthContext";
import Image from "next/image";
import GaugeChart from "@/app/components/charts/GaugeChart";
import { calculateCanonicalMetrics } from "@/lib/calculations/canonical-metrics";
import { calculateExpectedRoi } from "@/lib/financial-calculations";
import { PeriodToggle } from "@/app/components/ui/PeriodToggle";
import { usePeriodFilter } from "@/app/hooks/usePeriodFilter";
import { getDateOnlyParts } from "@/lib/date-only";
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

export default function OwnerDashboard() {
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
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

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

  const chartMonthlyData = useMemo(() => {
    const trimmed = chronologicalMonthly.filter((m) => {
      const hasIncome = (m.rent_income || 0) !== 0;
      const hasExpenses =
        (m.maintenance || 0) !== 0 ||
        (m.pool || 0) !== 0 ||
        (m.garden || 0) !== 0 ||
        (m.hoa_payments || 0) !== 0 ||
        (m.pm_fee || 0) !== 0;
      const hasTotals =
        (m.total_expenses || 0) !== 0 ||
        (m.net_income || 0) !== 0;
      return hasIncome || hasExpenses || hasTotals;
    });
    return trimmed.length > 0 ? trimmed : chronologicalMonthly;
  }, [chronologicalMonthly]);

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

  const handleChatSend = async () => {
    if (!chatInput.trim()) return;
    const userMessage = { role: "user" as const, content: chatInput.trim() };
    const systemContext = `
You are the Luxor Owner Assistant. Be concise.
Answer only for the selected property (${property?.address || "Unknown"}). If unsure, ask for clarification.
Use the provided property and document context from the server; do not guess.`;

    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput("");
    setChatError(null);
    setChatLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...chatMessages, userMessage],
          systemPrompt: systemContext,
          propertyId: selectedPropertyId,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Chat request failed");
      }
      const assistantMessage = { role: "assistant" as const, content: data.content || "Sorry, I didn't get that." };
      setChatMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error(err);
      setChatError(err.message || "Chat failed");
    } finally {
      setChatLoading(false);
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-700 text-xl">Loading your investment data...</div>
      </div>
    );
  }

  if (error || !metrics || !property) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
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

  const expectedRoi = calculateExpectedRoi({
    targetMonthlyRent: property.target_monthly_rent || 0,
    plannedPoolMonthly: property.planned_pool_cost || 0,
    plannedGardenMonthly: property.planned_garden_cost || 0,
    plannedHoaMonthly: property.planned_hoa_cost || 0,
    costBasis: metrics.cost_basis || 0,
  });

  // Projected ROI: annualize from elapsed months with actual data
  const elapsedMonths = Math.max(
    filteredMonthly.filter(m => (m.rent_income || 0) > 0 || (m.total_expenses || 0) > 0).length,
    1
  );
  const projectedRoi = metrics.cost_basis > 0
    ? ((metrics.ytd_net_income / elapsedMonths) * 12 / metrics.cost_basis) * 100
    : 0;

  // Plan values for the same elapsed period
  const planRentPeriod = (property.target_monthly_rent || 0) * elapsedMonths;
  const planMaintenancePeriod = planRentPeriod * 0.05;
  const planOtherPeriod = (
    (property.planned_pool_cost || 0) +
    (property.planned_garden_cost || 0) +
    (property.planned_hoa_cost || 0)
  ) * elapsedMonths;
  const planNetIncomePeriod = planRentPeriod - planMaintenancePeriod - planOtherPeriod;

  // Performance: uses projectedRoi + updated maintenance thresholds
  const performanceStatus =
    projectedRoi >= 5 && metrics.maintenance_pct < 4 ? "green" :
    projectedRoi >= 3 && metrics.maintenance_pct < 5 ? "yellow" : "red";
  const performanceLabel = performanceStatus === "green" ? "Excellent" : performanceStatus === "yellow" ? "Good" : "Needs Attention";

  const gaugeRoiTotal = metrics.roi_with_appreciation;
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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header — unchanged */}
      <div className="bg-white border-b border-slate-200 py-6 px-8 shadow-sm">
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

        {/* 1. ROI Speedometers — top */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Return on Investment</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div
              className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-help"
              title="Expected: (Target Rent − Planned Expenses) / Cost Basis × 100 — annualized from plan"
            >
              <GaugeChart value={expectedRoi} target={0} label="Expected ROI (Plan)" unit="%" maxValue={15} colorThresholds={{ green: 80, yellow: 60 }} showTarget={false} />
            </div>
            <div
              className={`bg-white border-2 p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-help ${projectedRoi >= 5 ? "border-green-400" : projectedRoi >= 3 ? "border-yellow-400" : "border-red-400"}`}
              title={`Projected: (Net Income ÷ ${elapsedMonths} months × 12) / Cost Basis × 100`}
            >
              <GaugeChart value={projectedRoi} target={0} label="Projected ROI (Annualized)" unit="%" maxValue={15} colorThresholds={{ green: 80, yellow: 60 }} showTarget={false} />
              {activeRole === "admin" && (
                <div className="mt-1 text-center text-[10px] text-slate-400 leading-tight">
                  ({formatCurrency(metrics.ytd_net_income)} ÷ {elapsedMonths}mo × 12) ÷ {formatCurrency(metrics.cost_basis)}
                </div>
              )}
            </div>
            <div
              className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-help"
              title="Total ROI: (Net Income + Appreciation) / Cost Basis × 100"
            >
              <GaugeChart value={gaugeRoiTotal} target={0} label="Total ROI (with Appreciation)" unit="%" maxValue={40} colorThresholds={{ green: 80, yellow: 60 }} showTarget={false} />
            </div>
          </div>
        </div>

        {/* 2. Investment Report Narrative */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Investment Report</h2>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
              performanceStatus === "green" ? "bg-green-50 border-green-200 text-green-700" :
              performanceStatus === "yellow" ? "bg-yellow-50 border-yellow-200 text-yellow-700" :
              "bg-red-50 border-red-200 text-red-700"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${performanceStatus === "green" ? "bg-green-500" : performanceStatus === "yellow" ? "bg-yellow-500" : "bg-red-500"}`} />
              {performanceLabel}
            </span>
          </div>
          <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
            <p>
              Investment performance is <span className={`font-semibold ${performanceStatus === "green" ? "text-green-700" : performanceStatus === "yellow" ? "text-yellow-700" : "text-red-700"}`}>{performanceLabel}</span> based on income, maintenance, expenses, and asset appreciation.
            </p>
            <p>
              <span className="font-semibold">Operating Income & Expenses: </span>
              {periodLabel} income is <span className="font-medium">{formatCurrency(metrics.ytd_rent_income)}</span> against a plan of <span className="font-medium">{formatCurrency(planRentPeriod)}</span>. Maintenance is <span className={`font-medium ${metrics.maintenance_pct < 4 ? "text-green-700" : metrics.maintenance_pct < 5 ? "text-yellow-700" : "text-red-700"}`}>{formatCurrency(metrics.ytd_maintenance)} ({formatPercentage(metrics.maintenance_pct)} of rent)</span> — target is under 4%. Other fees (HOA, pool, garden) are {formatCurrency(metrics.ytd_hoa + metrics.ytd_pool + metrics.ytd_garden)}, leaving a net income of <span className={`font-semibold ${metrics.ytd_net_income >= 0 ? "text-green-700" : "text-red-700"}`}>{formatCurrency(metrics.ytd_net_income)}</span> against a plan of <span className="font-medium">{formatCurrency(planNetIncomePeriod)}</span>. The property is projected to yield <span className={`font-semibold ${projectedRoi >= 5 ? "text-green-700" : projectedRoi >= 3 ? "text-yellow-700" : "text-red-700"}`}>{formatPercentage(projectedRoi)} annualized</span> — plan is {formatPercentage(expectedRoi)}.
            </p>
            {metrics.ytd_property_tax > 0 ? (
              <p>
                <span className="font-semibold">Property Taxes: </span>
                Property taxes of {formatCurrency(metrics.ytd_property_tax)} have been collected this period, reducing after-tax net income to {formatCurrency(metrics.ytd_net_income - metrics.ytd_property_tax)}.
              </p>
            ) : (
              <p>
                <span className="font-semibold">Property Taxes: </span>
                Property taxes have not been collected yet this period and are not reflected in the figures above.
              </p>
            )}
            <p>
              <span className="font-semibold">Home Value: </span>
              The property was acquired for {formatCurrency(metrics.cost_basis)} and is currently valued at <span className="font-medium">{formatCurrency(metrics.current_market_value)}</span>{metrics.appreciation_value !== 0 ? `, ${metrics.appreciation_value >= 0 ? "an increase" : "a decrease"} of ${formatCurrency(Math.abs(metrics.appreciation_value))} (${formatPercentage(Math.abs(metrics.appreciation_pct))})` : ""}{ metrics.months_owned > 0 ? ` over ${metrics.months_owned} months of ownership` : ""}. Total return including appreciation is <span className={`font-semibold ${metrics.roi_with_appreciation >= 10 ? "text-green-700" : metrics.roi_with_appreciation >= 5 ? "text-yellow-700" : "text-red-700"}`}>{formatPercentage(metrics.roi_with_appreciation)}</span>.
            </p>
          </div>
        </div>

        {/* 3. Investment Metrics — sectioned, actual vs plan */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Investment Metrics</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {/* Property & Capital */}
            <div className="px-6 py-2 bg-slate-50">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Property & Capital</span>
            </div>
            <div className="grid grid-cols-3 px-6 py-3 text-sm hover:bg-slate-50">
              <span className="text-slate-600">Cost Basis</span>
              <span className="font-semibold text-slate-900">{formatCurrency(metrics.cost_basis)}</span>
              <span className="text-xs text-slate-400">Purchase + repairs + closing costs</span>
            </div>
            <div className="grid grid-cols-3 px-6 py-3 text-sm hover:bg-slate-50">
              <span className="text-slate-600">Current Market Value</span>
              <span className="font-semibold text-slate-900">{formatCurrency(metrics.current_market_value)}</span>
              <span className="text-xs text-slate-400">Latest monthly estimate</span>
            </div>
            <div className="grid grid-cols-3 px-6 py-3 text-sm hover:bg-slate-50">
              <span className="text-slate-600">Appreciation</span>
              <span className={`font-semibold ${metrics.appreciation_value >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(metrics.appreciation_value)} ({formatPercentage(metrics.appreciation_pct)})
              </span>
              <span className="text-xs text-slate-400">Since purchase · {metrics.months_owned} months owned</span>
            </div>

            {/* Income & Expenses */}
            <div className="px-6 py-2 bg-slate-50">
              <div className="grid grid-cols-3">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Income & Expenses — {periodLabel}</span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Actual</span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Plan</span>
              </div>
            </div>
            <div className="grid grid-cols-3 px-6 py-3 text-sm hover:bg-slate-50">
              <span className="text-slate-600">Gross Rent Income</span>
              <span className="font-semibold text-slate-900">{formatCurrency(metrics.ytd_rent_income)}</span>
              <span className="text-slate-400">{formatCurrency(planRentPeriod)}</span>
            </div>
            <div className="grid grid-cols-3 px-6 py-3 text-sm hover:bg-slate-50">
              <span className="text-slate-600">Maintenance</span>
              <span className={`font-semibold ${metrics.maintenance_pct < 4 ? "text-green-600" : metrics.maintenance_pct < 5 ? "text-yellow-600" : "text-red-600"}`}>
                {formatCurrency(metrics.ytd_maintenance)} <span className="text-xs">({formatPercentage(metrics.maintenance_pct)})</span>
              </span>
              <span className="text-slate-400">{formatCurrency(planMaintenancePeriod)} <span className="text-xs">(5% target)</span></span>
            </div>
            <div className="grid grid-cols-3 px-6 py-3 text-sm hover:bg-slate-50">
              <span className="text-slate-600">HOA, Pool & Garden</span>
              <span className="font-semibold text-slate-900">{formatCurrency(metrics.ytd_hoa + metrics.ytd_pool + metrics.ytd_garden)}</span>
              <span className="text-slate-400">{formatCurrency(planOtherPeriod)}</span>
            </div>
            {metrics.ytd_property_tax > 0 && (
              <div className="grid grid-cols-3 px-6 py-3 text-sm hover:bg-slate-50">
                <span className="text-slate-600">Property Tax</span>
                <span className="font-semibold text-slate-900">{formatCurrency(metrics.ytd_property_tax)}</span>
                <span className="text-xs text-slate-400">—</span>
              </div>
            )}
            <div className="grid grid-cols-3 px-6 py-3 text-sm hover:bg-slate-50 font-semibold border-t border-slate-200">
              <span className="text-slate-700">Net Income</span>
              <span className={metrics.ytd_net_income >= 0 ? "text-green-600" : "text-red-600"}>{formatCurrency(metrics.ytd_net_income)}</span>
              <span className={planNetIncomePeriod >= 0 ? "text-slate-500" : "text-red-500"}>{formatCurrency(planNetIncomePeriod)}</span>
            </div>

            {/* ROI */}
            <div className="px-6 py-2 bg-slate-50">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Return on Investment</span>
            </div>
            <div className="grid grid-cols-3 px-6 py-3 text-sm hover:bg-slate-50">
              <span className="text-slate-600">Projected ROI (annualized)</span>
              <span className={`font-semibold ${projectedRoi >= 5 ? "text-green-600" : projectedRoi >= 3 ? "text-yellow-600" : "text-red-600"}`}>
                {formatPercentage(projectedRoi)}
                {activeRole === "admin" && <span className="ml-1 text-[10px] font-normal text-slate-400">(net ÷ {elapsedMonths}mo × 12 ÷ cost)</span>}
              </span>
              <span className="text-xs text-slate-400">Based on {elapsedMonths} months of actual data</span>
            </div>
            <div className="grid grid-cols-3 px-6 py-3 text-sm hover:bg-slate-50">
              <span className="text-slate-600">Expected ROI (plan)</span>
              <span className={`font-semibold ${expectedRoi >= 5 ? "text-green-600" : expectedRoi >= 3 ? "text-yellow-600" : "text-red-600"}`}>{formatPercentage(expectedRoi)}</span>
              <span className="text-xs text-slate-400">From target rent & planned expenses</span>
            </div>
            <div className="grid grid-cols-3 px-6 py-3 text-sm hover:bg-slate-50">
              <span className="text-slate-700 font-semibold">Total ROI (incl. appreciation)</span>
              <span className={`font-bold text-base ${metrics.roi_with_appreciation >= 10 ? "text-green-600" : metrics.roi_with_appreciation >= 5 ? "text-yellow-600" : "text-red-600"}`}>
                {formatPercentage(metrics.roi_with_appreciation)}
              </span>
              <span className="text-xs text-slate-400">(Net Income + Appreciation) / Cost Basis</span>
            </div>
          </div>
        </div>

        {/* 4. Performance Thresholds — compact, subdued */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500 bg-white border border-slate-100 rounded-lg py-3 px-4">
          <span className="font-semibold text-[10px] text-slate-400 uppercase tracking-wide">Thresholds</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Excellent: Proj ROI ≥5%, Maint &lt;4%</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />Good: ≥3%, Maint &lt;4.5%</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />Needs Attention: below these</span>
          <span className="ml-auto text-slate-400">
            Now: {formatPercentage(projectedRoi)} proj · {formatPercentage(metrics.maintenance_pct)} maint{" → "}
            <span className={`font-semibold ${performanceStatus === "green" ? "text-green-600" : performanceStatus === "yellow" ? "text-yellow-600" : "text-red-600"}`}>{performanceLabel}</span>
          </span>
        </div>

        {/* 5. Luxor AI */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-lg">
          <div className="p-6 border-b border-slate-200 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1f2937] via-[#0f172a] to-[#1e293b] flex items-center justify-center overflow-hidden shadow-sm">
              <Image src="/luxor-ai.png" alt="Luxor logo" width={52} height={52} className="object-contain mix-blend-lighten opacity-90" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Luxor AI</h2>
              <p className="text-sm text-slate-600">Luxor&apos;s AI-driven Investment Report.</p>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-md p-3 bg-slate-50">
              {chatMessages.map((m, idx) => (
                <div key={idx} className={`mb-2 ${m.role === "user" ? "text-slate-900" : "text-slate-800"}`}>
                  <span className="font-semibold text-xs uppercase mr-2">{m.role === "user" ? "You" : "Assistant"}</span>
                  <span className="text-sm">{m.content}</span>
                </div>
              ))}
            </div>
            {chatError && <p className="text-sm text-red-600">{chatError}</p>}
            <div className="flex gap-2 items-start">
              <textarea
                className="flex-1 border border-slate-300 rounded-lg px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                rows={2}
                placeholder="Ask about your property."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button onClick={handleChatSend} disabled={chatLoading} className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 shadow-sm h-fit">
                {chatLoading ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>

        {/* 6. Charts — devicePixelRatio:2 for sharpness */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
            <h3 className="text-sm text-center font-semibold text-slate-700 uppercase tracking-wide mb-6">Income Summary ({selectedYear})</h3>
            <Bar
              data={{
                labels: ["Gross Income", "Maintenance", "HOA, Pool, Garden", "Total Expenses", "Net Income", "Property Tax"],
                datasets: [{ data: [metrics.ytd_rent_income, metrics.ytd_maintenance, metrics.ytd_pool + metrics.ytd_garden + metrics.ytd_hoa, metrics.ytd_total_expenses, metrics.ytd_net_income, metrics.ytd_property_tax], backgroundColor: ["#5b9bd5", "#ed7d31", "#70ad47", "#ffc000", "#4472c4", "#7030a0"], borderRadius: 4 }]
              }}
              options={{
                devicePixelRatio: 2, responsive: true, maintainAspectRatio: true,
                plugins: {
                  legend: { display: false },
                  tooltip: { backgroundColor: "rgba(15,23,42,0.92)", titleColor: "#f8fafc", bodyColor: "#e2e8f0", padding: 10, callbacks: { label: (context) => formatCurrency(context.parsed.y || 0) } }
                },
                scales: {
                  y: { beginAtZero: true, ticks: { color: "#64748b", font: { size: 11 }, callback: (value) => "$" + value.toLocaleString() }, grid: { color: "#f1f5f9" } },
                  x: { ticks: { color: "#64748b", font: { size: 10 } }, grid: { display: false } }
                }
              }}
            />
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
            <h3 className="text-sm text-center font-semibold text-slate-700 uppercase tracking-wide mb-6">Monthly Business Expenses</h3>
            <Bar
              data={{
                labels: chartMonthlyData.map(m => m.month_name),
                datasets: [
                  { label: "Maintenance", data: chartMonthlyData.map(m => m.maintenance), backgroundColor: "#ed7d31", borderRadius: 2 },
                  { label: "Pool", data: chartMonthlyData.map(m => m.pool), backgroundColor: "#5b9bd5", borderRadius: 2 },
                  { label: "Garden", data: chartMonthlyData.map(m => m.garden), backgroundColor: "#a5a5a5", borderRadius: 2 },
                  { label: "HOA Payments", data: chartMonthlyData.map(m => m.hoa_payments), backgroundColor: "#ffc000", borderRadius: 2 },
                  { label: "PM Fee", data: chartMonthlyData.map(m => m.pm_fee || 0), backgroundColor: "#14b8a6", borderRadius: 2 },
                ]
              }}
              options={{
                devicePixelRatio: 2, responsive: true, maintainAspectRatio: true,
                plugins: {
                  legend: { display: true, position: "bottom", labels: { color: "#64748b", font: { size: 10 }, boxWidth: 12, padding: 12 } },
                  tooltip: { backgroundColor: "rgba(15,23,42,0.92)", titleColor: "#f8fafc", bodyColor: "#e2e8f0", padding: 10, callbacks: { label: (context) => context.dataset.label + ": " + formatCurrency(context.parsed.y || 0) } }
                },
                scales: {
                  y: { beginAtZero: true, stacked: true, ticks: { color: "#64748b", font: { size: 11 }, callback: (value) => "$" + value.toLocaleString() }, grid: { color: "#f1f5f9" } },
                  x: { stacked: true, ticks: { color: "#64748b", font: { size: 10 } }, grid: { display: false } }
                }
              }}
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Monthly Trends</h2>
          <div className="bg-white border border-slate-200 p-6 mb-6 rounded-xl shadow-sm">
            <Bar
              data={{
                labels: chartMonthlyData.map(m => m.month_name),
                datasets: [
                  { label: "Rent Income", data: chartMonthlyData.map(m => m.rent_income), backgroundColor: "#a9d18e", borderRadius: 3 },
                  { label: "Total Expenses", data: chartMonthlyData.map(m => m.total_expenses), backgroundColor: "#e17055", borderRadius: 3 },
                  { label: "Net Income", data: chartMonthlyData.map(m => m.net_income), backgroundColor: "#70ad47", borderRadius: 3 },
                ]
              }}
              options={{
                devicePixelRatio: 2, responsive: true, maintainAspectRatio: true,
                plugins: {
                  title: { display: true, text: "Monthly Income and Expense Statement", color: "#475569", font: { size: 13 } },
                  legend: { display: true, position: "bottom", labels: { color: "#64748b", font: { size: 10 }, padding: 12 } },
                  tooltip: { backgroundColor: "rgba(15,23,42,0.92)", titleColor: "#f8fafc", bodyColor: "#e2e8f0", padding: 10, callbacks: { label: (context) => context.dataset.label + ": " + formatCurrency(context.parsed.y || 0) } }
                },
                scales: {
                  y: { beginAtZero: true, ticks: { color: "#64748b", font: { size: 11 }, callback: (value) => "$" + value.toLocaleString() }, grid: { color: "#f1f5f9" } },
                  x: { ticks: { color: "#64748b", font: { size: 10 } }, grid: { display: false } }
                }
              }}
            />
          </div>
          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
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

      {/* Owner Assistant */}
      <div className="mt-10 bg-white border border-slate-200 rounded-lg shadow-sm">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Owner Assistant (AI)</h2>
            <p className="text-sm text-slate-600">Ask questions about your property and financials.</p>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-md p-3 bg-slate-50">
            {chatMessages.length === 0 ? (
              <p className="text-sm text-slate-500">Ask a question to get started.</p>
            ) : (
              chatMessages.map((m, idx) => (
                <div key={idx} className={`mb-2 ${m.role === "user" ? "text-slate-900" : "text-slate-800"}`}>
                  <span className="font-semibold text-xs uppercase mr-2">{m.role === "user" ? "You" : "Assistant"}</span>
                  <span className="text-sm">{m.content}</span>
                </div>
              ))
            )}
          </div>
          {chatError && <p className="text-sm text-red-600">{chatError}</p>}
          <div className="flex gap-2">
            <textarea className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} placeholder="Ask about your lease, expenses, ROI, etc." value={chatInput} onChange={(e) => setChatInput(e.target.value)} />
            <button onClick={handleChatSend} disabled={chatLoading} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60 h-fit">
              {chatLoading ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/app/context/AuthContext";
import Image from "next/image";
import GaugeChart from "@/app/components/charts/GaugeChart";
import { calculateCanonicalMetrics } from "@/lib/calculations/canonical-metrics";
import { PeriodToggle } from "@/app/components/ui/PeriodToggle";
import { usePeriodFilter } from "@/app/hooks/usePeriodFilter";
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
  purchase_date: string;
  lease_start?: string;
  lease_end?: string;
  last_month_rent_collected?: boolean;
};

type MonthlyPerformance = {
  month: number;
  month_name: string;
  rent_income: number;
  maintenance: number;
  pool: number;
  garden: number;
  hoa_payments: number;
  total_expenses: number;
  net_income: number;
  property_tax: number;
  property_market_estimate: number | null;
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

  // Recalculate metrics when period type or data changes
  const metrics = useMemo(() => {
    if (!property || !monthly || monthly.length === 0) return rawMetrics;

    // Convert monthly data to canonical format
    const monthlyData = monthly.map(m => ({
      month: m.month,
      year: selectedYear,
      rent_income: m.rent_income || 0,
      maintenance: m.maintenance || 0,
      pool: m.pool || 0,
      garden: m.garden || 0,
      hoa_payments: m.hoa_payments || 0,
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

    // Calculate metrics with optional month filter for lease term
    const canonicalMetrics = calculateCanonicalMetrics(
      propertyData,
      monthlyData,
      {
        monthsFilter: periodType === 'lease' ? monthsInPeriod : undefined
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
      const res = await fetch(
        `/api/owner/financial-metrics?propertyId=${selectedPropertyId}&year=${selectedYear}`,
        { cache: "no-store" }
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load financial data");
      }

      setProperty(data.property);
      setMonthly(data.monthly || []);

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

  const performanceStatus =
    metrics.roi_post_tax >= 5 && metrics.maintenance_pct < 5 ? "green" :
    metrics.roi_post_tax >= 3 && metrics.maintenance_pct < 7 ? "yellow" : "red";
  const performanceLabel = performanceStatus === "green" ? "Excellent" : performanceStatus === "yellow" ? "Good" : "Needs Attention";

  const gaugeRoiPre = metrics.roi_pre_tax;
  const gaugeRoiPost = metrics.roi_post_tax;
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
      {/* Header */}
      <div className="bg-white border-b border-slate-200 py-6 px-8 shadow-sm">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-8 mb-4">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900 mb-1">
                  Investment Performance
                </h1>
                <p className="text-sm text-slate-600">
                  {property?.address || "Select a property"} • {periodLabel}
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
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[2024, 2025, 2026].map((year) => (
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
        {/* Luxor AI */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-lg">
          <div className="p-6 border-b border-slate-200 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1f2937] via-[#0f172a] to-[#1e293b] flex items-center justify-center overflow-hidden shadow-sm">
              <Image
                src="/luxor-ai.png"
                alt="Luxor logo"
                width={52}
                height={52}
                className="object-contain mix-blend-lighten opacity-90"
              />
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
              <button
                onClick={handleChatSend}
                disabled={chatLoading}
                className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 shadow-sm h-fit"
              >
                {chatLoading ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>

        {/* Performance Status Badge */}
        <div className="text-center">
          <div className={`inline-block px-6 py-3 rounded-lg border ${
            performanceStatus === "green" ? "bg-green-50 border-green-200 text-green-700" :
            performanceStatus === "yellow" ? "bg-yellow-50 border-yellow-200 text-yellow-700" :
            "bg-red-50 border-red-200 text-red-700"
          }`}>
            <div className="text-xs uppercase tracking-wider font-medium mb-1">Overall Performance</div>
            <div className="text-2xl font-semibold">{performanceLabel}</div>
          </div>
        </div>

        {/* ROI Speedometer Gauges */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
            Return on Investment
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div
              className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-help"
              title="Formula: Net Income / Cost Basis × 100"
            >
              <GaugeChart
                value={gaugeRoiPre}
                target={0}
                label="Pre-Tax ROI"
                unit="%"
                maxValue={15}
                colorThresholds={{ green: 80, yellow: 60 }}
                showTarget={false}
              />
            </div>
            <div
              className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-help"
              title="Formula: (Net Income - Property Tax) / Cost Basis × 100"
            >
              <GaugeChart
                value={gaugeRoiPost}
                target={0}
                label="Post-Tax ROI"
                unit="%"
                maxValue={15}
                colorThresholds={{ green: 80, yellow: 60 }}
                showTarget={false}
              />
            </div>
            <div
              className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-help"
              title="Formula: (Net Income + Appreciation) / Cost Basis × 100"
            >
              <GaugeChart
                value={gaugeRoiTotal}
                target={0}
                label="Total ROI (with Appreciation)"
                unit="%"
                maxValue={40}
                colorThresholds={{ green: 80, yellow: 60 }}
                showTarget={false}
              />
            </div>
          </div>
        </div>

        {/* Key Metrics Summary Table */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
            Key Investment Metrics
          </h2>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 text-left font-semibold text-slate-700 text-xs uppercase tracking-wider">Metric</th>
                  <th className="py-3 px-4 text-right font-semibold text-slate-700 text-xs uppercase tracking-wider">Value</th>
                  <th className="py-3 px-4 text-left font-semibold text-slate-700 text-xs uppercase tracking-wider">Formula</th>
                </tr>
              </thead>
              <tbody className="text-slate-900">
                <tr className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4">Cost Basis</td>
                  <td className="py-3 px-4 text-right font-semibold">{formatCurrency(metrics.cost_basis)}</td>
                  <td className="py-3 px-4 text-xs text-slate-600">Home + Repairs + Closing</td>
                </tr>
                <tr className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4">Current Market Value</td>
                  <td className="py-3 px-4 text-right font-semibold">{formatCurrency(metrics.current_market_value)}</td>
                  <td className="py-3 px-4 text-xs text-slate-600">Latest monthly estimate</td>
                </tr>
                <tr className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4">Appreciation</td>
                  <td className={`py-3 px-4 text-right font-semibold ${metrics.appreciation_value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(metrics.appreciation_value)} ({formatPercentage(metrics.appreciation_pct)})
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">Market Value - Cost Basis</td>
                </tr>
                <tr className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4">YTD Gross Income</td>
                  <td className="py-3 px-4 text-right font-semibold">{formatCurrency(metrics.ytd_rent_income)}</td>
                  <td className="py-3 px-4 text-xs text-slate-600">Sum of monthly rent</td>
                </tr>
                <tr className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4">YTD Total Expenses</td>
                  <td className="py-3 px-4 text-right font-semibold">{formatCurrency(metrics.ytd_total_expenses)}</td>
                  <td className="py-3 px-4 text-xs text-slate-600">Maintenance + Pool + Garden + HOA</td>
                </tr>
                <tr className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4">YTD Net Income</td>
                  <td className={`py-3 px-4 text-right font-semibold ${metrics.ytd_net_income >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(metrics.ytd_net_income)}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">Gross Income - Total Expenses</td>
                </tr>
                <tr className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4">YTD Property Tax</td>
                  <td className="py-3 px-4 text-right font-semibold">{formatCurrency(metrics.ytd_property_tax)}</td>
                  <td className="py-3 px-4 text-xs text-slate-600">Sum of monthly property tax</td>
                </tr>
                <tr className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4">Maintenance % of Rent</td>
                  <td className={`py-3 px-4 text-right font-semibold ${metrics.maintenance_pct < 5 ? 'text-green-600' : metrics.maintenance_pct < 7 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {formatPercentage(metrics.maintenance_pct)} {metrics.maintenance_pct < 5 ? '✓' : ''}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">Maintenance / Gross Income × 100</td>
                </tr>
                <tr className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4">Pre-Tax ROI</td>
                  <td className={`py-3 px-4 text-right font-semibold ${metrics.roi_pre_tax >= 5 ? 'text-green-600' : metrics.roi_pre_tax >= 3 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {formatPercentage(metrics.roi_pre_tax)}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">Net Income / Cost Basis × 100</td>
                </tr>
                <tr className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4">Post-Tax ROI</td>
                  <td className={`py-3 px-4 text-right font-semibold ${metrics.roi_post_tax >= 4 ? 'text-green-600' : metrics.roi_post_tax >= 2 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {formatPercentage(metrics.roi_post_tax)}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">(Net Income - Property Tax) / Cost Basis × 100</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-semibold">Total ROI (with Appreciation)</td>
                  <td className={`py-3 px-4 text-right font-bold text-lg ${metrics.roi_with_appreciation >= 10 ? 'text-green-600' : metrics.roi_with_appreciation >= 5 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {formatPercentage(metrics.roi_with_appreciation)}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">(Net Income + Appreciation) / Cost Basis × 100</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Income Summary */}
          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
            <h3 className="text-sm text-center font-semibold text-slate-700 uppercase tracking-wide mb-6">
              Income Summary ({selectedYear})
            </h3>
            <Bar
              data={{
                labels: ["Gross Income", "Maintenance", "HOA, Pool, Garden", "Total Expenses", "Net Income", "Property Tax"],
                datasets: [{
                  data: [
                    metrics.ytd_rent_income,
                    metrics.ytd_maintenance,
                    metrics.ytd_pool + metrics.ytd_garden + metrics.ytd_hoa,
                    metrics.ytd_total_expenses,
                    metrics.ytd_net_income,
                    metrics.ytd_property_tax
                  ],
                  backgroundColor: ["#5b9bd5", "#ed7d31", "#70ad47", "#ffc000", "#4472c4", "#7030a0"],
                }]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: "rgba(0, 0, 0, 0.8)",
                    titleColor: "#fff",
                    bodyColor: "#fff",
                    callbacks: { label: (context) => formatCurrency(context.parsed.y || 0) }
                  }
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: { color: "#64748b", callback: (value) => "$" + value.toLocaleString() },
                    grid: { color: "#e2e8f0" }
                  },
                  x: {
                    ticks: { color: "#64748b", font: { size: 9 } },
                    grid: { display: false }
                  }
                }
              }}
            />
          </div>

          {/* Monthly Business Expenses */}
          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
            <h3 className="text-sm text-center font-semibold text-slate-700 uppercase tracking-wide mb-6">
              Monthly Business Expenses
            </h3>
            <Bar
              data={{
                labels: monthly.map(m => m.month_name),
                datasets: [
                  { label: "Maintenance", data: monthly.map(m => m.maintenance), backgroundColor: "#ed7d31" },
                  { label: "Pool", data: monthly.map(m => m.pool), backgroundColor: "#5b9bd5" },
                  { label: "Garden", data: monthly.map(m => m.garden), backgroundColor: "#a5a5a5" },
                  { label: "HOA Payments", data: monthly.map(m => m.hoa_payments), backgroundColor: "#ffc000" },
                ]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                  legend: { display: true, position: "bottom", labels: { color: "#64748b", font: { size: 9 }, boxWidth: 12 } },
                  tooltip: {
                    backgroundColor: "rgba(0, 0, 0, 0.8)",
                    titleColor: "#fff",
                    bodyColor: "#fff",
                    callbacks: { label: (context) => context.dataset.label + ": " + formatCurrency(context.parsed.y || 0) }
                  }
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    stacked: true,
                    ticks: { color: "#64748b", callback: (value) => "$" + value.toLocaleString() },
                    grid: { color: "#e2e8f0" }
                  },
                  x: {
                    stacked: true,
                    ticks: { color: "#64748b", font: { size: 9 } },
                    grid: { display: false }
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Trends Section */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
            Monthly Trends
          </h2>

          {/* Monthly Income and Expense Statement */}
          <div className="bg-white border border-slate-200 p-6 mb-6 rounded-xl shadow-sm">
            <Bar
              data={{
                labels: monthly.map(m => m.month_name),
                datasets: [
                  { label: "Rent Income", data: monthly.map(m => m.rent_income), backgroundColor: "#a9d18e" },
                  { label: "Total Expenses", data: monthly.map(m => m.total_expenses), backgroundColor: "#e17055" },
                  { label: "Net Income", data: monthly.map(m => m.net_income), backgroundColor: "#70ad47" },
                ]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                  title: { display: true, text: "Monthly Income and Expense Statement", color: "#475569", font: { size: 14 } },
                  legend: { display: true, position: "bottom", labels: { color: "#64748b" } },
                  tooltip: {
                    backgroundColor: "rgba(0, 0, 0, 0.8)",
                    titleColor: "#fff",
                    bodyColor: "#fff",
                    callbacks: { label: (context) => context.dataset.label + ": " + formatCurrency(context.parsed.y || 0) }
                  }
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: { color: "#64748b", callback: (value) => "$" + value.toLocaleString() },
                    grid: { color: "#e2e8f0" }
                  },
                  x: { ticks: { color: "#64748b" }, grid: { display: false } }
                }
              }}
            />
          </div>

          {/* Property Market Estimate */}
          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
            <Line
              data={{
                labels: monthly.map(m => m.month_name),
                datasets: [{
                  label: "Property Market Estimate",
                  data: monthly.map(m => m.property_market_estimate || 0),
                  borderColor: "#4472c4",
                  backgroundColor: "rgba(68, 114, 196, 0.1)",
                  tension: 0.4,
                  fill: true,
                }]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                  title: { display: true, text: "Property Market Estimate", color: "#475569", font: { size: 14 } },
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: "rgba(0, 0, 0, 0.8)",
                    titleColor: "#fff",
                    bodyColor: "#fff",
                    callbacks: { label: (context) => formatCurrency(context.parsed.y || 0) }
                  }
                },
                scales: {
                  y: {
                    ticks: { color: "#64748b", callback: (value) => "$" + value.toLocaleString() },
                    grid: { color: "#e2e8f0" }
                  },
                  x: { ticks: { color: "#64748b" }, grid: { display: false } }
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
            <textarea
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder="Ask about your lease, expenses, ROI, etc."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            <button
              onClick={handleChatSend}
              disabled={chatLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60 h-fit"
            >
              {chatLoading ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { calculateCanonicalMetrics } from "@/lib/calculations/canonical-metrics";
import { calculateExpectedAnnualNet, calculateExpectedRoi } from "@/lib/financial-calculations";
import { PeriodToggle } from "@/app/components/ui/PeriodToggle";
import { getLeaseTermMonths, usePeriodFilter } from "@/app/hooks/usePeriodFilter";
import { formatDateOnly, getDateOnlyParts } from "@/lib/date-only";

type PropertyFinancials = {
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
  purchase_date?: string;
  lease_start?: string;
  lease_end?: string;
  deposit?: number;
  last_month_rent_collected?: boolean;
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
  property_market_estimate?: number | null;
  total_expenses: number;
  net_income: number;
};

type YearEndTarget = {
  rent_income: number;
  maintenance: number;
  pool: number;
  garden: number;
  hoa: number;
  property_tax: number;
  total_expenses: number;
  net_income: number;
};

export default function PropertyFinancialSummaryPage() {
  const params = useParams();
  const router = useRouter();
  const propertyId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [property, setProperty] = useState<PropertyFinancials | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyPerformance[]>([]);
  const [yeTarget, setYeTarget] = useState<YearEndTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();

  // Period filter hook for YTD vs Lease Term toggle
  const { periodType, setPeriodType, label: periodLabel } = usePeriodFilter({
    leaseStart: property?.lease_start,
    leaseEnd: property?.lease_end,
    currentYear
  });

  useEffect(() => {
    loadAllData();
  }, [propertyId, periodType]);

  const periodLabelShort = useMemo(() => {
    if (periodType === "ytd") return `YTD ${currentYear}`;
    if (periodType === "alltime") return "All Time";
    return "Lease Term";
  }, [periodType, currentYear]);

  const loadAllData = async () => {
    try {
      setLoading(true);

      // Load property financials
      const propRes = await fetch(`/api/admin/financials/property?propertyId=${propertyId}`);
      const propData = await propRes.json();
      if (propRes.ok) {
        setProperty(propData);
      }

      // Load year-end targets
      const targetRes = await fetch(`/api/admin/financials/targets?propertyId=${propertyId}&year=${currentYear}`);
      const targetData = await targetRes.json();
      if (targetRes.ok && targetData.ye_target) {
        setYeTarget(targetData.ye_target);
      }

      // Load monthly performance based on selected period
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const leaseStartParts = propData?.lease_start ? getDateOnlyParts(propData.lease_start) : null;
      const leaseEndParts = propData?.lease_end ? getDateOnlyParts(propData.lease_end) : null;
      const purchaseParts = propData?.purchase_date ? getDateOnlyParts(propData.purchase_date) : null;

      const buildMonthsInRange = (
        start: { year: number; month: number },
        end: { year: number; month: number },
        includeYear: boolean
      ) => {
        if (end.year < start.year || (end.year === start.year && end.month < start.month)) {
          return [];
        }
        const months: { month: number; year: number; month_name: string }[] = [];
        let year = start.year;
        let month = start.month;
        while (year < end.year || (year === end.year && month <= end.month)) {
          const label = includeYear ? `${monthNames[month - 1]} ${year}` : monthNames[month - 1];
          months.push({
            month,
            year,
            month_name: label,
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
        monthsToLoad = buildMonthsInRange(leaseStartParts, leaseEndParts, true);
      } else if (periodType === "alltime") {
        const start = purchaseParts || leaseStartParts || { year: currentYear, month: 1 };
        const now = new Date();
        const end = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
        monthsToLoad = buildMonthsInRange(start, end, true);
      } else {
        const start = { year: currentYear, month: 1 };
        const end = { year: currentYear, month: 12 };
        monthsToLoad = buildMonthsInRange(start, end, false);
      }

      if (monthsToLoad.length === 0) {
        monthsToLoad = monthNames.map((name, idx) => ({
          month: idx + 1,
          year: currentYear,
          month_name: periodType === "ytd" ? name : `${name} ${currentYear}`,
        }));
      }

      const promises = monthsToLoad.map(async ({ month, year, month_name }) => {
        const res = await fetch(`/api/admin/financials/monthly?propertyId=${propertyId}&year=${year}&month=${month}`);
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
            property_market_estimate: data.property_market_estimate ?? null,
            total_expenses: totalExp,
            net_income: netInc,
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
          property_market_estimate: null,
          total_expenses: 0,
          net_income: 0,
        };
      });

      const results = await Promise.all(promises);
      setMonthlyData(results);

    } catch (err: any) {
      setError(err.message || "Failed to load financial data");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (num: number | null | undefined) => {
    if (num === null || num === undefined) return "$0";
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "Not set";
    return formatDateOnly(dateStr) || "Not set";
  };

  const sortedMonthlyData = useMemo(() => {
    return [...monthlyData].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }, [monthlyData]);

  const displayMonthlyData = useMemo(() => {
    if (!sortedMonthlyData.length) return [];

    if (periodType === "lease" && property?.lease_start && property?.lease_end) {
      const leaseMonths = getLeaseTermMonths(property.lease_start, property.lease_end);
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

    return sortedMonthlyData.filter(row => row.year === currentYear);
  }, [
    sortedMonthlyData,
    periodType,
    currentYear,
    property?.lease_start,
    property?.lease_end,
  ]);

  const canonicalMetrics = useMemo(() => {
    if (!property) return null;

    const estimatedAnnualPropertyTax = yeTarget?.property_tax || 0;

    return calculateCanonicalMetrics(
      {
        home_cost: property.home_cost || 0,
        home_repair_cost: property.home_repair_cost || 0,
        closing_costs: property.closing_costs || 0,
        total_cost: property.total_cost || 0,
        current_market_estimate: property.current_market_estimate || 0,
        purchase_date: property.purchase_date || null,
        lease_start: property.lease_start || null,
        lease_end: property.lease_end || null,
        target_monthly_rent: property.target_monthly_rent || 0,
        deposit: property.deposit || 0,
        last_month_rent_collected: !!property.last_month_rent_collected,
      },
      displayMonthlyData.map(m => ({
        month: m.month,
        year: m.year,
        rent_income: m.rent_income,
        maintenance: m.maintenance,
        pool: m.pool,
        garden: m.garden,
        hoa_payments: m.hoa_payments,
        pm_fee: m.pm_fee || 0,
        property_tax: m.property_tax,
        property_market_estimate: m.property_market_estimate ?? null,
      })),
      {
        estimatedAnnualPropertyTax,
        // Data is pre-filtered; multiYear prevents year-only filtering for lease/all-time.
        multiYear: periodType !== "ytd"
      }
    );
  }, [property, displayMonthlyData, yeTarget, periodType]);

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Property Financial Summary</h1>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Property Financial Summary</h1>
        <p className="text-gray-600">Property not found.</p>
      </div>
    );
  }

  const ytdTotals = canonicalMetrics?.ytd || {
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

  const costBasis = canonicalMetrics?.cost_basis
    ?? ((property.home_cost || 0) + (property.home_repair_cost || 0) + (property.closing_costs || 0));

  const roiActual = canonicalMetrics?.roi_pre_tax || 0;
  const appreciation = canonicalMetrics?.appreciation_pct
    ?? (costBasis > 0 ? (((property.current_market_estimate || 0) - costBasis) / costBasis) * 100 : 0);
  const expectedAnnualRent = (property.target_monthly_rent || 0) * 12;
  const expectedNet = calculateExpectedAnnualNet({
    targetMonthlyRent: property.target_monthly_rent || 0,
    plannedPoolMonthly: property.planned_pool_cost || 0,
    plannedGardenMonthly: property.planned_garden_cost || 0,
    plannedHoaMonthly: property.planned_hoa_cost || 0,
  });
  const expectedExpenses = expectedAnnualRent - expectedNet;
  const expectedRoi = calculateExpectedRoi({
    targetMonthlyRent: property.target_monthly_rent || 0,
    plannedPoolMonthly: property.planned_pool_cost || 0,
    plannedGardenMonthly: property.planned_garden_cost || 0,
    plannedHoaMonthly: property.planned_hoa_cost || 0,
    costBasis,
  });

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push('/admin/properties')}
            className="text-blue-600 hover:text-blue-700 mb-2 text-sm"
          >
            ← Back to Properties
          </button>
          <h1 className="text-3xl font-bold">Financial Summary</h1>
          <p className="text-gray-600">{property.address} • {periodLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodToggle value={periodType} onChange={setPeriodType} />
          <button
            onClick={() => router.push('/admin/financials')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Edit Financials
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Property Financials Overview */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Property Financial Data</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-4 py-2 text-left text-sm font-semibold">Field</th>
                <th className="border border-slate-300 px-4 py-2 text-left text-sm font-semibold">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 px-4 py-2 font-medium">Home Cost</td>
                <td className="border border-slate-300 px-4 py-2">{formatCurrency(property.home_cost)}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-2 font-medium">Repair Cost</td>
                <td className="border border-slate-300 px-4 py-2">{formatCurrency(property.home_repair_cost)}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-2 font-medium">Closing Costs</td>
                <td className="border border-slate-300 px-4 py-2">{formatCurrency(property.closing_costs)}</td>
              </tr>
              <tr className="bg-blue-50">
                <td className="border border-slate-300 px-4 py-2 font-bold">Cost Basis</td>
                <td className="border border-slate-300 px-4 py-2 font-bold">{formatCurrency(costBasis)}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-2 font-medium">Current Market Estimate</td>
                <td className="border border-slate-300 px-4 py-2">{formatCurrency(property.current_market_estimate)}</td>
              </tr>
              <tr className="bg-green-50">
                <td className="border border-slate-300 px-4 py-2 font-bold">Appreciation</td>
                <td className="border border-slate-300 px-4 py-2 font-bold text-green-700">
                  {appreciation.toFixed(2)}% ({formatCurrency((property.current_market_estimate || 0) - costBasis)})
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-2 font-medium">Target Monthly Rent</td>
                <td className="border border-slate-300 px-4 py-2">{formatCurrency(property.target_monthly_rent)}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-2 font-medium">Purchase Date</td>
                <td className="border border-slate-300 px-4 py-2">{formatDate(property.purchase_date)}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-2 font-medium">Last Updated</td>
                <td className="border border-slate-300 px-4 py-2">{property.financials_updated_at ? new Date(property.financials_updated_at).toLocaleString() : "Never"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Year-End Targets */}
      {yeTarget && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Year-End Targets for {currentYear}</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-4 py-2 text-left text-sm font-semibold">Category</th>
                  <th className="border border-slate-300 px-4 py-2 text-right text-sm font-semibold">Target Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-blue-50">
                  <td className="border border-slate-300 px-4 py-2 font-medium">Rent Income</td>
                  <td className="border border-slate-300 px-4 py-2 text-right">{formatCurrency(yeTarget.rent_income)}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-4 py-2">Maintenance (5%)</td>
                  <td className="border border-slate-300 px-4 py-2 text-right">{formatCurrency(yeTarget.maintenance)}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-4 py-2">Pool</td>
                  <td className="border border-slate-300 px-4 py-2 text-right">{formatCurrency(yeTarget.pool)}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-4 py-2">Garden</td>
                  <td className="border border-slate-300 px-4 py-2 text-right">{formatCurrency(yeTarget.garden)}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-4 py-2">HOA</td>
                  <td className="border border-slate-300 px-4 py-2 text-right">{formatCurrency(yeTarget.hoa)}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-4 py-2">Property Tax</td>
                  <td className="border border-slate-300 px-4 py-2 text-right">{formatCurrency(yeTarget.property_tax)}</td>
                </tr>
                <tr className="bg-red-50">
                  <td className="border border-slate-300 px-4 py-2 font-bold">Total Expenses</td>
                  <td className="border border-slate-300 px-4 py-2 text-right font-bold">{formatCurrency(yeTarget.total_expenses)}</td>
                </tr>
                <tr className="bg-green-50">
                  <td className="border border-slate-300 px-4 py-2 font-bold">Net Income Target</td>
                  <td className="border border-slate-300 px-4 py-2 text-right font-bold text-green-700">{formatCurrency(yeTarget.net_income)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Month-by-Month Summary */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Monthly Performance Summary - {periodLabelShort}</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-slate-300 text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Month</th>
                <th className="border border-slate-300 px-3 py-2 text-right font-semibold">Rent Income</th>
                <th className="border border-slate-300 px-3 py-2 text-right font-semibold">Maintenance</th>
                <th className="border border-slate-300 px-3 py-2 text-right font-semibold">Pool</th>
                <th className="border border-slate-300 px-3 py-2 text-right font-semibold">Garden</th>
                <th className="border border-slate-300 px-3 py-2 text-right font-semibold">HOA</th>
                <th className="border border-slate-300 px-3 py-2 text-right font-semibold">PM Fee</th>
                <th className="border border-slate-300 px-3 py-2 text-right font-semibold">Property Tax</th>
                <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-blue-50">Total Expenses</th>
                <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-green-50">Net Income</th>
              </tr>
            </thead>
            <tbody>
              {displayMonthlyData.map((monthData) => (
                <tr key={`${monthData.year}-${monthData.month}`} className={monthData.rent_income > 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="border border-slate-300 px-3 py-2 font-medium">{monthData.month_name}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">{formatCurrency(monthData.rent_income)}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">{formatCurrency(monthData.maintenance)}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">{formatCurrency(monthData.pool)}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">{formatCurrency(monthData.garden)}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">{formatCurrency(monthData.hoa_payments)}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">{formatCurrency(monthData.pm_fee || 0)}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">{formatCurrency(monthData.property_tax)}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right bg-blue-50 font-semibold">{formatCurrency(monthData.total_expenses)}</td>
                  <td className={`border border-slate-300 px-3 py-2 text-right font-semibold ${monthData.net_income >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {formatCurrency(monthData.net_income)}
                  </td>
                </tr>
              ))}
              {/* YTD Totals Row */}
              <tr className="bg-slate-200 font-bold">
                <td className="border border-slate-300 px-3 py-2">
                  {periodType === "ytd" ? "YTD Total" : "Period Total"}
                </td>
                <td className="border border-slate-300 px-3 py-2 text-right">{formatCurrency(ytdTotals.rent_income)}</td>
                <td className="border border-slate-300 px-3 py-2 text-right">{formatCurrency(ytdTotals.maintenance)}</td>
                <td className="border border-slate-300 px-3 py-2 text-right">{formatCurrency(ytdTotals.pool)}</td>
                <td className="border border-slate-300 px-3 py-2 text-right">{formatCurrency(ytdTotals.garden)}</td>
                <td className="border border-slate-300 px-3 py-2 text-right">{formatCurrency(ytdTotals.hoa_payments)}</td>
                <td className="border border-slate-300 px-3 py-2 text-right">{formatCurrency(ytdTotals.pm_fee || 0)}</td>
                <td className="border border-slate-300 px-3 py-2 text-right">{formatCurrency(ytdTotals.property_tax)}</td>
                <td className="border border-slate-300 px-3 py-2 text-right bg-blue-100">{formatCurrency(ytdTotals.total_expenses)}</td>
                <td className={`border border-slate-300 px-3 py-2 text-right ${ytdTotals.net_income >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {formatCurrency(ytdTotals.net_income)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Calculations */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Financial Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Maintenance Ratio vs Target */}
          <div className="border border-slate-300 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Maintenance Analysis</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Maintenance:</span>
                <span className="font-medium">{formatCurrency(ytdTotals.maintenance)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Rental Income:</span>
                <span className="font-medium">{formatCurrency(ytdTotals.rent_income)}</span>
              </div>
              <div className="pt-2 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Maintenance Ratio:</span>
                  <span className={`text-lg font-bold ${
                    ytdTotals.rent_income > 0 && (ytdTotals.maintenance / ytdTotals.rent_income * 100) < 5
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}>
                    {ytdTotals.rent_income > 0
                      ? ((ytdTotals.maintenance / ytdTotals.rent_income) * 100).toFixed(2)
                      : '0.00'}%
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">Target: &lt; 5%</div>
              </div>
            </div>
          </div>

          {/* Actual ROI based on total net income */}
          <div className="border border-slate-300 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Actual ROI (Total Net Income)</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Net Income:</span>
                <span className="font-medium">{formatCurrency(ytdTotals.net_income)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Cost Basis:</span>
                <span className="font-medium">{formatCurrency(costBasis)}</span>
              </div>
              <div className="pt-2 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Actual ROI:</span>
                  <span className="text-lg font-bold text-green-700">
                    {roiActual.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Projected ROI based on expected inputs */}
          <div className="border border-slate-300 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Projected ROI (Expected)</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Projected Annual Rent:</span>
                <span className="font-medium">{formatCurrency(expectedAnnualRent)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Projected Annual Expenses:</span>
                <span className="font-medium">{formatCurrency(expectedExpenses)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Projected Net Income:</span>
                <span className="font-medium">{formatCurrency(expectedNet)}</span>
              </div>
              <div className="pt-2 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Projected ROI:</span>
                  <span className="text-lg font-bold text-blue-600">
                    {expectedRoi.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-xl font-semibold mb-4">Performance Metrics ({periodLabelShort})</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-slate-300 rounded-lg p-4">
            <div className="text-sm text-gray-600 mb-1">Actual ROI ({periodLabelShort})</div>
            <div className="text-2xl font-bold text-green-700">
              {roiActual.toFixed(2)}%
            </div>
          </div>
          <div className="border border-slate-300 rounded-lg p-4">
            <div className="text-sm text-gray-600 mb-1">Net Income ({periodLabelShort})</div>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(ytdTotals.net_income)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {yeTarget ? `Target: ${formatCurrency(yeTarget.net_income)}` : "No target set"}
            </div>
          </div>
          <div className="border border-slate-300 rounded-lg p-4">
            <div className="text-sm text-gray-600 mb-1">Property Appreciation</div>
            <div className="text-2xl font-bold text-green-600">
              {appreciation.toFixed(2)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {formatCurrency((property.current_market_estimate || 0) - costBasis)} gain
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

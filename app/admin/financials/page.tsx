"use client";

import { useEffect, useState, useMemo } from "react";
import {
  calculateLeaseAppreciation,
  calculateAppreciationDuringLeaseTerm,
  calculateComprehensiveROI,
  calculateTotalAppreciation,
  calculateROIIfSoldToday,
} from "@/lib/financial-calculations";
import { calculateCanonicalMetrics } from "@/lib/calculations/canonical-metrics";

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
  property_tax: number;
  total_expenses: number;
  net_income: number;
  property_market_estimate?: number | null;
  updated_at?: string;
};

export default function FinancialsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"property" | "targets" | "monthly">("property");
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

  const parseDateOnly = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };

  const daysInMonth = (year: number, monthIndex0: number) => {
    return new Date(year, monthIndex0 + 1, 0).getDate();
  };

  // Helper: months elapsed in performanceYear (counts current month if we're in it)
  const monthsElapsedInYear = (startStr: string | null | undefined): number => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-based

    // If we have no start date, fall back to calendar months elapsed for the performance year
    if (!startStr) {
      if (performanceYear > currentYear) return 0;
      if (performanceYear < currentYear) return 12;
      return currentMonth + 1; // include the current month
    }

    const startDate = parseDateOnly(startStr);
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth(); // 0-based

    // If the performance year is before the lease start year, nothing elapsed
    if (performanceYear < startYear) return 0;

    // Effective start month within the performance year
    const effectiveStartMonth = performanceYear > startYear ? 0 : startMonth;

    // If performance year is in the future, no months elapsed yet
    if (performanceYear > currentYear) return 0;

    const effectiveCurrentMonth = performanceYear === currentYear ? currentMonth : 11; // Dec if past years
    if (effectiveCurrentMonth < effectiveStartMonth) return 0;

    return Math.min(12, effectiveCurrentMonth - effectiveStartMonth + 1);
  };

  const monthsElapsedLease = useMemo(
    () => monthsElapsedInYear(propertyFinancials.lease_start),
    [performanceYear, propertyFinancials.lease_start]
  );

  const monthsRemaining = useMemo(() => Math.max(0, 12 - monthsElapsedLease), [monthsElapsedLease]);

  const plannedYtd = useMemo(() => {
    const rentMonthly = parseFloat(propertyFinancials.target_monthly_rent) || 0;
    const poolMonthly = parseFloat(propertyFinancials.planned_pool_cost) || 0;
    const gardenMonthly = parseFloat(propertyFinancials.planned_garden_cost) || 0;
    const hoaAnnual = calculatedAnnualHoa || 0;
    const leaseStart = propertyFinancials.lease_start ? parseDateOnly(propertyFinancials.lease_start) : null;

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
      property_tax: 0,
      total_expenses: 0,
      net_income: 0,
    };

    if (performanceYear > refYear) return zeroPlan;

    // Start month: lease start month if in/before this year, else Jan
    let startMonth = 0;
    if (leaseStart) {
      const startYear = leaseStart.getFullYear();
      if (startYear > performanceYear) return zeroPlan;
      startMonth = startYear < performanceYear ? 0 : leaseStart.getMonth();
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
      if (leaseStart && leaseStart.getFullYear() === performanceYear && monthIndex === leaseStart.getMonth()) {
        const dim = daysInMonth(performanceYear, monthIndex);
        const daysRemaining = dim - leaseStart.getDate() + 1;
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
    const property_tax = 0; // plan row leaves tax out unless a separate plan is defined

    // Excel rule: total_expenses excludes property_tax
    const total_expenses = maintenance + pool + garden + hoa_payments;
    const net_income = rent_income - total_expenses;

    return {
      monthsElapsed: monthsElapsedPlanned,
      rent_income,
      maintenance,
      pool,
      garden,
      hoa_payments,
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
    propertyFinancials.planned_pool_cost,
    propertyFinancials.target_monthly_rent,
  ]);

  const monthsElapsedPurchase = useMemo(() => {
    if (!propertyFinancials.purchase_date) return 0;
    const start = parseDateOnly(propertyFinancials.purchase_date);
    const today = new Date();
    if (today < start) return 0;
    let months = (today.getFullYear() - start.getFullYear()) * 12;
    months += today.getMonth() - start.getMonth();
    if (today.getDate() >= start.getDate()) months += 1;
    return Math.max(0, months);
  }, [propertyFinancials.purchase_date]);

  const canonicalMetrics = useMemo(() => {
    const estimatedAnnualPropertyTax = parseFloat(yeTarget.property_tax) || 0;
    const monthlyForYear = allMonthlyData
      .filter(m => m.year === performanceYear)
      .map(m => ({
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
        target_monthly_rent: parseFloat(propertyFinancials.target_monthly_rent) || 0,
        deposit: parseFloat(propertyFinancials.deposit) || 0,
        last_month_rent_collected: propertyFinancials.last_month_rent_collected,
      },
      monthlyForYear,
      { estimatedAnnualPropertyTax }
    );
  }, [
    allMonthlyData,
    performanceYear,
    propertyFinancials.home_cost,
    propertyFinancials.home_repair_cost,
    propertyFinancials.closing_costs,
    propertyFinancials.current_market_estimate,
    propertyFinancials.purchase_date,
    propertyFinancials.lease_start,
    propertyFinancials.target_monthly_rent,
    propertyFinancials.deposit,
    propertyFinancials.last_month_rent_collected,
    calculatedTotalCost,
    yeTarget.property_tax,
  ]);

  const actualYtd = useMemo(() => canonicalMetrics.ytd, [canonicalMetrics]);

  // Calculate appreciation metrics using helper functions
  const leaseAppreciation = useMemo(() => {
    const marketValues = allMonthlyData.map(m => ({
      year: m.year,
      month: m.month,
      value: m.property_market_estimate || null,
    }));

    return calculateLeaseAppreciation(
      marketValues,
      propertyFinancials.lease_start,
      propertyFinancials.lease_end,
      calculatedTotalCost,
      parseFloat(propertyFinancials.current_market_estimate) || calculatedTotalCost
    );
  }, [allMonthlyData, propertyFinancials.current_market_estimate, propertyFinancials.lease_start, propertyFinancials.lease_end, calculatedTotalCost]);

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
    financialsLoaded,
  ]);

  // Auto-populate YE Target from property planned costs and auto-calculate maintenance at 5%
  useEffect(() => {
    const monthlyRent = parseFloat(propertyFinancials.target_monthly_rent) || 0;
    const gardenCost = parseFloat(propertyFinancials.planned_garden_cost) || 0;
    const poolCost = parseFloat(propertyFinancials.planned_pool_cost) || 0;

    if (activeTab === "targets" && monthlyRent > 0) {
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
  }, [propertyFinancials, activeTab, calculatedAnnualHoa]);

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
          hoa_frequency: (data.hoa_frequency as "monthly" | "quarterly") || "monthly",
          hoa_frequency_2: (data.hoa_frequency_2 as "monthly" | "quarterly") || "monthly",
          purchase_date: data.purchase_date || "",
          lease_start: data.lease_start || "",
          lease_end: data.lease_end || "",
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

      // Generate month list starting from lease_start month, spanning up to 13 months
      let monthsToLoad: { month: number; year: number; month_name: string }[] = [];

      const startYear = performanceYear;
      const startDate = new Date(startYear, 0, 1);
      const leaseEndDate = propertyFinancials.lease_end ? parseDateOnly(propertyFinancials.lease_end) : null;

      // Determine end month/year (if lease_end is before startYear, fall back to Dec of startYear)
      let endYear = startYear;
      let endMonth = 11; // Dec
      if (leaseEndDate) {
        const endAfterStart = leaseEndDate >= startDate;
        if (endAfterStart) {
          endYear = leaseEndDate.getFullYear();
          endMonth = leaseEndDate.getMonth();
        }
      }

      let currentYear = startYear;
      let currentMonth = 0; // Jan
      while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
        monthsToLoad.push({
          month: currentMonth + 1,
          year: currentYear,
          month_name: `${monthNames[currentMonth]} ${currentYear}`
        });
        currentMonth++;
        if (currentMonth >= 12) {
          currentMonth = 0;
          currentYear++;
        }
      }

      // If no lease_end and nothing pushed, default to Jan-Dec
      if (monthsToLoad.length === 0) {
        monthsToLoad = monthNames.map((name, idx) => ({
          month: idx + 1,
          year: performanceYear,
          month_name: `${name} ${performanceYear}`
        }));
      }

      // Load data for each month in the list
      const promises = monthsToLoad.map(async ({ month, year, month_name }) => {
        const res = await fetch(`/api/admin/financials/monthly?propertyId=${selectedProperty}&year=${year}&month=${month}`);
        const data = await res.json();

        if (res.ok && data && data.rent_income !== undefined) {
          // Excel formula: total_expenses = maintenance + pool + garden + hoa (EXCLUDES property_tax)
          const totalExp = (data.maintenance || 0) + (data.pool || 0) + (data.garden || 0) + (data.hoa_payments || 0);
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

      setSuccess("Property financials saved successfully!");
      await loadPropertyFinancials();
      await loadProperties(); // Reload to get updated timestamps
    } catch (err: any) {
      setError(err.message || "Failed to save property financials");
    } finally {
      setSaving(false);
    }
  };

  const saveAnnualTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const res = await fetch("/api/admin/financials/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: selectedProperty,
          year: targetYear,
          plan: {}, // Plan is calculated from actuals, not entered
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

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save annual targets");
      }

      setSuccess("Annual targets saved successfully!");
      await loadAnnualTargets();
    } catch (err: any) {
      setError(err.message || "Failed to save annual targets");
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

  // Format date without timezone shifts (treat as date-only)
  const formatDateOnly = (dateStr: string | null | undefined) => {
    if (!dateStr) return "Unknown";
    // Parse YYYY-MM-DD and format with UTC to avoid timezone shifts
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) return dateStr;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    });
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
            onClick={() => setActiveTab("targets")}
            className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "targets"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            Year-End Targets
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
        </div>
      )}

      {/* Year-End Targets Tab */}
      {activeTab === "targets" && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Year-End Targets for {targetYear}</h2>
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium">Year:</label>
              <input
                type="number"
                value={targetYear}
                onChange={(e) => setTargetYear(parseInt(e.target.value))}
                className="w-24 border border-slate-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-6">
            Annual expenses are auto-calculated as 12 × monthly planned costs. Maintenance is set to 5% of annual rent.
          </p>

          <form onSubmit={saveAnnualTargets} className="space-y-6">
            {/* Annual Income */}
            <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
              <h3 className="font-semibold mb-3">Annual Income</h3>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Rent Income ($/year)</label>
                  <input
                    type="text"
                    value={yeTarget.rent_income}
                    disabled
                    className="w-full border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700"
                  />
                  <p className="text-xs text-gray-600 mt-1">Auto: Monthly Rent × 12 = {formatCurrency(parseFloat(yeTarget.rent_income) || 0)}</p>
                </div>
              </div>
            </div>

            {/* Annual Expenses */}
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="font-semibold mb-3">Annual Expenses</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Maintenance (5% of Rent)</label>
                  <input
                    type="text"
                    value={yeTarget.maintenance}
                    disabled
                    className="w-full border border-slate-300 rounded-md px-3 py-2 bg-slate-100 text-slate-700"
                  />
                  <p className="text-xs text-gray-600 mt-1">Auto: 5% × Annual Rent = {formatCurrency(parseFloat(yeTarget.maintenance) || 0)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Pool (12 × Monthly)</label>
                  <input
                    type="text"
                    value={yeTarget.pool}
                    disabled
                    className="w-full border border-slate-300 rounded-md px-3 py-2 bg-slate-100 text-slate-700"
                  />
                  <p className="text-xs text-gray-600 mt-1">Auto: {formatCurrency(parseFloat(yeTarget.pool) || 0)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Garden (12 × Monthly)</label>
                  <input
                    type="text"
                    value={yeTarget.garden}
                    disabled
                    className="w-full border border-slate-300 rounded-md px-3 py-2 bg-slate-100 text-slate-700"
                  />
                  <p className="text-xs text-gray-600 mt-1">Auto: {formatCurrency(parseFloat(yeTarget.garden) || 0)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">HOA (12 × Monthly)</label>
                  <input
                    type="text"
                    value={yeTarget.hoa}
                    disabled
                    className="w-full border border-slate-300 rounded-md px-3 py-2 bg-slate-100 text-slate-700"
                  />
                  <p className="text-xs text-gray-600 mt-1">Auto: {formatCurrency(parseFloat(yeTarget.hoa) || 0)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Property Tax ($/year)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={yeTarget.property_tax}
                    onChange={(e) => setYeTarget({ ...yeTarget, property_tax: e.target.value })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2"
                    placeholder="11000"
                  />
                </div>
              </div>
            </div>

            {/* Auto-Calculated Summary */}
            <div className="border border-green-200 rounded-lg p-4 bg-green-50">
              <h3 className="font-semibold mb-3 text-green-900">Calculated Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Total Expenses</label>
                  <input
                    type="text"
                    value={formatCurrency(calculatedYeTarget.total_expenses)}
                    disabled
                    className="w-full border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Net Income (with taxes)</label>
                  <input
                    type="text"
                    value={formatCurrency(calculatedYeTarget.net_income)}
                    disabled
                    className="w-full border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Net Income (without taxes)</label>
                  <input
                    type="text"
                    value={formatCurrency(calculatedYeTarget.net_income + (parseFloat(yeTarget.property_tax) || 0))}
                    disabled
                    className="w-full border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 font-semibold"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {saving ? "Saving..." : "Save Year-End Targets"}
            </button>
          </form>
        </div>
      )}

      {/* Monthly Performance Tab */}
      {activeTab === "monthly" && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Monthly Performance for {performanceYear}</h2>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium">Year:</label>
                <input
                  type="number"
                  value={performanceYear}
                  onChange={(e) => setPerformanceYear(parseInt(e.target.value))}
                  className="w-24 border border-slate-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={addNewMonthRow}
                className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800"
              >
                + New Month
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-6">
            Enter actual income and expenses for each month. Values save automatically when you leave each field.
          </p>

          {/* Info Strip */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              {/* Lease Information */}
              <div className="border-r border-blue-300 pr-4">
                <div className="font-semibold text-blue-900 mb-2">Lease Timeline</div>
                <div className="mb-1">
                  <span className="font-medium">Start:</span>{" "}
                  {formatDateOnly(propertyFinancials.lease_start)}
                </div>
                <div className="mb-1">
                  <span className="font-medium">End:</span>{" "}
                  {formatDateOnly(propertyFinancials.lease_end)}
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
                  {formatDateOnly(propertyFinancials.purchase_date)}
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

          {/* All 12 Months Table */}
          {loadingMonthly ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-slate-600">Loading monthly data...</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full border-collapse border border-slate-300 text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-3 py-2 text-left font-semibold sticky left-0 bg-slate-100 z-20">Month</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">Rent Income</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">Maintenance</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">Pool</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">Garden</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">HOA</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">Property Tax</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-slate-100">Market Value</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-blue-50">Total Expenses</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-semibold bg-green-50">Net Income</th>
                  </tr>
                </thead>
                <tbody>
                  {allMonthlyData.map((monthData, index) => (
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
                          setAllMonthlyData(prev => prev.map((m, i) => {
                            if (i === index) {
                              // Excel: total_expenses EXCLUDES property_tax
                              const totalExp = (m.maintenance || 0) + (m.pool || 0) + (m.garden || 0) + (m.hoa_payments || 0);
                              return { ...m, rent_income: value, total_expenses: totalExp, net_income: value - totalExp };
                            }
                            return m;
                          }));
                        }}
                        onBlur={(e) => saveMonthlyPerformance(monthData.month, monthData.year, 'rent_income', e.target.value)}
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
                          setAllMonthlyData(prev => prev.map((m, i) => {
                            if (i === index) {
                              const totalExp = value + (m.pool || 0) + (m.garden || 0) + (m.hoa_payments || 0);
                              return { ...m, maintenance: value, total_expenses: totalExp, net_income: (m.rent_income || 0) - totalExp };
                            }
                            return m;
                          }));
                        }}
                        onBlur={(e) => saveMonthlyPerformance(monthData.month, monthData.year, 'maintenance', e.target.value)}
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
                          setAllMonthlyData(prev => prev.map((m, i) => {
                            if (i === index) {
                              const totalExp = (m.maintenance || 0) + value + (m.garden || 0) + (m.hoa_payments || 0);
                              return { ...m, pool: value, total_expenses: totalExp, net_income: (m.rent_income || 0) - totalExp };
                            }
                            return m;
                          }));
                        }}
                        onBlur={(e) => saveMonthlyPerformance(monthData.month, monthData.year, 'pool', e.target.value)}
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
                          setAllMonthlyData(prev => prev.map((m, i) => {
                            if (i === index) {
                              const totalExp = (m.maintenance || 0) + (m.pool || 0) + value + (m.hoa_payments || 0);
                              return { ...m, garden: value, total_expenses: totalExp, net_income: (m.rent_income || 0) - totalExp };
                            }
                            return m;
                          }));
                        }}
                        onBlur={(e) => saveMonthlyPerformance(monthData.month, monthData.year, 'garden', e.target.value)}
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
                          setAllMonthlyData(prev => prev.map((m, i) => {
                            if (i === index) {
                              const totalExp = (m.maintenance || 0) + (m.pool || 0) + (m.garden || 0) + value;
                              return { ...m, hoa_payments: value, total_expenses: totalExp, net_income: (m.rent_income || 0) - totalExp };
                            }
                            return m;
                          }));
                        }}
                        onBlur={(e) => saveMonthlyPerformance(monthData.month, monthData.year, 'hoa_payments', e.target.value)}
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
                          setAllMonthlyData(prev => prev.map((m, i) => {
                            if (i === index) {
                              // Property tax does NOT affect total_expenses or net_income in Excel formula
                              return { ...m, property_tax: value };
                            }
                            return m;
                          }));
                        }}
                        onBlur={(e) => saveMonthlyPerformance(monthData.month, monthData.year, 'property_tax', e.target.value)}
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
                          setAllMonthlyData(prev => prev.map((m, i) => i === index ? { ...m, property_market_estimate: value } : m));
                        }}
                        onBlur={(e) => saveMonthlyPerformance(monthData.month, monthData.year, 'property_market_estimate', e.target.value)}
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
                    YTD Total
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

          {/* ROI Display */}
          {!loadingMonthly && allMonthlyData.length > 0 && (
            <div className="mt-6 p-6 bg-slate-50 border border-slate-200 rounded-lg">
              {(() => {
                const ytdNetIncome = canonicalMetrics.ytd.net_income;
                const costBasis = canonicalMetrics.cost_basis;

                const mostRecentMarketValue = canonicalMetrics.current_market_value || costBasis;
                const appreciationValue = canonicalMetrics.appreciation_value;
                const appreciationPct = canonicalMetrics.appreciation_pct;

                // Calculate appreciation during lease term (for display)
                const leaseTermAppreciation = appreciationDuringLeaseTerm.value;

                // Canonical single-source ROI values
                const preTaxROI = canonicalMetrics.roi_pre_tax;
                const postTaxROI = canonicalMetrics.roi_post_tax;

                // Derive the tax amount used by canonical post-tax ROI (actual if present, else estimate)
                const taxForPostTaxRoi =
                  costBasis > 0 ? ytdNetIncome - (postTaxROI / 100) * costBasis : 0;

                // Total ROI including appreciation (pre-tax and post-tax)
                const comprehensivePreTaxROI = canonicalMetrics.roi_with_appreciation;
                const comprehensiveROI =
                  costBasis > 0
                    ? ((ytdNetIncome - taxForPostTaxRoi + appreciationValue) / costBasis) * 100
                    : 0;

                // Calculate ROI if sold today
                const closingCosts = parseFloat(saleClosingCosts) || 0;
                const roiIfSold = calculateROIIfSoldToday(ytdNetIncome, closingCosts, appreciationValue, costBasis);

                return (
                  <>
                    <h3 className="font-semibold text-slate-900 mb-4 text-lg">Return on Investment (YTD)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      {/* Income-Based ROI */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Income Only</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-sm text-slate-600">Pre-Tax:</span>
                            <span className="font-semibold text-slate-900">{preTaxROI.toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-sm text-slate-600">Post-Tax:</span>
                            <span className="font-semibold text-slate-900">{postTaxROI.toFixed(2)}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Appreciation Metrics */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Appreciation</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-sm text-slate-600">Market:</span>
                            <span className="font-semibold text-slate-900">
                              {formatCurrency(mostRecentMarketValue)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-sm text-slate-600">Gain:</span>
                            <span className={`font-semibold ${appreciationValue >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              {formatCurrency(appreciationValue)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-sm text-slate-600">% Basis:</span>
                            <span className={`font-semibold ${appreciationPct >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              {appreciationPct >= 0 ? '+' : ''}{appreciationPct.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Comprehensive ROI */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Total ROI</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-sm text-slate-600">Pre-Tax:</span>
                            <span className={`font-semibold text-lg ${comprehensivePreTaxROI >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              {comprehensivePreTaxROI >= 0 ? '+' : ''}{comprehensivePreTaxROI.toFixed(2)}%
                            </span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-sm text-slate-600">Post-Tax:</span>
                            <span className={`font-semibold text-lg ${comprehensiveROI >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              {comprehensiveROI >= 0 ? '+' : ''}{comprehensiveROI.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Yearly ROI */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Yearly ROI</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-sm text-slate-600">Lease Appr:</span>
                            <span className={`font-semibold ${leaseTermAppreciation >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              {formatCurrency(leaseTermAppreciation)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-sm text-slate-600">With Income:</span>
                            <span className={`font-semibold text-lg ${(() => {
                              const yearlyROI = calculateComprehensiveROI(ytdNetIncome, leaseTermAppreciation, costBasis);
                              return yearlyROI >= 0 ? 'text-green-700' : 'text-red-700';
                            })()}`}>
                              {(() => {
                                const yearlyROI = calculateComprehensiveROI(ytdNetIncome, leaseTermAppreciation, costBasis);
                                return `${yearlyROI >= 0 ? '+' : ''}${yearlyROI.toFixed(2)}%`;
                              })()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ROI If Sold Today Section */}
                    <div className="mt-6 pt-4 border-t border-slate-300">
                      <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">If Sold Today</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                        <div>
                          <label className="block text-sm text-slate-600 mb-1">
                            Closing Costs (to sell):
                          </label>
                          <input
                            type="number"
                            value={saleClosingCosts}
                            onChange={(e) => setSaleClosingCosts(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="0"
                          />
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold text-slate-700">ROI if Sold Today:</span>
                          <span className={`font-bold text-xl ${roiIfSold >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {roiIfSold >= 0 ? '+' : ''}{roiIfSold.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        Formula: (YTD Net Income - Closing Costs + Total Appreciation) / Cost Basis
                      </div>
                    </div>

                    {/* Cost Basis Footer */}
                    <div className="mt-4 pt-4 border-t border-slate-300">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Cost Basis (Total Investment):</span>
                        <span className="font-semibold text-slate-900">{formatCurrency(costBasis)}</span>
                      </div>
                    </div>
                  </>
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateOnly, parseDateOnly } from "@/lib/date-only";
import { getShortPropertyName } from "@/lib/property-short-name";

type PropertyMetrics = {
  id: string;
  address: string;
  monthly_rent: number;
  lease_end: string | null;
  last_rent_paid: string;
  maintenance_pct: number;
  roi_before_tax: string;
  roi_after_tax: string;
  current_value: number;
  projected_roi: string;
  projected_net_income: number;
  ytd_net_income: number;
  current_month_rent_paid: boolean;
  performance_status: "green" | "yellow" | "red";
  maintenance_open_count: number;
  maintenance_closed_count: number;
  maintenance_red_count: number;
};

type MaintenanceRequest = {
  id: string;
  property_id: string | null;
  property_address: string;
  tenant_name: string;
  tenant_email: string;
  category: string | null;
  description: string;
  status: string;
  created_at: string;
};

type DashboardData = {
  properties: PropertyMetrics[];
  openMaintenanceRequests: MaintenanceRequest[];
  pendingPayments: {
    property_id: string;
    address: string;
    month: number;
    year: number;
    amount_due: number;
  }[];
  billingSummaryRows: DashboardBillingRow[];
};

type DashboardBillingRow = {
  id: string;
  billType: "tenant" | "owner";
  counterpartyId: string;
  counterpartyName: string;
  counterpartyEmail: string;
  propertyId: string;
  propertyAddress: string;
  dueDate: string | null;
  status: string | null;
  amount: number;
  description: string;
};

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "closed", label: "Closed" },
];

const getBillingDisplayStatus = (status?: string | null, dueDate?: string | null) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "paid") return "Paid";
  if (normalized === "processing") return "Processing";
  if (normalized === "voided") return "Voided";

  const dueDateOnly = parseDateOnly(dueDate);
  if (!dueDateOnly) return "Due";

  const now = new Date();
  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const tomorrowUtcMs = todayUtcMs + 24 * 60 * 60 * 1000;
  const dueUtcMs = dueDateOnly.getTime();

  if (dueUtcMs < todayUtcMs) return "Overdue";
  if (dueUtcMs === tomorrowUtcMs) return "Due Tomorrow";
  return "Upcoming";
};

export default function AdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dashboardMonth = useMemo(() => {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      currentMonthName: now.toLocaleString("en-US", { month: "long" }),
      nextMonthName: new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleString("en-US", { month: "long" }),
    };
  }, []);
  const currentMonthName = dashboardMonth.currentMonthName;
  const nextMonthName = dashboardMonth.nextMonthName;
  const [currentMonthPropertyFilter, setCurrentMonthPropertyFilter] = useState("all");
  const [currentMonthBillTypeFilter, setCurrentMonthBillTypeFilter] = useState("all");
  const [currentMonthStatusFilter, setCurrentMonthStatusFilter] = useState("all");
  const [nextMonthPropertyFilter, setNextMonthPropertyFilter] = useState("all");
  const [nextMonthBillTypeFilter, setNextMonthBillTypeFilter] = useState("all");
  const [selectedBillingIds, setSelectedBillingIds] = useState<string[]>([]);

  const propertyFilterOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: { id: string; label: string; title: string }[] = [];
    (data?.billingSummaryRows || []).forEach((bill) => {
      if (!bill.propertyId || seen.has(bill.propertyId)) return;
      seen.add(bill.propertyId);
      options.push({
        id: bill.propertyId,
        label: getShortPropertyName(bill.propertyAddress),
        title: bill.propertyAddress,
      });
    });
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [data?.billingSummaryRows]);

  const currentMonthBillingRows = useMemo(() => {
    if (!data?.billingSummaryRows) return [];

    const now = new Date();
    const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const currentMonthStartUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const currentMonthKey = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;

    return data.billingSummaryRows
      .map((bill) => {
        const dueDate = parseDateOnly(bill.dueDate);
        const displayStatus = getBillingDisplayStatus(bill.status, bill.dueDate);
        return {
          ...bill,
          displayStatus,
          dueDateObj: dueDate,
          shortPropertyName: getShortPropertyName(bill.propertyAddress),
        };
      })
      .filter((bill) => {
        if (!bill.dueDateObj) return false;
        const dueUtcMs = bill.dueDateObj.getTime();
        const dueMonthKey = `${bill.dueDateObj.getUTCFullYear()}-${bill.dueDateObj.getUTCMonth() + 1}`;

        if (currentMonthPropertyFilter !== "all" && bill.propertyId !== currentMonthPropertyFilter) return false;
        if (currentMonthBillTypeFilter !== "all" && bill.billType !== currentMonthBillTypeFilter) return false;
        if (currentMonthStatusFilter !== "all" && bill.displayStatus !== currentMonthStatusFilter) return false;

        return dueMonthKey === currentMonthKey || dueUtcMs < currentMonthStartUtcMs || (bill.displayStatus === "Processing" && dueUtcMs <= todayUtcMs);
      })
      .sort((a, b) => {
        const aTime = a.dueDateObj?.getTime() || 0;
        const bTime = b.dueDateObj?.getTime() || 0;
        if (aTime !== bTime) return aTime - bTime;
        return a.billType.localeCompare(b.billType);
      });
  }, [currentMonthBillTypeFilter, currentMonthPropertyFilter, currentMonthStatusFilter, data?.billingSummaryRows]);

  const nextMonthBillingRows = useMemo(() => {
    if (!data?.billingSummaryRows) return [];

    const now = new Date();
    const nextMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const nextMonthKey = `${nextMonthDate.getUTCFullYear()}-${nextMonthDate.getUTCMonth() + 1}`;

    return data.billingSummaryRows
      .map((bill) => {
        const dueDate = parseDateOnly(bill.dueDate);
        return {
          ...bill,
          displayStatus: getBillingDisplayStatus(bill.status, bill.dueDate),
          dueDateObj: dueDate,
          shortPropertyName: getShortPropertyName(bill.propertyAddress),
        };
      })
      .filter((bill) => {
        if (!bill.dueDateObj) return false;
        const dueMonthKey = `${bill.dueDateObj.getUTCFullYear()}-${bill.dueDateObj.getUTCMonth() + 1}`;
        if (dueMonthKey !== nextMonthKey) return false;
        if (nextMonthPropertyFilter !== "all" && bill.propertyId !== nextMonthPropertyFilter) return false;
        if (nextMonthBillTypeFilter !== "all" && bill.billType !== nextMonthBillTypeFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = a.dueDateObj?.getTime() || 0;
        const bTime = b.dueDateObj?.getTime() || 0;
        if (aTime !== bTime) return aTime - bTime;
        return a.billType.localeCompare(b.billType);
      });
  }, [data?.billingSummaryRows, nextMonthBillTypeFilter, nextMonthPropertyFilter]);

  const currentMonthTenantSubtotal = currentMonthBillingRows
    .filter((bill) => bill.billType === "tenant")
    .reduce((sum, bill) => sum + bill.amount, 0);
  const currentMonthOwnerSubtotal = currentMonthBillingRows
    .filter((bill) => bill.billType === "owner")
    .reduce((sum, bill) => sum + bill.amount, 0);
  const currentMonthCombinedTotal = currentMonthBillingRows.reduce((sum, bill) => sum + bill.amount, 0);
  const currentMonthSelectedSubtotal = currentMonthBillingRows
    .filter((bill) => selectedBillingIds.includes(bill.id))
    .reduce((sum, bill) => sum + bill.amount, 0);

  const nextMonthTenantSubtotal = nextMonthBillingRows
    .filter((bill) => bill.billType === "tenant")
    .reduce((sum, bill) => sum + bill.amount, 0);
  const nextMonthOwnerSubtotal = nextMonthBillingRows
    .filter((bill) => bill.billType === "owner")
    .reduce((sum, bill) => sum + bill.amount, 0);
  const nextMonthCombinedTotal = nextMonthBillingRows.reduce((sum, bill) => sum + bill.amount, 0);

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    setSelectedBillingIds((prev) => prev.filter((id) => currentMonthBillingRows.some((bill) => bill.id === id)));
  }, [currentMonthBillingRows]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/dashboard?year=${dashboardMonth.year}&month=${dashboardMonth.month}`);
      const dashboardData = await res.json();

      if (!res.ok) {
        throw new Error(dashboardData.error || "Failed to load dashboard");
      }

      setData(dashboardData);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const updateMaintenanceStatus = async (id: string, status: string) => {
    try {
      setSavingId(id);
      const res = await fetch("/api/maintenance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Failed to update");
      }

      setData((prev) =>
        prev
          ? {
              ...prev,
              openMaintenanceRequests: prev.openMaintenanceRequests.map((r) =>
                r.id === id ? { ...r, status } : r
              ),
            }
          : null
      );
    } catch (err: any) {
      setError(err.message || "Update failed");
    } finally {
      setSavingId(null);
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return (
      formatDateOnly(dateString, { month: "short", day: "numeric", year: "numeric" }) ||
      "-"
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-7xl mx-auto p-6 md:p-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Admin</p>
            <h1 className="text-3xl font-semibold text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-600 mt-1">
              Portfolio financials, maintenance requests, and user access.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push("/demo")}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Demo Mode
            </button>
            <button
              onClick={loadDashboard}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>
        </div>

        {loading && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm text-slate-600">
            Loading dashboard...
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-100 rounded-xl p-6 flex items-center justify-between text-rose-700">
            <span>{error}</span>
            <button
              onClick={loadDashboard}
              className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Properties Overview */}
            <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">Properties Overview</h2>
                <p className="text-sm text-slate-500">Financial snapshot per property.</p>
              </div>
              <div>
                <table className="w-full text-sm table-fixed">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="py-3 px-4 text-left font-medium">Property</th>
                      <th className="py-3 px-4 text-right font-medium">Monthly Rent</th>
                      <th className="py-3 px-4 text-right font-medium">Lease End</th>
                      <th className="py-3 px-4 text-center font-medium">{currentMonthName} Rent</th>
                      <th className="py-3 px-4 text-center font-medium">Maint. Requests</th>
                      <th className="py-3 px-4 text-right font-medium">Maint. % of Rent</th>
                      <th className="py-3 px-4 text-right font-medium">YTD Net Income</th>
                      <th className="py-3 px-4 text-right font-medium">Projected ROI%</th>
                      <th className="py-3 px-4 text-center font-medium">Performance</th>
                      <th className="py-3 px-4 text-right font-medium">Current Value</th>
                      <th className="py-3 px-4 text-center font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {data.properties.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-8 px-4 text-center text-slate-500">
                          No properties found.
                        </td>
                      </tr>
                    ) : (
                      data.properties.map((property, idx) => (
                        <tr key={property.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                          <td className="py-3 px-4 font-medium text-slate-900" title={property.address}>
                            {getShortPropertyName(property.address)}
                          </td>
                          <td className="py-3 px-4 text-right">{formatCurrency(property.monthly_rent)}</td>
                          <td className="py-3 px-4 text-right">{formatDate(property.lease_end)}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${property.current_month_rent_paid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {property.current_month_rent_paid ? "Yes" : "No"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {property.maintenance_open_count > 0 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800" title="Open requests">
                                  {property.maintenance_open_count} open
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                              {property.maintenance_red_count > 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700" title="Open >21 days">
                                  {property.maintenance_red_count} overdue
                                </span>
                              )}
                              {property.maintenance_closed_count > 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600" title="Closed requests">
                                  {property.maintenance_closed_count} closed
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-slate-700">
                            {property.maintenance_pct.toFixed(2)}%
                          </td>
                          <td className={`py-3 px-4 text-right font-semibold ${(property.ytd_net_income ?? 0) >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                            {formatCurrency(property.ytd_net_income ?? 0)}
                          </td>
                          <td
                            className="py-3 px-4 text-right font-semibold text-slate-800"
                            title={`Projected Net Income: ${formatCurrency(property.projected_net_income)}`}
                          >
                            {property.projected_roi}%
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              property.performance_status === "green" ? "bg-green-100 text-green-700" :
                              property.performance_status === "yellow" ? "bg-yellow-100 text-yellow-700" :
                              "bg-red-100 text-red-700"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                                property.performance_status === "green" ? "bg-green-500" :
                                property.performance_status === "yellow" ? "bg-yellow-500" :
                                "bg-red-500"
                              }`} />
                              {property.performance_status === "green" ? "Excellent" : property.performance_status === "yellow" ? "Good" : "Attention"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">{formatCurrency(property.current_value)}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-3">
                              <button
                                onClick={() => router.push(`/admin/maintenance?propertyId=${property.id}`)}
                                className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                              >
                                Maint.
                              </button>
                              <button
                                onClick={() => router.push(`/admin/financials?propertyId=${property.id}`)}
                                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                              >
                                Financials
                              </button>
                              <button
                                onClick={() => router.push(`/owner?propertyId=${property.id}`)}
                                className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                              >
                                Dashboard
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">Bills Due This Month</h2>
                <p className="text-sm text-slate-500">
                  Includes {currentMonthName} bills plus overdue unpaid carryover from prior months.
                </p>
              </div>
              <div className="px-6 py-4 border-b border-slate-200 grid gap-3 md:grid-cols-3">
                <label className="text-sm text-slate-600">
                  <span className="block mb-1 font-medium text-slate-700">Property</span>
                  <select
                    value={currentMonthPropertyFilter}
                    onChange={(e) => setCurrentMonthPropertyFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="all">All Properties</option>
                    {propertyFilterOptions.map((option) => (
                      <option key={option.id} value={option.id} title={option.title}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-600">
                  <span className="block mb-1 font-medium text-slate-700">Bill Type</span>
                  <select
                    value={currentMonthBillTypeFilter}
                    onChange={(e) => setCurrentMonthBillTypeFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="all">All Bills</option>
                    <option value="tenant">Tenant Bills</option>
                    <option value="owner">Owner Bills</option>
                  </select>
                </label>
                <label className="text-sm text-slate-600">
                  <span className="block mb-1 font-medium text-slate-700">Status</span>
                  <select
                    value={currentMonthStatusFilter}
                    onChange={(e) => setCurrentMonthStatusFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="all">All Statuses</option>
                    <option value="Upcoming">Upcoming</option>
                    <option value="Due Tomorrow">Due Tomorrow</option>
                    <option value="Processing">Processing</option>
                    <option value="Overdue">Overdue</option>
                  </select>
                </label>
              </div>
              <div className="px-6 py-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Selected Subtotal</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{formatCurrency(currentMonthSelectedSubtotal)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Tenant Bills</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{formatCurrency(currentMonthTenantSubtotal)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Owner Bills</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{formatCurrency(currentMonthOwnerSubtotal)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-900 px-4 py-3 text-white">
                  <div className="text-xs uppercase tracking-wide text-slate-300">Combined Total</div>
                  <div className="mt-1 text-xl font-semibold">{formatCurrency(currentMonthCombinedTotal)}</div>
                </div>
              </div>
              {currentMonthBillingRows.length ? (
                <div>
                  <table className="w-full text-sm table-fixed">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="py-3 px-4 text-left font-medium w-12">Select</th>
                        <th className="py-3 px-4 text-left font-medium">Property</th>
                        <th className="py-3 px-4 text-left font-medium">Bill Type</th>
                        <th className="py-3 px-4 text-left font-medium">Associated With</th>
                        <th className="py-3 px-4 text-left font-medium">Due Date</th>
                        <th className="py-3 px-4 text-left font-medium">Status</th>
                        <th className="py-3 px-4 text-right font-medium">Amount</th>
                        <th className="py-3 px-4 text-left font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {currentMonthBillingRows.map((bill, idx) => (
                        <tr key={`${bill.billType}-${bill.id}`} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                          <td className="py-3 px-4">
                            <input
                              type="checkbox"
                              checked={selectedBillingIds.includes(bill.id)}
                              onChange={(e) =>
                                setSelectedBillingIds((prev) =>
                                  e.target.checked ? [...prev, bill.id] : prev.filter((id) => id !== bill.id)
                                )
                              }
                              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                            />
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900" title={bill.propertyAddress}>
                            {bill.shortPropertyName}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${bill.billType === "tenant" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}>
                              {bill.billType === "tenant" ? "Tenant" : "Owner"}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{bill.counterpartyName}</div>
                            <div className="text-xs text-slate-500">{bill.counterpartyEmail || "—"}</div>
                          </td>
                          <td className="py-3 px-4">{formatDate(bill.dueDate)}</td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                              bill.displayStatus === "Overdue"
                                ? "bg-rose-100 text-rose-700"
                                : bill.displayStatus === "Due Tomorrow"
                                  ? "bg-amber-100 text-amber-700"
                                  : bill.displayStatus === "Processing"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-slate-100 text-slate-700"
                            }`}>
                              {bill.displayStatus}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-slate-900">{formatCurrency(bill.amount)}</td>
                          <td className="py-3 px-4 text-slate-700">{bill.description || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 text-sm text-slate-600">No actionable bills matched the current filters.</div>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">Bills Due Next Month</h2>
                <p className="text-sm text-slate-500">
                  Forecast of expected owner and tenant billing due in {nextMonthName}.
                </p>
              </div>
              <div className="px-6 py-4 border-b border-slate-200 grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-600">
                  <span className="block mb-1 font-medium text-slate-700">Property</span>
                  <select
                    value={nextMonthPropertyFilter}
                    onChange={(e) => setNextMonthPropertyFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="all">All Properties</option>
                    {propertyFilterOptions.map((option) => (
                      <option key={option.id} value={option.id} title={option.title}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-600">
                  <span className="block mb-1 font-medium text-slate-700">Bill Type</span>
                  <select
                    value={nextMonthBillTypeFilter}
                    onChange={(e) => setNextMonthBillTypeFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="all">All Bills</option>
                    <option value="owner">Owner Bills</option>
                    <option value="tenant">Tenant Bills</option>
                  </select>
                </label>
              </div>
              <div className="px-6 py-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Tenant Forecast</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{formatCurrency(nextMonthTenantSubtotal)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Owner Forecast</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{formatCurrency(nextMonthOwnerSubtotal)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-900 px-4 py-3 text-white">
                  <div className="text-xs uppercase tracking-wide text-slate-300">Combined Forecast</div>
                  <div className="mt-1 text-xl font-semibold">{formatCurrency(nextMonthCombinedTotal)}</div>
                </div>
              </div>
              {nextMonthBillingRows.length ? (
                <div>
                  <table className="w-full text-sm table-fixed">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="py-3 px-4 text-left font-medium">Property</th>
                        <th className="py-3 px-4 text-left font-medium">Bill Type</th>
                        <th className="py-3 px-4 text-left font-medium">Associated With</th>
                        <th className="py-3 px-4 text-left font-medium">Due Date</th>
                        <th className="py-3 px-4 text-right font-medium">Amount</th>
                        <th className="py-3 px-4 text-left font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {nextMonthBillingRows.map((bill, idx) => (
                        <tr key={`${bill.billType}-next-${bill.id}`} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                          <td className="py-3 px-4 font-medium text-slate-900" title={bill.propertyAddress}>
                            {bill.shortPropertyName}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${bill.billType === "tenant" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}>
                              {bill.billType === "tenant" ? "Tenant" : "Owner"}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{bill.counterpartyName}</div>
                            <div className="text-xs text-slate-500">{bill.counterpartyEmail || "—"}</div>
                          </td>
                          <td className="py-3 px-4">{formatDate(bill.dueDate)}</td>
                          <td className="py-3 px-4 text-right font-semibold text-slate-900">{formatCurrency(bill.amount)}</td>
                          <td className="py-3 px-4 text-slate-700">{bill.description || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 text-sm text-slate-600">No actionable bills are forecast for next month.</div>
              )}
            </section>
            {/* Open Maintenance Requests */}
            <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">Open Maintenance Requests</h2>
                <p className="text-sm text-slate-500">Manage active issues and update status.</p>
              </div>
              <div>
                <table className="w-full text-sm table-fixed">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="py-3 px-4 text-left font-medium">Created</th>
                      <th className="py-3 px-4 text-left font-medium">Property</th>
                      <th className="py-3 px-4 text-left font-medium">Tenant</th>
                      <th className="py-3 px-4 text-left font-medium">Category</th>
                      <th className="py-3 px-4 text-left font-medium">Description</th>
                      <th className="py-3 px-4 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {data.openMaintenanceRequests.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 px-4 text-center text-slate-500">
                          No open maintenance requests.
                        </td>
                      </tr>
                    ) : (
                      data.openMaintenanceRequests.map((request, idx) => (
                        <tr key={request.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                          <td className="py-3 px-4">
                            {new Date(request.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="py-3 px-4" title={request.property_address}>
                            {getShortPropertyName(request.property_address)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{request.tenant_name}</div>
                            <div className="text-xs text-slate-500">{request.tenant_email}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-700">
                              {request.category || "General"}
                            </span>
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            <div className="line-clamp-2 text-slate-700">{request.description}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <select
                                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
                                value={request.status}
                                onChange={(e) => updateMaintenanceStatus(request.id, e.target.value)}
                                disabled={savingId === request.id}
                              >
                                {STATUS_OPTIONS.map((s) => (
                                  <option key={s.value} value={s.value}>
                                    {s.label}
                                  </option>
                                ))}
                              </select>
                              {savingId === request.id && (
                                <span className="text-xs text-slate-500">Saving...</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

          </>
        )}
      </div>
    </div>
  );
}


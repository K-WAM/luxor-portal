"use client";

import { useEffect, useState } from "react";
import ROISpeedometer from "@/app/components/ROISpeedometer";

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

type User = {
  id: string;
  email: string;
  phone: string;
  created_at: string;
  last_sign_in: string | null;
  roles: string;
  properties: string;
  status: string;
};

type DashboardData = {
  properties: PropertyMetrics[];
  openMaintenanceRequests: MaintenanceRequest[];
  users: User[];
  pendingPayments: {
    property_id: string;
    address: string;
    month: number;
    year: number;
    amount_due: number;
  }[];
};

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "closed", label: "Closed" },
];

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/dashboard");
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
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const calculateAverageROI = () => {
    if (!data || data.properties.length === 0) return 0;
    const totalROI = data.properties.reduce(
      (sum, property) => sum + parseFloat(property.roi_before_tax),
      0
    );
    return totalROI / data.properties.length;
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
          <button
            onClick={loadDashboard}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-800"
          >
            Refresh
          </button>
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
            {/* ROI Speedometer */}
            <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Average Portfolio ROI (Pre-Tax)</h2>
                  <p className="text-sm text-slate-500">Across all properties</p>
                </div>
              </div>
              <div className="flex justify-center">
                <ROISpeedometer
                  value={calculateAverageROI()}
                  max={25}
                  zones={{
                    red: { min: 0, max: 3.9, color: "#ef4444" },
                    yellow: { min: 4, max: 5.9, color: "#eab308" },
                    green: { min: 6, max: 8, color: "#22c55e" },
                  }}
                  title=""
                  size="large"
                />
              </div>
            </section>

            {/* Properties Overview */}
            <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">Properties Overview</h2>
                <p className="text-sm text-slate-500">Financial snapshot per property.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="py-3 px-4 text-left font-medium">Property</th>
                      <th className="py-3 px-4 text-right font-medium">Monthly Rent</th>
                      <th className="py-3 px-4 text-right font-medium">Lease End</th>
                      <th className="py-3 px-4 text-right font-medium">Last Rent Paid</th>
                      <th className="py-3 px-4 text-right font-medium">Maint. % of Rent</th>
                      <th className="py-3 px-4 text-right font-medium">ROI% (Pre-Tax)</th>
                      <th className="py-3 px-4 text-right font-medium">ROI% (Post-Tax)</th>
                      <th className="py-3 px-4 text-right font-medium">Projected ROI%</th>
                      <th className="py-3 px-4 text-right font-medium">Current Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {data.properties.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 px-4 text-center text-slate-500">
                          No properties found.
                        </td>
                      </tr>
                    ) : (
                      data.properties.map((property, idx) => (
                        <tr key={property.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                          <td className="py-3 px-4 font-medium text-slate-900">{property.address}</td>
                          <td className="py-3 px-4 text-right">{formatCurrency(property.monthly_rent)}</td>
                          <td className="py-3 px-4 text-right">{formatDate(property.lease_end)}</td>
                          <td className="py-3 px-4 text-right text-slate-600">{property.last_rent_paid}</td>
                          <td className="py-3 px-4 text-right font-medium text-slate-700">
                            {property.maintenance_pct.toFixed(2)}%
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                            {property.roi_before_tax}%
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                            {property.roi_after_tax}%
                          </td>
                          <td
                            className="py-3 px-4 text-right font-semibold text-slate-800"
                            title={`Projected Net Income: ${formatCurrency(property.projected_net_income)}`}
                          >
                            {property.projected_roi}%
                          </td>
                          <td className="py-3 px-4 text-right">{formatCurrency(property.current_value)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Open Maintenance Requests */}
            <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">Open Maintenance Requests</h2>
                <p className="text-sm text-slate-500">Manage active issues and update status.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
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
                          <td className="py-3 px-4">{request.property_address}</td>
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

            {/* Pending / Late Payments */}
            <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">Pending / Late Payments</h2>
                <p className="text-sm text-slate-500">Months with no recorded rent income (current year).</p>
              </div>
              {data.pendingPayments?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="py-3 px-4 text-left font-medium">Property</th>
                        <th className="py-3 px-4 text-left font-medium">Month</th>
                        <th className="py-3 px-4 text-right font-medium">Amount Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {data.pendingPayments.map((p, idx) => (
                        <tr key={`${p.property_id}-${p.month}-${p.year}`} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                          <td className="py-3 px-4">{p.address}</td>
                          <td className="py-3 px-4">{monthNames[p.month - 1]} {p.year}</td>
                          <td className="py-3 px-4 text-right">${(p.amount_due || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 text-sm text-slate-600">No pending or late payments detected.</div>
              )}
            </section>

            {/* Users Management */}
            <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">Users & Access Management</h2>
                <p className="text-sm text-slate-500">Overview of users and their linked properties.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="py-3 px-4 text-left font-medium">Email</th>
                      <th className="py-3 px-4 text-left font-medium">Phone</th>
                      <th className="py-3 px-4 text-left font-medium">Role(s)</th>
                      <th className="py-3 px-4 text-left font-medium">Properties</th>
                      <th className="py-3 px-4 text-left font-medium">Status</th>
                      <th className="py-3 px-4 text-left font-medium">Created</th>
                      <th className="py-3 px-4 text-left font-medium">Last Sign In</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {data.users.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 px-4 text-center text-slate-500">
                          No users found.
                        </td>
                      </tr>
                    ) : (
                      data.users.map((user, idx) => (
                        <tr key={user.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                          <td className="py-3 px-4 font-medium text-slate-900">{user.email}</td>
                          <td className="py-3 px-4 text-slate-600">{user.phone || "-"}</td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                              {user.roles || "none"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-600 text-xs max-w-xs truncate">
                            {user.properties || "-"}
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                              {user.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {formatDate(user.created_at)}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {user.last_sign_in
                              ? new Date(user.last_sign_in).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })
                              : "Never"}
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

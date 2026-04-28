"use client";

import { useEffect, useMemo, useState } from "react";
import OwnerInvestmentReportsView from "@/app/components/owner/OwnerInvestmentReportsView";
import { formatDateOnly, parseDateOnly } from "@/lib/date-only";

type PaymentRow = {
  id: string;
  propertyId: string;
  propertyAddress: string;
  description: string;
  amount: number;
  dueDate: string | null;
  status: string;
  displayStatus: string;
  tenantNames: string[];
  tenantEmails: string[];
};

type MaintenanceRow = {
  id: string;
  propertyId: string;
  propertyAddress: string;
  tenantName: string;
  tenantEmail: string;
  description: string;
  status: string;
  createdAt: string | null;
  closedAt: string | null;
};

type ReportsPayload = {
  paymentRows: PaymentRow[];
  maintenanceRows: MaintenanceRow[];
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);

const getShortIssueTitle = (description: string) => {
  const normalized = String(description || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "Maintenance request";
  const sentence = normalized.split(/[.!?]/)[0]?.trim() || normalized;
  return sentence.length > 72 ? `${sentence.slice(0, 69)}...` : sentence;
};

const getPaymentFilterLabel = (value: string) => {
  switch (value) {
    case "overdue":
      return "Overdue";
    case "received":
      return "Received";
    case "future":
      return "Future";
    default:
      return "All";
  }
};

export default function OwnerReportsPage() {
  const [activeTab, setActiveTab] = useState<"investment" | "payments" | "maintenance">("investment");
  const [data, setData] = useState<ReportsPayload>({ paymentRows: [], maintenanceRows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<"all" | "overdue" | "received" | "future">("all");
  const [maintenanceFilter, setMaintenanceFilter] = useState<string>("all");
  const [expandedPayments, setExpandedPayments] = useState<Record<string, boolean>>({});
  const [expandedMaintenance, setExpandedMaintenance] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/owner/reports", { cache: "no-store" });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Failed to load reports");
        setData({
          paymentRows: payload.paymentRows || [],
          maintenanceRows: payload.maintenanceRows || [],
        });
      } catch (err: any) {
        setError(err.message || "Failed to load reports");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredPaymentRows = useMemo(() => {
    return data.paymentRows.filter((row) => {
      if (row.status === "voided" || row.displayStatus === "Voided") return false;
      if (paymentFilter === "received") return row.displayStatus === "Paid";
      if (paymentFilter === "overdue") return row.displayStatus === "Overdue";
      if (paymentFilter === "future") return row.displayStatus === "Future" || row.displayStatus === "Processing" || row.displayStatus === "Due";
      return true;
    });
  }, [data.paymentRows, paymentFilter]);

  const paymentGroups = useMemo(() => {
    const grouped = new Map<string, PaymentRow[]>();
    for (const row of filteredPaymentRows) {
      const key = row.propertyId;
      const existing = grouped.get(key) || [];
      existing.push(row);
      grouped.set(key, existing);
    }
    return Array.from(grouped.entries()).map(([propertyId, rows]) => ({
      propertyId,
      propertyAddress: rows[0]?.propertyAddress || "Property",
      rows: rows.sort((a, b) => {
        const aTime = parseDateOnly(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bTime = parseDateOnly(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      }),
    }));
  }, [filteredPaymentRows]);

  const maintenanceStatuses = useMemo(() => {
    const values = new Set<string>();
    data.maintenanceRows.forEach((row) => values.add(String(row.status || "open").toLowerCase()));
    return ["all", ...Array.from(values)];
  }, [data.maintenanceRows]);

  const filteredMaintenanceRows = useMemo(() => {
    return data.maintenanceRows.filter((row) => {
      if (maintenanceFilter === "all") return true;
      return String(row.status || "").toLowerCase() === maintenanceFilter;
    });
  }, [data.maintenanceRows, maintenanceFilter]);

  const maintenanceGroups = useMemo(() => {
    const grouped = new Map<string, MaintenanceRow[]>();
    for (const row of filteredMaintenanceRows) {
      const key = row.propertyId;
      const existing = grouped.get(key) || [];
      existing.push(row);
      grouped.set(key, existing);
    }
    return Array.from(grouped.entries()).map(([propertyId, rows]) => ({
      propertyId,
      propertyAddress: rows[0]?.propertyAddress || "Property",
      rows,
    }));
  }, [filteredMaintenanceRows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-600">Review investment performance, tenant rent payments, and maintenance activity across your properties.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-2 flex flex-wrap gap-2">
        {[
          { key: "investment", label: "Investment Performance Reports" },
          { key: "payments", label: "Tenant Payment Reports" },
          { key: "maintenance", label: "Maintenance Reports" },
        ].map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`rounded-xl px-4 py-2 text-sm font-medium ${active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {activeTab === "investment" && <OwnerInvestmentReportsView />}

      {activeTab === "payments" && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 md:p-6 space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">All Rent Payments</h2>
              <p className="text-sm text-slate-600">Grouped by property for your linked owner portfolio.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["overdue", "received", "future", "all"] as const).map((filter) => {
                const active = paymentFilter === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setPaymentFilter(filter)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium border ${active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
                  >
                    {getPaymentFilterLabel(filter)}
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">Loading payment reports...</div>
          ) : paymentGroups.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">No rent payments match the current filter.</div>
          ) : (
            <div className="space-y-3">
              {paymentGroups.map((group) => {
                const expanded = expandedPayments[group.propertyId] ?? true;
                return (
                  <div key={group.propertyId} className="rounded-xl border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedPayments((prev) => ({ ...prev, [group.propertyId]: !expanded }))}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 text-left"
                    >
                      <div>
                        <div className="font-medium text-slate-900">{group.propertyAddress}</div>
                        <div className="text-xs text-slate-500">{group.rows.length} payment record{group.rows.length === 1 ? "" : "s"}</div>
                      </div>
                      <span className="text-sm text-slate-500">{expanded ? "Hide" : "Show"}</span>
                    </button>
                    {expanded && (
                      <>
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="border-t border-slate-200 bg-white text-slate-500 uppercase text-xs tracking-wide">
                              <tr>
                                <th className="px-4 py-3 text-left font-semibold">Payment Description</th>
                                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                                <th className="px-4 py-3 text-left font-semibold">Due Date</th>
                                <th className="px-4 py-3 text-left font-semibold">Status</th>
                                <th className="px-4 py-3 text-left font-semibold">Tenant</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {group.rows.map((row) => (
                                <tr key={row.id}>
                                  <td className="px-4 py-3 text-slate-700">{row.description}</td>
                                  <td className="px-4 py-3 text-right font-medium text-slate-900">{formatCurrency(row.amount)}</td>
                                  <td className="px-4 py-3 text-slate-700">{formatDateOnly(row.dueDate) || "-"}</td>
                                  <td className="px-4 py-3 text-slate-700">{row.displayStatus}</td>
                                  <td className="px-4 py-3 text-slate-700">{row.tenantNames.length > 0 ? row.tenantNames.join(", ") : "Unassigned"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="grid grid-cols-1 gap-3 p-4 md:hidden">
                          {group.rows.map((row) => (
                            <div key={row.id} className="rounded-lg border border-slate-200 p-3">
                              <div className="font-medium text-slate-900">{row.description}</div>
                              <div className="mt-2 text-sm text-slate-700">{formatCurrency(row.amount)} · {formatDateOnly(row.dueDate) || "-"}</div>
                              <div className="mt-1 text-sm text-slate-700">{row.displayStatus}</div>
                              <div className="mt-1 text-sm text-slate-500">{row.tenantNames.length > 0 ? row.tenantNames.join(", ") : "Unassigned"}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "maintenance" && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 md:p-6 space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">All Maintenance</h2>
              <p className="text-sm text-slate-600">Grouped by property with current request status visibility.</p>
            </div>
            <select
              value={maintenanceFilter}
              onChange={(e) => setMaintenanceFilter(e.target.value)}
              className="w-full lg:w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {maintenanceStatuses.map((status) => (
                <option key={status} value={status}>
                  {status === "all" ? "All statuses" : status.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">Loading maintenance reports...</div>
          ) : maintenanceGroups.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">No maintenance requests match the current filter.</div>
          ) : (
            <div className="space-y-3">
              {maintenanceGroups.map((group) => {
                const expanded = expandedMaintenance[group.propertyId] ?? true;
                return (
                  <div key={group.propertyId} className="rounded-xl border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedMaintenance((prev) => ({ ...prev, [group.propertyId]: !expanded }))}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 text-left"
                    >
                      <div>
                        <div className="font-medium text-slate-900">{group.propertyAddress}</div>
                        <div className="text-xs text-slate-500">{group.rows.length} maintenance record{group.rows.length === 1 ? "" : "s"}</div>
                      </div>
                      <span className="text-sm text-slate-500">{expanded ? "Hide" : "Show"}</span>
                    </button>
                    {expanded && (
                      <>
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="border-t border-slate-200 bg-white text-slate-500 uppercase text-xs tracking-wide">
                              <tr>
                                <th className="px-4 py-3 text-left font-semibold">Issue</th>
                                <th className="px-4 py-3 text-left font-semibold">Opened</th>
                                <th className="px-4 py-3 text-left font-semibold">Status</th>
                                <th className="px-4 py-3 text-left font-semibold">Tenant</th>
                                <th className="px-4 py-3 text-left font-semibold">Closed</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {group.rows.map((row) => (
                                <tr key={row.id}>
                                  <td className="px-4 py-3 text-slate-700">{getShortIssueTitle(row.description)}</td>
                                  <td className="px-4 py-3 text-slate-700">{formatDateOnly(row.createdAt) || "-"}</td>
                                  <td className="px-4 py-3 text-slate-700">{row.status.replace(/_/g, " ")}</td>
                                  <td className="px-4 py-3 text-slate-700">{row.tenantName}{row.tenantEmail ? ` (${row.tenantEmail})` : ""}</td>
                                  <td className="px-4 py-3 text-slate-700">{formatDateOnly(row.closedAt) || "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="grid grid-cols-1 gap-3 p-4 md:hidden">
                          {group.rows.map((row) => (
                            <div key={row.id} className="rounded-lg border border-slate-200 p-3">
                              <div className="font-medium text-slate-900">{getShortIssueTitle(row.description)}</div>
                              <div className="mt-2 text-sm text-slate-700">Opened {formatDateOnly(row.createdAt) || "-"}</div>
                              <div className="mt-1 text-sm text-slate-700">Status: {row.status.replace(/_/g, " ")}</div>
                              <div className="mt-1 text-sm text-slate-500">{row.tenantName}{row.tenantEmail ? ` (${row.tenantEmail})` : ""}</div>
                              {row.closedAt && <div className="mt-1 text-sm text-slate-500">Closed {formatDateOnly(row.closedAt)}</div>}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

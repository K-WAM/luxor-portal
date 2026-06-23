"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDateOnly } from "@/lib/date-only";
import { useDemoMode } from "@/lib/demo/demo-context";

type OverviewRow = {
  propertyId: string;
  address: string;
  currentRent: number;
  leaseStart: string | null;
  leaseEnd: string | null;
  status: "vacant" | "occupied" | "expiring";
  tenantNames: string[];
  tenantEmails: string[];
};

type ReportsPayload = {
  overviewRows: OverviewRow[];
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);

const getInitials = (value: string) =>
  value
    .split(" ")
    .map((part) => part.trim()[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

export default function OwnerDashboard() {
  const { withDemoPath } = useDemoMode();
  const [data, setData] = useState<ReportsPayload>({ overviewRows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "vacant" | "occupied" | "expiring">("all");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/owner/reports", { cache: "no-store" });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Failed to load dashboard overview");
        setData({ overviewRows: payload.overviewRows || [] });
      } catch (err: any) {
        setError(err.message || "Failed to load dashboard overview");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const counts = useMemo(() => {
    return data.overviewRows.reduce(
      (acc, row) => {
        acc.all += 1;
        acc[row.status] += 1;
        return acc;
      },
      { all: 0, vacant: 0, occupied: 0, expiring: 0 }
    );
  }, [data.overviewRows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.overviewRows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!query) return true;
      const haystack = [row.address, ...row.tenantNames, ...row.tenantEmails].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [data.overviewRows, search, statusFilter]);


  const statusOptions = [
    { key: "vacant", label: "Vacant", count: counts.vacant, dot: "bg-rose-500" },
    { key: "occupied", label: "Occupied", count: counts.occupied, dot: "bg-emerald-500" },
    { key: "expiring", label: "Expiring", count: counts.expiring, dot: "bg-amber-400" },
    { key: "all", label: "All", count: counts.all, dot: "bg-slate-500" },
  ] as const;

  return (
    <div className="space-y-8">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 md:p-6 space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">Property / Tenant Overview</h1>
            <p className="text-sm text-slate-600 mt-1">Search by property or tenant and review active lease visibility across your portfolio.</p>
          </div>
          <Link
            href={withDemoPath("/owner/reports")}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Open Reports
          </Link>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by property address or tenant"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {statusOptions.map((option) => {
              const active = statusFilter === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setStatusFilter(option.key)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium border ${
                    active
                      ? "bg-slate-900 border-slate-900 text-white"
                      : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-white/80" : option.dot}`} />
                  <span>{option.label}</span>
                  <span className={`${active ? "text-white/80" : "text-slate-500"}`}>{option.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">Loading property overview...</div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">No properties match the current search and filter.</div>
        ) : (
          <>
            <div className="hidden lg:block">
              <table className="w-full text-sm table-fixed">
                <thead className="border-b border-slate-200 text-slate-500 uppercase text-xs tracking-wide">
                  <tr>
                    <th className="py-3 text-left font-semibold">Address</th>
                    <th className="py-3 text-left font-semibold">Rent</th>
                    <th className="py-3 text-left font-semibold">Lease Start</th>
                    <th className="py-3 text-left font-semibold">Lease End</th>
                    <th className="py-3 text-left font-semibold">Tenants</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((row) => (
                    <tr key={row.propertyId} className="align-top">
                      <td className="py-4 pr-4">
                        <div className="font-medium text-slate-900">{row.address}</div>
                        <div className="mt-1 text-xs">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
                            row.status === "occupied"
                              ? "bg-emerald-50 text-emerald-700"
                              : row.status === "expiring"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-rose-50 text-rose-700"
                          }`}>
                            {row.status === "occupied" ? "Occupied" : row.status === "expiring" ? "Expiring" : "Vacant"}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-slate-700">{formatCurrency(row.currentRent)}</td>
                      <td className="py-4 pr-4 text-slate-700">{formatDateOnly(row.leaseStart) || "-"}</td>
                      <td className="py-4 pr-4 text-slate-700">{formatDateOnly(row.leaseEnd) || "-"}</td>
                      <td className="py-4">
                        {row.tenantNames.length > 0 ? (
                          <div className="flex items-center gap-3">
                            <div className="flex -space-x-2">
                              {row.tenantNames.slice(0, 3).map((name) => (
                                <span key={name} className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-sm font-medium text-slate-700">
                                  {getInitials(name)}
                                </span>
                              ))}
                            </div>
                            <div className="text-slate-700">{row.tenantNames.join(", ")}</div>
                          </div>
                        ) : (
                          <span className="text-slate-400">No tenant assigned</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:hidden">
              {filteredRows.map((row) => (
                <div key={row.propertyId} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{row.address}</div>
                      <div className="mt-1 text-sm text-slate-600">{formatCurrency(row.currentRent)}</div>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                      row.status === "occupied"
                        ? "bg-emerald-50 text-emerald-700"
                        : row.status === "expiring"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-rose-50 text-rose-700"
                    }`}>
                      {row.status === "occupied" ? "Occupied" : row.status === "expiring" ? "Expiring" : "Vacant"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-700">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Lease Start</div>
                      <div>{formatDateOnly(row.leaseStart) || "-"}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Lease End</div>
                      <div>{formatDateOnly(row.leaseEnd) || "-"}</div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Tenants</div>
                    <div className="mt-1 text-sm text-slate-700">
                      {row.tenantNames.length > 0 ? row.tenantNames.join(", ") : "No tenant assigned"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}



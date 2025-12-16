"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";

type MaintenanceRequest = {
  id: string;
  propertyId: string | null;
  propertyAddress?: string;
  tenantName: string;
  tenantEmail: string;
  category: string | null;
  description: string;
  status: string;
  internalComments?: string;
  cost?: number;
  createdAt?: string;
  closedAt?: string;
};

export default function OwnerMaintenancePage() {
  const { user, loading: authLoading } = useAuth();
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) {
      loadRequests();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, authLoading]);

  const loadRequests = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/maintenance`, { cache: "no-store" });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to load maintenance requests");
      }
      const data = await res.json();
      setRequests(data || []);
    } catch (err: any) {
      console.error("Error loading maintenance requests:", err);
      setError(err.message || "Failed to load maintenance requests");
    } finally {
      setLoading(false);
    }
  };

  const getElapsedTime = (createdAt?: string, closedAt?: string) => {
    if (!createdAt) return "—";
    const start = new Date(createdAt);
    const end = closedAt ? new Date(closedAt) : new Date();
    const diff = end.getTime() - start.getTime();

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h`;
    return "< 1h";
  };

  const activeRequests = requests.filter((r) => r.status !== "closed");
  const closedRequests = requests.filter((r) => r.status === "closed");

  if (authLoading || loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Maintenance Requests</h1>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Maintenance Requests</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-800">Please sign in to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Maintenance Requests</h1>
      <p className="text-gray-600 mb-6">
        View maintenance requests for your properties (read-only)
      </p>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Active Requests Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-slate-800">
          Active Requests ({activeRequests.length})
        </h2>

        {activeRequests.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-gray-500">
            No active maintenance requests for your properties.
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Elapsed
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Property
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Tenant
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Cost
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {activeRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-slate-900">
                        {req.createdAt
                          ? new Date(req.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {getElapsedTime(req.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-900">
                        {req.propertyAddress || req.propertyId || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-slate-900">
                          {req.tenantName}
                        </div>
                        <div className="text-slate-500 text-xs">
                          {req.tenantEmail}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {req.category || "General"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 max-w-xs">
                        {req.description}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            req.status === "open"
                              ? "bg-yellow-100 text-yellow-800"
                              : req.status === "in_progress"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {req.status === "in_progress"
                            ? "In Progress"
                            : req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {req.cost ? `$${req.cost.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Closed Requests Section */}
      <div>
        <h2 className="text-2xl font-semibold mb-4 text-slate-800">
          Closed Requests ({closedRequests.length})
        </h2>

        {closedRequests.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-gray-500">
            No closed maintenance requests for your properties.
          </div>
        ) : (
          <div className="space-y-4">
            {closedRequests.map((req) => (
              <div
                key={req.id}
                className="bg-white rounded-lg border border-slate-200 p-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                      Property
                    </div>
                    <div className="text-sm font-medium text-slate-900">
                      {req.propertyAddress || req.propertyId || "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                      Tenant
                    </div>
                    <div className="text-sm font-medium text-slate-900">
                      {req.tenantName}
                    </div>
                    <div className="text-xs text-slate-500">{req.tenantEmail}</div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                      Category
                    </div>
                    <div className="text-sm">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {req.category || "General"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                      Date Placed
                    </div>
                    <div className="text-sm text-slate-900">
                      {req.createdAt
                        ? new Date(req.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                      Date Closed
                    </div>
                    <div className="text-sm text-slate-900">
                      {req.closedAt
                        ? new Date(req.closedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                      Resolution Time
                    </div>
                    <div className="text-sm text-slate-900">
                      {getElapsedTime(req.createdAt, req.closedAt)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                      Cost
                    </div>
                    <div className="text-sm font-medium text-slate-900">
                      {req.cost ? `$${req.cost.toFixed(2)}` : "—"}
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                    Description
                  </div>
                  <div className="text-sm text-slate-700">{req.description}</div>
                </div>

                {req.internalComments && (
                  <div className="border-t border-slate-200 pt-4">
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                      Admin Notes
                    </div>
                    <div className="text-sm text-slate-700 bg-slate-50 rounded-md p-3">
                      {req.internalComments}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

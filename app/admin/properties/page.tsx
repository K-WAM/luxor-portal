"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateOnly } from "@/lib/date-only";

type Property = {
  id: string;
  address: string;
  lease_start?: string;
  lease_end?: string;
  created_at: string;
  maintenance_open_count?: number;
  maintenance_closed_count?: number;
  maintenance_red_count?: number;
};

export default function PropertiesPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    address: "",
    leaseStart: "",
    leaseEnd: "",
  });

  useEffect(() => {
    loadProperties();
  }, []);

  const loadProperties = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/properties");
      const data = await res.json();

      if (!res.ok) throw new Error("Failed to load properties");

      setProperties(data);
    } catch (err: any) {
      setError(err.message || "Failed to load properties");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCreating(true);

    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to create property");

      setSuccess(`Property created successfully!`);
      setFormData({ address: "", leaseStart: "", leaseEnd: "" });
      await loadProperties();
    } catch (err: any) {
      setError(err.message || "Failed to create property");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this property? This will also delete all associated invites and user associations.")) return;

    try {
      const res = await fetch(`/api/properties?id=${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete property");

      await loadProperties();
    } catch (err: any) {
      setError(err.message || "Failed to delete property");
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Properties</h1>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Property Management</h1>
      <p className="text-gray-600 mb-6">
        Add new properties to the portfolio and manage existing agreements.
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

      {/* New Agreement Form */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">New Agreement</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Property Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="123 Main Street, City, State"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Lease Start Date
              </label>
              <input
                type="date"
                value={formData.leaseStart}
                onChange={(e) =>
                  setFormData({ ...formData, leaseStart: e.target.value })
                }
                className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Lease End Date
              </label>
              <input
                type="date"
                value={formData.leaseEnd}
                onChange={(e) =>
                  setFormData({ ...formData, leaseEnd: e.target.value })
                }
                className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? "Creating..." : "Add Property"}
          </button>
        </form>
      </div>

      {/* Properties List */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-xl font-semibold">All Properties</h2>
        </div>

        {properties.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No properties added yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Address
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Lease Start
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Lease End
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Maintenance
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {properties.map((property) => {
                  const openCount = property.maintenance_open_count ?? 0;
                  const closedCount = property.maintenance_closed_count ?? 0;
                  const redCount = property.maintenance_red_count ?? 0;
                  return (
                  <tr key={property.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-900 font-medium">
                      {property.address}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {property.lease_start
                        ? formatDateOnly(property.lease_start)
                        : "--"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {property.lease_end
                        ? formatDateOnly(property.lease_end)
                        : "--"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {new Date(property.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center justify-center gap-2">
                        {openCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800" title="Open requests">
                            {openCount} open
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                        {redCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700" title="Open &gt;21 days">
                            {redCount} overdue
                          </span>
                        )}
                        {closedCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600" title="Closed requests">
                            {closedCount} closed
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => router.push(`/admin/financials?propertyId=${property.id}`)}
                          className="text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Financials
                        </button>
                        <button
                          onClick={() => router.push(`/owner?propertyId=${property.id}`)}
                          className="text-purple-600 hover:text-purple-700 font-medium"
                        >
                          Dashboard
                        </button>
                        <button
                          onClick={() => handleDelete(property.id)}
                          className="text-red-600 hover:text-red-700 font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

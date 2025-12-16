"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useAuth } from "@/app/context/AuthContext";

type Property = {
  id: string;
  address: string;
  leaseStart?: string;
  leaseEnd?: string;
  role?: string;
};

type MaintenanceRequest = {
  id: string;
  propertyId: string | null;
  propertyAddress?: string;
  tenantName: string;
  tenantEmail: string;
  category: string | null;
  description: string;
  status: string;
  createdAt?: string;
};

export default function TenantMaintenance() {
  const { user, role, loading: authLoading } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [form, setForm] = useState({
    propertyId: "",
    tenantName: "",
    tenantEmail: "",
    category: "",
    description: "",
  });
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const propsRes = await fetch("/api/properties", { cache: "no-store" });
      if (!propsRes.ok) {
        const errorData = await propsRes.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to load properties");
      }
      const propsData = (await propsRes.json()) as Property[];
      setProperties(propsData || []);

      // Pre-fill form with user info and sensible default property
      setForm((prev) => {
        const defaultId =
          (prev.propertyId && propsData.some((p) => p.id === prev.propertyId))
            ? prev.propertyId
            : propsData[0]?.id || "";

        return {
          ...prev,
          tenantName: user?.user_metadata?.name || prev.tenantName || "",
          tenantEmail: user?.email || prev.tenantEmail || "",
          propertyId: defaultId,
        };
      });

      // Load maintenance requests with server-side scoping
      const requestsRes = await fetch("/api/maintenance", { cache: "no-store" });
      if (!requestsRes.ok) {
        const errorData = await requestsRes.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to load requests");
      }
      const requestsData = await requestsRes.json();
      setRequests(requestsData || []);
    } catch (err: any) {
      console.error("Error loading maintenance data:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    loadData();
  }, [authLoading, user?.id, role]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.propertyId) {
      setError("Please select a property");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit");

      await loadData();
      setForm((f) => ({ ...f, description: "", category: "" }));
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  // Show loading while auth is loading or data is loading
  if (authLoading || loading) {
    return (
      <div className="p-8 max-w-3xl">
        <h1 className="text-3xl font-bold mb-4">Request Maintenance</h1>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  // Show empty state if no properties
  if (properties.length === 0) {
    return (
      <div className="p-8 max-w-3xl">
        <h1 className="text-3xl font-bold mb-4">Request Maintenance</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <p className="text-yellow-800">
            You don't have any properties associated with your account yet.
            Please contact your property manager for access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-4">Request Maintenance</h1>
      <p className="mb-6 text-gray-700">
        Submit a new maintenance request and review your past requests.
      </p>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 mb-10 bg-white border p-4 rounded-lg">
        <div>
          <label className="block text-sm font-medium mb-1">
            Property <span className="text-red-500">*</span>
          </label>
          <select
            name="propertyId"
            value={form.propertyId}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={role === "tenant"}
          >
            <option value="">Select a property</option>
            {properties.map((prop) => (
              <option key={prop.id} value={prop.id}>
                {prop.address}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            You can only submit requests for properties you're associated with.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Category
          </label>
          <select
            name="category"
            value={form.category}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">General</option>
            <option value="plumbing">Plumbing</option>
            <option value="electrical">Electrical</option>
            <option value="appliance">Appliance</option>
            <option value="hvac">Heating / Cooling</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={4}
            placeholder="Please describe the maintenance issue in detail..."
            required
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded bg-black text-white hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Submitting..." : "Submit Request"}
        </button>
      </form>

      <h2 className="text-2xl font-semibold mb-3">Your past requests</h2>

      {requests.length === 0 ? (
        <p className="text-gray-600">No requests yet.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const property = properties.find((p) => p.id === r.propertyId);
            const statusColors: Record<string, string> = {
              open: "bg-yellow-100 text-yellow-800",
              in_progress: "bg-blue-100 text-blue-800",
              closed: "bg-green-100 text-green-800",
            };

            return (
              <div key={r.id} className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-semibold text-slate-900 mb-1">
                      {property?.address || r.propertyAddress || "Unknown property"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {r.createdAt
                        ? new Date(r.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "Date unavailable"}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      statusColors[r.status] || "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {r.status === "in_progress" ? "In Progress" : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </span>
                </div>
                <div className="text-sm text-slate-600 mb-1">
                  <span className="font-medium">{r.category || "General"}</span>
                </div>
                <p className="text-sm text-slate-700">{r.description}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

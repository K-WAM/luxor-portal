"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";

type Property = {
  id: string;
  address: string;
  leaseStart?: string;
  leaseEnd?: string;
  role: string;
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
  const { user } = useAuth();
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

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load user's properties
      const propsRes = await fetch(`/api/user/properties?userId=${user?.id}`);
      const propsData = await propsRes.json();
      if (!propsRes.ok) throw new Error("Failed to load properties");
      setProperties(propsData);

      // Pre-fill form with user info
      setForm(prev => ({
        ...prev,
        tenantName: user?.user_metadata?.name || "",
        tenantEmail: user?.email || "",
        propertyId: propsData.length === 1 ? propsData[0].id : "",
      }));

      // Load maintenance requests for user's properties
      const requestsRes = await fetch("/api/maintenance");
      const requestsData = await requestsRes.json();
      if (!requestsRes.ok) throw new Error("Failed to load requests");

      // Filter requests to only show this user's properties
      const userPropertyIds = propsData.map((p: Property) => p.id);
      const filteredRequests = requestsData.filter((r: MaintenanceRequest) =>
        userPropertyIds.includes(r.propertyId)
      );
      setRequests(filteredRequests);
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
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

  if (loading) {
    return (
      <div className="p-8 max-w-3xl">
        <h1 className="text-3xl font-bold mb-4">Request Maintenance</h1>
        <p className="text-gray-600">Loading your properties...</p>
      </div>
    );
  }

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
            const property = properties.find(p => p.id === r.propertyId);
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
                        : "—"}
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

"use client";

import { useEffect, useState } from "react";

type MaintenanceRequest = {
  id: string;
  propertyId: string | null;
  tenantName: string;
  tenantEmail: string;
  category: string | null;
  description: string;
  status: string;
  createdAt?: string;
};

export default function TenantMaintenance() {
  const [form, setForm] = useState({
    propertyId: "",
    tenantName: "",
    tenantEmail: "",
    category: "",
    description: "",
  });
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/maintenance");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        setRequests(data);
      } catch (err: any) {
        setError(err.message || "Failed to load requests");
      }
    };
    load();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit");

      setRequests((prev) => [data, ...prev]);
      setForm((f) => ({ ...f, description: "" }));
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-4">Request Maintenance</h1>
      <p className="mb-6 text-gray-700">
        Submit a new maintenance request and review your past requests.
      </p>

      {error && <p className="mb-4 text-red-500">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-4 mb-10 bg-white border p-4 rounded-lg">
        <div>
          <label className="block text-sm font-medium mb-1">
            Property ID (optional for now)
          </label>
          <input
            name="propertyId"
            value={form.propertyId}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
            placeholder="e.g. 8014 Fox St"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Your name</label>
            <input
              name="tenantName"
              value={form.tenantName}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              name="tenantEmail"
              value={form.tenantEmail}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Category (optional)
          </label>
          <select
            name="category"
            value={form.category}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
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
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
            rows={4}
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded bg-black text-white"
        >
          {loading ? "Submitting..." : "Submit Request"}
        </button>
      </form>

      <h2 className="text-2xl font-semibold mb-3">Your past requests</h2>

      {requests.length === 0 ? (
        <p className="text-gray-600">No requests yet.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="bg-white border rounded p-3">
              <div className="text-xs text-gray-500 mb-1">
                {r.createdAt
                  ? new Date(r.createdAt).toLocaleString()
                  : "—"}{" "}
                • Status:{" "}
                <span className="font-semibold uppercase">{r.status}</span>
              </div>
              <div className="font-semibold">
                {r.category || "General"} — {r.propertyId || "No property set"}
              </div>
              <p className="text-sm mt-1">{r.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "closed", label: "Closed" },
];

export default function AdminDashboard() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/maintenance");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        setRequests(data);
      } catch (err: any) {
        setError(err.message || "Failed to load maintenance requests.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      setSavingId(id);
      const res = await fetch("/api/maintenance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");

      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r))
      );
    } catch (err: any) {
      setError(err.message || "Update failed");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Admin Dashboard</h1>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      {loading ? (
        <p>Loading requests…</p>
      ) : requests.length === 0 ? (
        <p>No maintenance requests yet.</p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full border text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 border">Created</th>
                <th className="p-2 border">Property</th>
                <th className="p-2 border">Tenant</th>
                <th className="p-2 border">Category</th>
                <th className="p-2 border">Description</th>
                <th className="p-2 border">Status</th>
                <th className="p-2 border">Actions</th>
              </tr>
            </thead>

            <tbody>
              {requests.map((req) => (
                <tr key={req.id} className="border-t">
                  <td className="p-2 border">
                    {req.createdAt
                      ? new Date(req.createdAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="p-2 border">{req.propertyId || "—"}</td>
                  <td className="p-2 border">
                    <div className="font-semibold">{req.tenantName}</div>
                    <div className="text-gray-500 text-xs">
                      {req.tenantEmail}
                    </div>
                  </td>
                  <td className="p-2 border">{req.category || "General"}</td>
                  <td className="p-2 border max-w-xs">{req.description}</td>
                  <td className="p-2 border">
                    <select
                      className="border rounded px-2 py-1"
                      value={req.status}
                      onChange={(e) => updateStatus(req.id, e.target.value)}
                      disabled={savingId === req.id}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 border">
                    {savingId === req.id ? (
                      <span className="text-gray-500">Saving…</span>
                    ) : (
                      <span className="text-green-600">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

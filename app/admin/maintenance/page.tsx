"use client";

import { useEffect, useState } from "react";

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
  createdAt?: string;
  closedAt?: string;
};

export default function MaintenanceRequestsPage() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesText, setNotesText] = useState<string>("");

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
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

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      setSavingId(id);
      const res = await fetch("/api/maintenance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");

      await loadRequests();
    } catch (err: any) {
      setError(err.message || "Update failed");
    } finally {
      setSavingId(null);
    }
  };

  const saveNotes = async (id: string) => {
    try {
      setSavingId(id);
      const res = await fetch("/api/maintenance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, internalComments: notesText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save notes");

      await loadRequests();
      setEditingNotes(null);
      setNotesText("");
    } catch (err: any) {
      setError(err.message || "Failed to save notes");
    } finally {
      setSavingId(null);
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

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Maintenance Requests</h1>
        <p className="text-gray-600">Loading requests...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Maintenance Requests</h1>

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
            No active maintenance requests.
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Date Placed
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Elapsed Time
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
                        <select
                          className="text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          value={req.status}
                          onChange={(e) => updateStatus(req.id, e.target.value)}
                          disabled={savingId === req.id}
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="closed">Closed</option>
                        </select>
                        {savingId === req.id && (
                          <span className="ml-2 text-xs text-gray-500">Saving...</span>
                        )}
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
            No closed maintenance requests.
          </div>
        ) : (
          <div className="space-y-4">
            {closedRequests.map((req) => (
              <div
                key={req.id}
                className="bg-white rounded-lg border border-slate-200 p-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                      Date Placed
                    </div>
                    <div className="text-sm text-slate-900">
                      {req.createdAt
                        ? new Date(req.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
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
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                      Total Time
                    </div>
                    <div className="text-sm text-slate-900">
                      {getElapsedTime(req.createdAt, req.closedAt)}
                    </div>
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
                </div>

                <div className="mb-4">
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                    Description
                  </div>
                  <div className="text-sm text-slate-700">{req.description}</div>
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">
                    Admin Notes / Cost
                  </div>

                  {editingNotes === req.id ? (
                    <div>
                      <textarea
                        className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        rows={3}
                        placeholder="Add notes, cost details, or comments..."
                        value={notesText}
                        onChange={(e) => setNotesText(e.target.value)}
                        disabled={savingId === req.id}
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => saveNotes(req.id)}
                          disabled={savingId === req.id}
                          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
                        >
                          {savingId === req.id ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => {
                            setEditingNotes(null);
                            setNotesText("");
                          }}
                          disabled={savingId === req.id}
                          className="px-4 py-2 bg-slate-200 text-slate-700 text-sm rounded-md hover:bg-slate-300 disabled:bg-slate-100 disabled:cursor-not-allowed transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {req.internalComments ? (
                        <div className="text-sm text-slate-700 bg-slate-50 rounded-md p-3 mb-2">
                          {req.internalComments}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-400 italic mb-2">
                          No notes added yet.
                        </div>
                      )}
                      <button
                        onClick={() => {
                          setEditingNotes(req.id);
                          setNotesText(req.internalComments || "");
                        }}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        {req.internalComments ? "Edit Notes" : "Add Notes"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

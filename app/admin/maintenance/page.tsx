"use client";

import React, { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

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

type Property = { id: string; address: string };

const toDateTimeLocal = (value?: string) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const offsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
};

const toIsoString = (value?: string) => {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
};

export default function MaintenanceRequestsPage() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesText, setNotesText] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    propertyId: "",
    tenantName: "",
    tenantEmail: "",
    category: "",
    description: "",
    cost: "",
    internalComments: "",
  });

  const [editForm, setEditForm] = useState({
    propertyId: "",
    tenantName: "",
    tenantEmail: "",
    category: "",
    description: "",
    cost: "",
    status: "open",
    createdAt: "",
    closedAt: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const shortId = (id: string) => (id ? id.slice(0, 8) : "ID");
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const propsRes = await fetch("/api/properties");
      if (propsRes.ok) setProperties((await propsRes.json()) || []);
      const reqRes = await fetch("/api/maintenance");
      const reqData = await reqRes.json();
      if (!reqRes.ok) throw new Error(reqData.error || "Failed to load");
      setRequests(reqData || []);
    } catch (err: any) {
      setError(err.message || "Failed to load maintenance requests.");
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    try {
      const res = await fetch("/api/maintenance");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setRequests(data || []);
    } catch (err: any) {
      setError(err.message || "Failed to load maintenance requests.");
    }
  };

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
      await loadRequests();
    } catch (err: any) {
      setError(err.message || "Update failed");
    } finally {
      setSavingId(null);
    }
  };

  const saveNotes = async (id: string, cost?: number) => {
    try {
      setSavingId(id);
      const updateData: any = { id, internalComments: notesText };
      if (cost !== undefined) updateData.cost = cost;
      const res = await fetch("/api/maintenance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
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
  const deleteRequest = async (id: string) => {
    try {
      setSavingId(id);
      const res = await fetch("/api/maintenance", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      await loadRequests();
    } catch (err: any) {
      setError(err.message || "Failed to delete maintenance request.");
    } finally {
      setSavingId(null);
    }
  };

  const handleCreateChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setCreateForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!createForm.propertyId || !createForm.tenantName || !createForm.tenantEmail || !createForm.description) {
      setError("Please fill in all required fields");
      return;
    }
    try {
      setCreating(true);
      const payload: any = {
        propertyId: createForm.propertyId,
        tenantName: createForm.tenantName,
        tenantEmail: createForm.tenantEmail,
        category: createForm.category,
        description: createForm.description,
      };
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create request");
      const createdId = data?.id;
      if (createdId && (createForm.cost || createForm.internalComments)) {
        const patchPayload: any = { id: createdId };
        if (createForm.cost) patchPayload.cost = parseFloat(createForm.cost);
        if (createForm.internalComments) patchPayload.internalComments = createForm.internalComments;
        const patchRes = await fetch("/api/maintenance", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchPayload),
        });
        if (!patchRes.ok) {
          const patchData = await patchRes.json().catch(() => ({}));
          setError(patchData.error || "Created request, but failed to save internal notes.");
        }
      }
      setCreateForm({
        propertyId: "",
        tenantName: "",
        tenantEmail: "",
        category: "",
        description: "",
        cost: "",
        internalComments: "",
      });
      setShowCreateForm(false);
      await loadRequests();
    } catch (err: any) {
      setError(err.message || "Failed to create request");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (req: MaintenanceRequest) => {
    const fallbackPropertyId = req.propertyId || properties[0]?.id || "";
    setEditingRequestId(req.id);
    setEditForm({
      propertyId: fallbackPropertyId,
      tenantName: req.tenantName || "",
      tenantEmail: req.tenantEmail || "",
      category: req.category || "",
      description: req.description || "",
      cost: req.cost !== undefined ? req.cost.toString() : "",
      status: req.status || "open",
      createdAt: toDateTimeLocal(req.createdAt),
      closedAt: toDateTimeLocal(req.closedAt),
    });
  };

  const handleEditChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setEditForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingRequestId) return;
    if (!editForm.propertyId || !editForm.tenantName || !editForm.tenantEmail) {
      setError("Please provide property, tenant name, and tenant email.");
      return;
    }
    try {
      setSavingId(editingRequestId);
      const payload: any = {
        id: editingRequestId,
        propertyId: editForm.propertyId,
        tenantName: editForm.tenantName,
        tenantEmail: editForm.tenantEmail,
        category: editForm.category,
        description: editForm.description,
        status: editForm.status,
      };
      if (editForm.cost !== "") payload.cost = parseFloat(editForm.cost);
      const createdAtIso = toIsoString(editForm.createdAt);
      if (createdAtIso) payload.createdAt = createdAtIso;
      const closedAtIso = editForm.closedAt === "" ? null : toIsoString(editForm.closedAt);
      if (closedAtIso !== undefined) payload.closedAt = closedAtIso;
      const res = await fetch("/api/maintenance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save changes");
      await loadRequests();
      setEditingRequestId(null);
    } catch (err: any) {
      setError(err.message || "Failed to save changes.");
    } finally {
      setSavingId(null);
    }
  };

  const cancelEdit = () => setEditingRequestId(null);

  const getElapsedTime = (createdAt?: string, closedAt?: string) => {
    if (!createdAt) return "N/A";
    const start = new Date(createdAt);
    const end = closedAt ? new Date(closedAt) : new Date();
    const diff = end.getTime() - start.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h`;
    return "< 1h";
  };

  const formatDate = (value?: string) =>
    value
      ? new Date(value).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "N/A";

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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Maintenance Requests</h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          {showCreateForm ? "Cancel" : "+ New Request"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {showCreateForm && (
        <div className="mb-8 bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Create New Maintenance Request</h2>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Property <span className="text-red-500">*</span>
                </label>
                <select
                  name="propertyId"
                  value={createForm.propertyId}
                  onChange={handleCreateChange}
                  required
                  className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select property...</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.address}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <select
                  name="category"
                  value={createForm.category}
                  onChange={handleCreateChange}
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
                  Tenant Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="tenantName"
                  value={createForm.tenantName}
                  onChange={handleCreateChange}
                  required
                  className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Tenant Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="tenantEmail"
                  value={createForm.tenantEmail}
                  onChange={handleCreateChange}
                  required
                  className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Estimated Cost ($)</label>
                <input
                  type="number"
                  step="0.01"
                  name="cost"
                  value={createForm.cost}
                  onChange={handleCreateChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                name="description"
                value={createForm.description}
                onChange={handleCreateChange}
                required
                rows={3}
                className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Internal Notes</label>
              <textarea
                name="internalComments"
                value={createForm.internalComments}
                onChange={handleCreateChange}
                rows={2}
                className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? "Creating..." : "Create Request"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-slate-800">Active Requests ({activeRequests.length})</h2>
        {activeRequests.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-gray-500">No active maintenance requests.</div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Date Placed</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Elapsed Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Property</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Tenant</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {activeRequests.map((req) => (
                    <React.Fragment key={req.id}>
                      <tr className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-slate-900 font-mono">{shortId(req.id)}</td>
                        <td className="px-4 py-3 text-sm text-slate-900">{formatDate(req.createdAt)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{getElapsedTime(req.createdAt)}</td>
                        <td className="px-4 py-3 text-sm text-slate-900">{req.propertyAddress || req.propertyId || "N/A"}</td>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-medium text-slate-900">{req.tenantName}</div>
                          <div className="text-slate-500 text-xs">{req.tenantEmail}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{req.category || "General"}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 max-w-xs">{req.description}</td>
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
                          {savingId === req.id && <span className="ml-2 text-xs text-gray-500">Saving...</span>}
                        </td>
                        <td className="px-4 py-3 text-sm space-x-2 whitespace-nowrap">
                          <button
                            className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 disabled:opacity-60"
                            onClick={() => startEdit(req)}
                            disabled={savingId === req.id}
                          >
                            Edit
                          </button>
                          <button
                            className="px-3 py-1.5 rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                            onClick={() => {
                              setEditingNotes(req.id);
                              setNotesText(req.internalComments || "");
                            }}
                          >
                            {req.internalComments ? "Edit Notes" : "Add Notes"}
                          </button>
                          <button
                            className="px-3 py-1.5 rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                            onClick={() => deleteRequest(req.id)}
                            disabled={savingId === req.id}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                      {editingRequestId === req.id && (
                        <tr>
                          <td colSpan={9} className="bg-slate-50 px-4 py-3">
                            <form className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm" onSubmit={handleEditSubmit}>
                              <div className="flex flex-col gap-1">
                                <label className="font-medium">Property</label>
                                <select name="propertyId" value={editForm.propertyId} onChange={handleEditChange} className="border border-slate-300 rounded-md px-2 py-1.5" required>
                                  <option value="">Select property...</option>
                                  {properties.map((p) => (<option key={p.id} value={p.id}>{p.address}</option>))}
                                </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="font-medium">Tenant Name</label>
                                <input type="text" name="tenantName" value={editForm.tenantName} onChange={handleEditChange} className="border border-slate-300 rounded-md px-2 py-1.5" />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="font-medium">Tenant Email</label>
                                <input type="email" name="tenantEmail" value={editForm.tenantEmail} onChange={handleEditChange} className="border border-slate-300 rounded-md px-2 py-1.5" />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="font-medium">Category</label>
                                <select name="category" value={editForm.category} onChange={handleEditChange} className="border border-slate-300 rounded-md px-2 py-1.5">
                                  <option value="">General</option>
                                  <option value="plumbing">Plumbing</option>
                                  <option value="electrical">Electrical</option>
                                  <option value="appliance">Appliance</option>
                                  <option value="hvac">Heating / Cooling</option>
                                  <option value="other">Other</option>
                                </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="font-medium">Status</label>
                                <select name="status" value={editForm.status} onChange={handleEditChange} className="border border-slate-300 rounded-md px-2 py-1.5">
                                  <option value="open">Open</option>
                                  <option value="in_progress">In Progress</option>
                                  <option value="closed">Closed</option>
                                </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="font-medium">Cost ($)</label>
                                <input type="number" step="0.01" name="cost" value={editForm.cost} onChange={handleEditChange} className="border border-slate-300 rounded-md px-2 py-1.5" placeholder="0.00" />
                              </div>
                              <div className="flex flex-col gap-1 md:col-span-3">
                                <label className="font-medium">Description</label>
                                <textarea name="description" value={editForm.description} onChange={handleEditChange} className="border border-slate-300 rounded-md px-2 py-1.5" rows={2} />
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:col-span-3">
                                <div className="flex flex-col gap-1">
                                  <label className="font-medium">Created At</label>
                                  <input
                                    type="datetime-local"
                                    name="createdAt"
                                    value={editForm.createdAt}
                                    onChange={handleEditChange}
                                    className="border border-slate-300 rounded-md px-2 py-1.5"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="font-medium">Closed At</label>
                                  <input
                                    type="datetime-local"
                                    name="closedAt"
                                    value={editForm.closedAt}
                                    onChange={handleEditChange}
                                    className="border border-slate-300 rounded-md px-2 py-1.5"
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-2 md:col-span-3">
                                <button type="submit" disabled={savingId === req.id} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300">{savingId === req.id ? "Saving..." : "Save Changes"}</button>
                                <button type="button" onClick={cancelEdit} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300">Cancel</button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      )}
                      {editingNotes === req.id && (
                        <tr>
                          <td colSpan={9} className="bg-slate-50 px-4 py-3">
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
                                onClick={() => saveNotes(req.id, req.cost)}
                                disabled={savingId === req.id}
                                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
                              >
                                {savingId === req.id ? "Saving..." : "Save"}
                              </button>
                              <button
                                onClick={() => { setEditingNotes(null); setNotesText(""); }}
                                disabled={savingId === req.id}
                                className="px-4 py-2 bg-slate-200 text-slate-700 text-sm rounded-md hover:bg-slate-300 disabled:bg-slate-100 disabled:cursor-not-allowed transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <div>
        <h2 className="text-2xl font-semibold mb-4 text-slate-800">Closed Requests ({closedRequests.length})</h2>
        {closedRequests.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-gray-500">No closed maintenance requests.</div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-200">
            {closedRequests.map((req) => (
              <React.Fragment key={req.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-slate-800">
                    <span className="font-mono text-xs text-slate-500">#{shortId(req.id)}</span>
                    <span className="font-semibold">{req.propertyAddress || req.propertyId || "N/A"}</span>
                    <span className="text-slate-500">·</span>
                    <span>{req.tenantName}</span>
                    <span className="text-slate-500">·</span>
                    <span>{req.category || "General"}</span>
                    <span className="text-slate-500">·</span>
                    <span>{formatDate(req.createdAt)} → {formatDate(req.closedAt)}</span>
                    <span className="text-slate-500">·</span>
                    <span className="truncate max-w-xs">{req.description}</span>
                    {req.cost !== undefined && (
                      <>
                        <span className="text-slate-500">·</span>
                        <span>Cost: {req.cost ? `$${req.cost.toFixed(2)}` : "N/A"}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <button
                      className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 disabled:opacity-60"
                      onClick={() => startEdit(req)}
                      disabled={savingId === req.id}
                    >
                      Edit
                    </button>
                    <button
                      className="px-3 py-1.5 rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                      onClick={() => { setEditingNotes(req.id); setNotesText(req.internalComments || ""); }}
                    >
                      {req.internalComments ? "Notes" : "Add Notes"}
                    </button>
                    <button
                      className="px-3 py-1.5 rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                      onClick={() => deleteRequest(req.id)}
                      disabled={savingId === req.id}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {editingRequestId === req.id && (
                  <div className="bg-slate-50 px-4 py-3">
                    <form className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm" onSubmit={handleEditSubmit}>
                      <div className="flex flex-col gap-1">
                        <label className="font-medium">Property</label>
                        <select name="propertyId" value={editForm.propertyId} onChange={handleEditChange} className="border border-slate-300 rounded-md px-2 py-1.5" required>
                          <option value="">Select property...</option>
                          {properties.map((p) => (<option key={p.id} value={p.id}>{p.address}</option>))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-medium">Tenant Name</label>
                        <input type="text" name="tenantName" value={editForm.tenantName} onChange={handleEditChange} className="border border-slate-300 rounded-md px-2 py-1.5" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-medium">Tenant Email</label>
                        <input type="email" name="tenantEmail" value={editForm.tenantEmail} onChange={handleEditChange} className="border border-slate-300 rounded-md px-2 py-1.5" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-medium">Category</label>
                        <select name="category" value={editForm.category} onChange={handleEditChange} className="border border-slate-300 rounded-md px-2 py-1.5">
                          <option value="">General</option>
                          <option value="plumbing">Plumbing</option>
                          <option value="electrical">Electrical</option>
                          <option value="appliance">Appliance</option>
                          <option value="hvac">Heating / Cooling</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-medium">Status</label>
                        <select name="status" value={editForm.status} onChange={handleEditChange} className="border border-slate-300 rounded-md px-2 py-1.5">
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="closed">Closed</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-medium">Cost ($)</label>
                        <input type="number" step="0.01" name="cost" value={editForm.cost} onChange={handleEditChange} className="border border-slate-300 rounded-md px-2 py-1.5" placeholder="0.00" />
                      </div>
                      <div className="flex flex-col gap-1 md:col-span-3">
                        <label className="font-medium">Description</label>
                        <textarea name="description" value={editForm.description} onChange={handleEditChange} className="border border-slate-300 rounded-md px-2 py-1.5" rows={2} />
                      </div>
                      <div className="flex items-center gap-2 md:col-span-3">
                        <button type="submit" disabled={savingId === req.id} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300">{savingId === req.id ? "Saving..." : "Save Changes"}</button>
                        <button type="button" onClick={cancelEdit} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300">Cancel</button>
                      </div>
                    </form>
                  </div>
                )}
                {editingNotes === req.id && (
                  <div className="w-full px-4 pb-4">
                    <textarea className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" rows={3} placeholder="Add notes, cost details, or comments..." value={notesText} onChange={(e) => setNotesText(e.target.value)} disabled={savingId === req.id} />
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => saveNotes(req.id, req.cost)} disabled={savingId === req.id} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors">{savingId === req.id ? "Saving..." : "Save"}</button>
                      <button onClick={() => { setEditingNotes(null); setNotesText(""); }} disabled={savingId === req.id} className="px-4 py-2 bg-slate-200 text-slate-700 text-sm rounded-md hover:bg-slate-300 disabled:bg-slate-100 disabled:cursor-not-allowed transition-colors">Cancel</button>
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

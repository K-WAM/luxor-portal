"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateOnly } from "@/lib/date-only";

type LeaseAgreement = {
  id: string;
  leaseStartDate: string;
  leaseEndDate: string;
  monthlyRent: number;
  status: "upcoming" | "active" | "expired" | "terminated";
  priorLeaseId: string | null;
  notes: string | null;
  tenantIds: string[];
  tenantNames: string[];
};

type CurrentLease = {
  id: string | null;
  leaseStartDate: string | null;
  leaseEndDate: string | null;
  monthlyRent: number;
  status: "upcoming" | "active" | "expired" | "terminated";
  tenantIds: string[];
  tenantNames: string[];
  source: "lease_agreements" | "legacy_property";
  hasConflict: boolean;
};

type Property = {
  id: string;
  address: string;
  lease_start?: string;
  lease_end?: string;
  created_at: string;
  target_monthly_rent?: number;
  maintenance_open_count?: number;
  maintenance_closed_count?: number;
  maintenance_red_count?: number;
  occupancy_status?: "vacant" | "occupied" | "expiring";
  current_tenant_names?: string[];
  current_lease?: CurrentLease | null;
  lease_agreements?: LeaseAgreement[];
};

type AdminUser = {
  id: string;
  email: string;
  role: string | null;
  name: string | null;
};

type UserPropertyAssignment = {
  user_id: string;
  property_id: string;
  role: string;
};

type LeaseFormState = {
  leaseAgreementId: string | null;
  propertyId: string;
  leaseStartDate: string;
  leaseEndDate: string;
  monthlyRent: string;
  tenantIds: string[];
  notes: string;
  priorLeaseId: string | null;
};

const DEFAULT_LEASE_FORM: LeaseFormState = {
  leaseAgreementId: null,
  propertyId: "",
  leaseStartDate: "",
  leaseEndDate: "",
  monthlyRent: "",
  tenantIds: [],
  notes: "",
  priorLeaseId: null,
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);

const getStatusBadgeClass = (status?: string) => {
  switch (status) {
    case "occupied":
    case "active":
      return "bg-emerald-50 text-emerald-700";
    case "expiring":
    case "upcoming":
      return "bg-amber-50 text-amber-700";
    case "terminated":
      return "bg-rose-50 text-rose-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
};

const getLeaseStatusLabel = (status?: string) => {
  switch (status) {
    case "active":
      return "Active";
    case "upcoming":
      return "Upcoming";
    case "expired":
      return "Expired";
    case "terminated":
      return "Terminated";
    case "occupied":
      return "Occupied";
    case "expiring":
      return "Expiring";
    default:
      return "Vacant";
  }
};

const getUserLabel = (user: AdminUser) => {
  if (user.name?.trim()) return `${user.name.trim()} (${user.email})`;
  return user.email;
};

const addOneDay = (dateOnly: string) => {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

const addOneYearMinusOneDay = (dateOnly: string) => {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

export default function PropertiesPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userProperties, setUserProperties] = useState<UserPropertyAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingLease, setSavingLease] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newPropertyAddress, setNewPropertyAddress] = useState("");
  const [leaseForm, setLeaseForm] = useState<LeaseFormState>(DEFAULT_LEASE_FORM);
  const [leaseMode, setLeaseMode] = useState<"add" | "renew" | "edit">("add");
  const [expandedPropertyId, setExpandedPropertyId] = useState<string | null>(null);
  const [leaseEditorOpen, setLeaseEditorOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      await Promise.all([loadProperties(), loadUsers(), loadUserProperties()]);
    };
    load();
  }, []);

  const loadProperties = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/properties", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load properties");
      setProperties(data);
    } catch (err: any) {
      setError(err.message || "Failed to load properties");
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load users");
      setUsers(
        (data || []).filter((user: AdminUser) => user.role !== "admin" && user.role !== "viewer")
      );
    } catch (err: any) {
      setError(err.message || "Failed to load users");
    }
  };

  const loadUserProperties = async () => {
    try {
      const res = await fetch("/api/admin/user-properties", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load user property access");
      setUserProperties(
        (data || []).map((row: any) => ({
          user_id: row.user_id,
          property_id: row.property_id,
          role: row.role,
        }))
      );
    } catch (err: any) {
      setError(err.message || "Failed to load user property access");
    }
  };

  const selectedTenantOptions = useMemo(() => {
    if (!leaseForm.propertyId) return [];
    const propertyTenantIds = new Set(
      userProperties
        .filter((row) => row.property_id === leaseForm.propertyId && row.role === "tenant")
        .map((row) => row.user_id)
    );

    return users
      .filter((user) => propertyTenantIds.has(user.id))
      .sort((a, b) => getUserLabel(a).localeCompare(getUserLabel(b)));
  }, [leaseForm.propertyId, userProperties, users]);

  useEffect(() => {
    if (!leaseForm.propertyId) {
      if (leaseForm.tenantIds.length > 0) {
        setLeaseForm((prev) => ({ ...prev, tenantIds: [] }));
      }
      return;
    }

    const validTenantIds = new Set(selectedTenantOptions.map((user) => user.id));
    const filteredTenantIds = leaseForm.tenantIds.filter((tenantId) => validTenantIds.has(tenantId));
    if (filteredTenantIds.length !== leaseForm.tenantIds.length) {
      setLeaseForm((prev) => ({ ...prev, tenantIds: filteredTenantIds }));
    }
  }, [leaseForm.propertyId, leaseForm.tenantIds, selectedTenantOptions]);

  const openAddLease = (property: Property) => {
    setLeaseMode("add");
    setLeaseForm({
      leaseAgreementId: null,
      propertyId: property.id,
      leaseStartDate: "",
      leaseEndDate: "",
      monthlyRent: String(property.current_lease?.monthlyRent || property.target_monthly_rent || ""),
      tenantIds: property.current_lease?.tenantIds || [],
      notes: "",
      priorLeaseId: null,
    });
    setLeaseEditorOpen(true);
  };

  const openRenewLease = (property: Property) => {
    const priorLease = property.current_lease;
    const nextStart = priorLease?.leaseEndDate ? addOneDay(priorLease.leaseEndDate) : "";
    setLeaseMode("renew");
    setLeaseForm({
      leaseAgreementId: null,
      propertyId: property.id,
      leaseStartDate: nextStart,
      leaseEndDate: nextStart ? addOneYearMinusOneDay(nextStart) : "",
      monthlyRent: String(priorLease?.monthlyRent || property.target_monthly_rent || ""),
      tenantIds: priorLease?.tenantIds || [],
      notes: "",
      priorLeaseId: priorLease?.id || null,
    });
    setLeaseEditorOpen(true);
  };

  const openEditLease = (property: Property, agreement: LeaseAgreement) => {
    setLeaseMode("edit");
    setLeaseForm({
      leaseAgreementId: agreement.id,
      propertyId: property.id,
      leaseStartDate: agreement.leaseStartDate,
      leaseEndDate: agreement.leaseEndDate,
      monthlyRent: String(agreement.monthlyRent || ""),
      tenantIds: agreement.tenantIds || [],
      notes: agreement.notes || "",
      priorLeaseId: agreement.priorLeaseId,
    });
    setLeaseEditorOpen(true);
  };

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCreating(true);

    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: newPropertyAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create property");
      setSuccess("Property created successfully.");
      setNewPropertyAddress("");
      await loadProperties();
    } catch (err: any) {
      setError(err.message || "Failed to create property");
    } finally {
      setCreating(false);
    }
  };

  const handleSaveLease = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSavingLease(true);

    try {
      const res = await fetch("/api/admin/lease-agreements", {
        method: leaseMode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: leaseForm.leaseAgreementId,
          propertyId: leaseForm.propertyId,
          leaseStartDate: leaseForm.leaseStartDate,
          leaseEndDate: leaseForm.leaseEndDate,
          monthlyRent: leaseForm.monthlyRent,
          tenantIds: leaseForm.tenantIds,
          notes: leaseForm.notes,
          priorLeaseId: leaseForm.priorLeaseId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save lease agreement");
      setSuccess(
        leaseMode === "renew"
          ? "Lease renewed successfully."
          : leaseMode === "edit"
            ? "Lease agreement updated successfully."
            : "Lease agreement added successfully."
      );
      setLeaseEditorOpen(false);
      setLeaseForm(DEFAULT_LEASE_FORM);
      setExpandedPropertyId(leaseForm.propertyId);
      await loadProperties();
    } catch (err: any) {
      setError(err.message || "Failed to save lease agreement");
    } finally {
      setSavingLease(false);
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
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Property Management</h1>
        <p className="text-gray-600">
          Properties stay permanent. Lease agreements track rent, dates, tenants, and renewal history over time.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {success}
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-xl font-semibold mb-2">Add Property</h2>
        <p className="text-sm text-slate-500 mb-4">Create the property record first. Add or renew lease agreements separately to preserve history.</p>
        <form onSubmit={handleCreateProperty} className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">
              Property Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newPropertyAddress}
              onChange={(e) => setNewPropertyAddress(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="123 Main Street, City, State"
              required
            />
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

      {leaseEditorOpen && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-semibold">
                {leaseMode === "renew" ? "Renew Lease" : leaseMode === "edit" ? "Edit Lease" : "Add Lease"}
              </h2>
              <p className="text-sm text-slate-500">
                {leaseMode === "renew"
                  ? "Create a new lease agreement linked to the prior term. Historical leases stay unchanged."
                  : leaseMode === "edit"
                    ? "Correct the selected lease term and tenant membership without creating a new lease."
                    : "Create a new lease agreement and link tenants without overwriting prior history."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setLeaseEditorOpen(false);
                setLeaseForm(DEFAULT_LEASE_FORM);
              }}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              Close
            </button>
          </div>

          <form onSubmit={handleSaveLease} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Property</label>
                <select
                  value={leaseForm.propertyId}
                  onChange={(e) => setLeaseForm((prev) => ({ ...prev, propertyId: e.target.value }))}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 bg-white"
                  disabled={leaseMode === "edit"}
                  required
                >
                  <option value="">Select property</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.address}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Lease Start Date</label>
                <input
                  type="date"
                  value={leaseForm.leaseStartDate}
                  onChange={(e) => setLeaseForm((prev) => ({ ...prev, leaseStartDate: e.target.value }))}
                  className="w-full border border-slate-300 rounded-md px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Lease End Date</label>
                <input
                  type="date"
                  value={leaseForm.leaseEndDate}
                  onChange={(e) => setLeaseForm((prev) => ({ ...prev, leaseEndDate: e.target.value }))}
                  className="w-full border border-slate-300 rounded-md px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Monthly Rent</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={leaseForm.monthlyRent}
                  onChange={(e) => setLeaseForm((prev) => ({ ...prev, monthlyRent: e.target.value }))}
                  className="w-full border border-slate-300 rounded-md px-3 py-2"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Tenants / Lessees</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 max-h-64 overflow-y-auto">
                {selectedTenantOptions.length === 0 ? (
                  <div className="text-sm text-slate-500">
                    No tenant users are currently linked to this property. Invite or create a tenant first.
                  </div>
                ) : (
                  selectedTenantOptions.map((user) => {
                    const checked = leaseForm.tenantIds.includes(user.id);
                    return (
                      <label key={user.id} className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setLeaseForm((prev) => ({
                              ...prev,
                              tenantIds: e.target.checked
                                ? [...prev.tenantIds, user.id]
                                : prev.tenantIds.filter((tenantId) => tenantId !== user.id),
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span>{getUserLabel(user)}</span>
                      </label>
                    );
                  })
                )}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Tenant property access remains in <code>user_properties</code>. These lease links preserve lease-period reporting and renewal history.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Notes (optional)</label>
              <textarea
                value={leaseForm.notes}
                onChange={(e) => setLeaseForm((prev) => ({ ...prev, notes: e.target.value }))}
                rows={3}
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                placeholder="Corrections, renewal notes, or leasing context"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingLease}
                className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:bg-slate-400"
              >
                {savingLease
                  ? "Saving..."
                  : leaseMode === "renew"
                    ? "Create Renewal Lease"
                    : leaseMode === "edit"
                      ? "Save Lease Changes"
                      : "Create Lease Agreement"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeaseEditorOpen(false);
                  setLeaseForm(DEFAULT_LEASE_FORM);
                }}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-xl font-semibold">All Properties</h2>
        </div>

        {properties.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No properties added yet.</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {properties.map((property) => {
              const openCount = property.maintenance_open_count ?? 0;
              const closedCount = property.maintenance_closed_count ?? 0;
              const redCount = property.maintenance_red_count ?? 0;
              const currentLease = property.current_lease;
              const expanded = expandedPropertyId === property.id;
              return (
                <div key={property.id} className="p-6 space-y-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-slate-900">{property.address}</h3>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(property.occupancy_status)}`}>
                          {getLeaseStatusLabel(property.occupancy_status)}
                        </span>
                        {currentLease?.hasConflict && (
                          <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium bg-red-50 text-red-700">
                            Multiple active leases
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Current Lease Start</div>
                          <div className="text-slate-700">{formatDateOnly(currentLease?.leaseStartDate || property.lease_start) || "--"}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Current Lease End</div>
                          <div className="text-slate-700">{formatDateOnly(currentLease?.leaseEndDate || property.lease_end) || "--"}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Current Rent</div>
                          <div className="text-slate-700">{formatCurrency(currentLease?.monthlyRent || property.target_monthly_rent || 0)}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-400">Current Tenants</div>
                          <div className="text-slate-700">
                            {currentLease?.tenantNames?.length
                              ? currentLease.tenantNames.join(", ")
                              : property.current_tenant_names?.length
                                ? property.current_tenant_names.join(", ")
                                : "No tenant assigned"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedPropertyId((prev) => (prev === property.id ? null : property.id))}
                        className="px-3 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        {expanded ? "Hide Leases" : "View Leases"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openAddLease(property)}
                        className="px-3 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Add Lease
                      </button>
                      <button
                        type="button"
                        onClick={() => openRenewLease(property)}
                        className="px-3 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Renew Lease
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(`/admin/financials?propertyId=${property.id}`)}
                        className="px-3 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Edit Property
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(property.id)}
                        className="px-3 py-2 rounded-md border border-red-200 text-sm text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {openCount > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800" title="Open requests">
                        {openCount} open
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">No open maintenance</span>
                    )}
                    {redCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700" title="Open >21 days">
                        {redCount} overdue
                      </span>
                    )}
                    {closedCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600" title="Closed requests">
                        {closedCount} closed
                      </span>
                    )}
                  </div>

                  {expanded && (
                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">
                        Lease History
                      </div>
                      {property.lease_agreements && property.lease_agreements.length > 0 ? (
                        <div className="divide-y divide-slate-100">
                          {property.lease_agreements.map((agreement) => (
                            <div key={agreement.id} className="px-4 py-4 grid grid-cols-1 lg:grid-cols-[1.1fr_0.8fr_0.9fr_1.1fr_auto] gap-4 text-sm">
                              <div>
                                <div className="text-xs uppercase tracking-wide text-slate-400">Lease Term</div>
                                <div className="text-slate-900 font-medium">
                                  {formatDateOnly(agreement.leaseStartDate)} - {formatDateOnly(agreement.leaseEndDate)}
                                </div>
                                {agreement.priorLeaseId && (
                                  <div className="text-xs text-slate-500 mt-1">Renewal linked to prior lease</div>
                                )}
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-slate-400">Monthly Rent</div>
                                <div className="text-slate-900 font-medium">{formatCurrency(agreement.monthlyRent)}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-slate-400">Status</div>
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${getStatusBadgeClass(agreement.status)}`}>
                                  {getLeaseStatusLabel(agreement.status)}
                                </span>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-slate-400">Tenants</div>
                                <div className="text-slate-700">
                                  {agreement.tenantNames.length > 0 ? agreement.tenantNames.join(", ") : "No tenants linked"}
                                </div>
                                {agreement.notes && (
                                  <div className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{agreement.notes}</div>
                                )}
                              </div>
                              <div className="flex items-start justify-start lg:justify-end">
                                <button
                                  type="button"
                                  onClick={() => openEditLease(property, agreement)}
                                  className="px-3 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  Edit Lease
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="px-4 py-4 text-sm text-slate-500">
                          No lease agreements yet. Legacy property lease fields will still display until a lease agreement is added.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

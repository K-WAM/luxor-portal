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
  owner_id?: string | null;
  owner_email?: string | null;
};

type OwnerOption = {
  id: string;
  email: string;
};

export default function PropertiesPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [editForm, setEditForm] = useState({
    address: "",
    leaseStart: "",
    leaseEnd: "",
    ownerId: "",
  });

  const [formData, setFormData] = useState({
    address: "",
    leaseStart: "",
    leaseEnd: "",
    ownerId: "",
  });

  useEffect(() => {
    loadProperties();
    loadOwners();
  }, []);

  const loadProperties = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/properties");
      const data = await res.json();

      if (!res.ok) throw new Error("Failed to load properties");

      const userRes = await fetch("/api/admin/user-properties");
      const userData = await userRes.json();
      if (!userRes.ok) throw new Error(userData.error || "Failed to load owner data");

      const ownerRows = (userData || []).filter((row: any) => row.role === "owner");
      const ownerMap = new Map<string, string>();
      ownerRows.forEach((row: any) => {
        if (row.property_id && row.user_id) {
          ownerMap.set(row.property_id, row.user_id);
        }
      });

      const usersRes = await fetch("/api/admin/users");
      const usersData = await usersRes.json();
      if (!usersRes.ok) throw new Error(usersData.error || "Failed to load users");
      const userEmailMap = new Map<string, string>();
      (usersData || []).forEach((u: any) => {
        if (u.id) userEmailMap.set(u.id, u.email || u.id);
      });

      setProperties(
        (data || []).map((property: any) => {
          const ownerId = ownerMap.get(property.id) || null;
          return {
            ...property,
            owner_id: ownerId,
            owner_email: ownerId ? userEmailMap.get(ownerId) || ownerId : null,
          };
        })
      );
    } catch (err: any) {
      setError(err.message || "Failed to load properties");
    } finally {
      setLoading(false);
    }
  };

  const loadOwners = async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load owners");
      const ownerOptions =
        (data || [])
          .filter((u: any) => u.role === "owner")
          .map((u: any) => ({ id: u.id, email: u.email || u.id })) || [];
      setOwners(ownerOptions);
    } catch (err: any) {
      setError(err.message || "Failed to load owners");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCreating(true);

    try {
      if (!formData.ownerId) {
        throw new Error("Owner is required");
      }
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to create property");

      const propertyId = data.id as string;

      const assocRes = await fetch("/api/admin/user-properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: formData.ownerId, propertyId, role: "owner" }),
      });
      const assocData = await assocRes.json();
      if (!assocRes.ok) {
        await fetch(`/api/properties?id=${propertyId}`, { method: "DELETE" });
        throw new Error(assocData.error || "Failed to assign owner");
      }

      setSuccess(`Property created successfully!`);
      setFormData({ address: "", leaseStart: "", leaseEnd: "", ownerId: "" });
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

  const openEdit = (property: Property) => {
    setEditingProperty(property);
    setEditForm({
      address: property.address,
      leaseStart: property.lease_start || "",
      leaseEnd: property.lease_end || "",
      ownerId: property.owner_id || "",
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProperty) return;
    setError(null);
    setSuccess(null);
    setCreating(true);

    try {
      if (!editForm.ownerId) {
        throw new Error("Owner is required");
      }
      const res = await fetch(`/api/properties?id=${editingProperty.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: editForm.address,
          leaseStart: editForm.leaseStart,
          leaseEnd: editForm.leaseEnd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update property");

      // Replace owner association for this property
      const existingOwnerId = editingProperty.owner_id;
      if (existingOwnerId && existingOwnerId !== editForm.ownerId) {
        await fetch(`/api/admin/user-properties?userId=${existingOwnerId}&propertyId=${editingProperty.id}`, {
          method: "DELETE",
        });
      }
      if (!existingOwnerId || existingOwnerId !== editForm.ownerId) {
        const assocRes = await fetch("/api/admin/user-properties", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: editForm.ownerId, propertyId: editingProperty.id, role: "owner" }),
        });
        const assocData = await assocRes.json();
        if (!assocRes.ok) throw new Error(assocData.error || "Failed to assign owner");
      }

      setSuccess("Property updated successfully!");
      setEditingProperty(null);
      await loadProperties();
    } catch (err: any) {
      setError(err.message || "Failed to update property");
    } finally {
      setCreating(false);
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
                Owner <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.ownerId}
                onChange={(e) =>
                  setFormData({ ...formData, ownerId: e.target.value })
                }
                className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select owner...</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.email}
                  </option>
                ))}
              </select>
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
                    Owner
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {properties.map((property) => (
                  <tr key={property.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {property.address}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {property.owner_email || "--"}
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
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => openEdit(property)}
                          className="text-slate-700 hover:text-slate-900 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => router.push(`/admin/properties/${property.id}/financials`)}
                          className="text-blue-600 hover:text-blue-700 font-medium"
                        >
                          View Financials
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingProperty && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-slate-200 w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Edit Property</h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Property Address</label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Owner</label>
                <select
                  value={editForm.ownerId}
                  onChange={(e) => setEditForm({ ...editForm, ownerId: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2"
                  required
                >
                  <option value="">Select owner...</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Lease Start Date</label>
                  <input
                    type="date"
                    value={editForm.leaseStart}
                    onChange={(e) => setEditForm({ ...editForm, leaseStart: e.target.value })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Lease End Date</label>
                  <input
                    type="date"
                    value={editForm.leaseEnd}
                    onChange={(e) => setEditForm({ ...editForm, leaseEnd: e.target.value })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingProperty(null)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
                >
                  {creating ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

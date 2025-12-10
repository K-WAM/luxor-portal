"use client";

import { useEffect, useState } from "react";

type Property = {
  id: string;
  address: string;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  ownership_percentage?: number;
  token: string;
  status: string;
  expires_at: string;
  created_at: string;
  accepted_at?: string;
  properties?: {
    id: string;
    address: string;
  };
  inviteUrl?: string;
};

export default function TenantInvitesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    email: "",
    propertyId: "",
    role: "tenant",
    ownershipPercentage: "",
  });

  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [propsRes, invitesRes] = await Promise.all([
        fetch("/api/properties"),
        fetch("/api/invites"),
      ]);

      const propsData = await propsRes.json();
      const invitesData = await invitesRes.json();

      if (!propsRes.ok) throw new Error("Failed to load properties");
      if (!invitesRes.ok) throw new Error("Failed to load invites");

      setProperties(propsData);
      setInvites(invitesData);
    } catch (err: any) {
      setError(err.message || "Failed to load data");
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
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to create invite");

      setSuccess(`Invite created! Share this link: ${data.inviteUrl}`);
      setFormData({ email: "", propertyId: "", role: "tenant", ownershipPercentage: "" });
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to create invite");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this invite?")) return;

    try {
      const res = await fetch(`/api/invites?id=${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete invite");

      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to delete invite");
    }
  };

  const copyInviteLink = (token: string) => {
    const inviteUrl = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      accepted: "bg-green-100 text-green-800",
      expired: "bg-red-100 text-red-800",
    };

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          styles[status] || "bg-gray-100 text-gray-800"
        }`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">User Invites</h1>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">User Invites</h1>
      <p className="text-gray-600 mb-6">
        Invite tenants or owners to create accounts and associate them with properties.
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

      {/* Create Invite Form */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Create New Invite</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="user@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Property <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.propertyId}
                onChange={(e) =>
                  setFormData({ ...formData, propertyId: e.target.value })
                }
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
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Role <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.role}
                onChange={(e) =>
                  setFormData({ ...formData, role: e.target.value, ownershipPercentage: "" })
                }
                className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="tenant">Tenant</option>
                <option value="owner">Owner</option>
              </select>
            </div>

            {formData.role === "owner" && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Ownership Percentage <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="100"
                  value={formData.ownershipPercentage}
                  onChange={(e) =>
                    setFormData({ ...formData, ownershipPercentage: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="50.00"
                  required={formData.role === "owner"}
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? "Creating..." : "Create Invite"}
          </button>
        </form>
      </div>

      {/* Invites List */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-xl font-semibold">All Invites</h2>
        </div>

        {invites.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No invites created yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Property
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Ownership
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Expires
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {invites.map((invite) => (
                  <tr key={invite.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {invite.email}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {invite.properties?.address || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        invite.role === 'owner' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {invite.role.charAt(0).toUpperCase() + invite.role.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {invite.role === 'owner' && invite.ownership_percentage
                        ? `${invite.ownership_percentage}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {getStatusBadge(invite.status)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {new Date(invite.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {new Date(invite.expires_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        {invite.status === "pending" && (
                          <button
                            onClick={() => copyInviteLink(invite.token)}
                            className="text-blue-600 hover:text-blue-700 font-medium"
                          >
                            {copiedToken === invite.token
                              ? "Copied!"
                              : "Copy Link"}
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(invite.id)}
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
    </div>
  );
}

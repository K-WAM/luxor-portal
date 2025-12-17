// app/admin/tenants/page.tsx
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

type UserRow = {
  id: string;
  email: string | null;
  role: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
};

type UserPropertyAccess = {
  user_id: string;
  property_id: string;
  role: string;
  ownership_percentage?: number | null;
  properties?: {
    id: string;
    address?: string;
    name?: string | null;
  } | null;
};

export default function TenantInvitesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userProperties, setUserProperties] = useState<UserPropertyAccess[]>([]);
  const [userPropertyMap, setUserPropertyMap] = useState<Record<string, UserPropertyAccess[]>>({});
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [savingAccessUserId, setSavingAccessUserId] = useState<string | null>(null);
  const [savingOwnershipKey, setSavingOwnershipKey] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    email: "",
    propertyId: "",
    role: "tenant",
    ownershipPercentage: "",
  });

  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [accessForm, setAccessForm] = useState<Record<string, { propertyId: string; role: string; ownershipPercentage?: string }>>({});
  const [ownershipEdits, setOwnershipEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [propsRes, invitesRes, usersRes, userPropsRes] = await Promise.all([
        fetch("/api/properties"),
        fetch("/api/invites"),
        fetch("/api/admin/users"),
        fetch("/api/admin/user-properties"),
      ]);

      const propsData = await propsRes.json();
      const invitesData = await invitesRes.json();
      const usersData = await usersRes.json();
      const userPropsData = await userPropsRes.json();

      if (!propsRes.ok) throw new Error("Failed to load properties");
      if (!invitesRes.ok) throw new Error("Failed to load invites");
      if (!usersRes.ok) throw new Error("Failed to load users");
      if (!userPropsRes.ok) throw new Error("Failed to load user properties");

      setProperties(propsData);
      setInvites(invitesData);
      setUsers(usersData);
      setUserProperties(userPropsData);
      const grouped = (userPropsData || []).reduce(
        (acc: Record<string, UserPropertyAccess[]>, item: UserPropertyAccess) => {
          acc[item.user_id] = acc[item.user_id] ? [...acc[item.user_id], item] : [item];
          return acc;
        },
        {}
      );
      setUserPropertyMap(grouped);
      setUsersLoading(false);
    } catch (err: any) {
      setError(err.message || "Failed to load data");
      setUsersLoading(false);
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

  const handleUserRoleUpdate = async (userId: string, role: string) => {
    setError(null);
    setSuccess(null);
    setSavingUserId(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user");
      setSuccess(`Updated role for ${data.email || "user"}`);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to update user");
    } finally {
      setSavingUserId(null);
    }
  };

  const handleAccessFormChange = (userId: string, field: "propertyId" | "role" | "ownershipPercentage", value: string) => {
    setAccessForm((prev) => ({
      ...prev,
      [userId]: {
        propertyId: prev[userId]?.propertyId || "",
        role: prev[userId]?.role || "owner",
        ownershipPercentage: prev[userId]?.ownershipPercentage || "",
        [field]: value,
      },
    }));
  };

  const handleAddAccess = async (userId: string) => {
    setError(null);
    setSuccess(null);
    const form = accessForm[userId] || { propertyId: "", role: "owner", ownershipPercentage: "" };
    if (!form.propertyId || !form.role) {
      setError("Select a property and role to add access.");
      return;
    }
    if (form.role === "owner") {
      const pct = parseFloat(form.ownershipPercentage || "");
      if (isNaN(pct) || pct <= 0 || pct > 100) {
        setError("Enter a valid ownership percentage between 0 and 100.");
        return;
      }
    }
    try {
      setSavingAccessUserId(userId);
      const res = await fetch("/api/admin/user-properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          propertyId: form.propertyId,
          role: form.role,
          ownershipPercentage: form.role === "owner" ? form.ownershipPercentage : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add access");
      setSuccess("Access added.");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to add access");
    } finally {
      setSavingAccessUserId(null);
    }
  };

  const handleOwnershipUpdate = async (userId: string, propertyId: string, value: string) => {
    setError(null);
    setSuccess(null);
    const pct = value === "" ? null : parseFloat(value);
    if (pct !== null && (isNaN(pct) || pct < 0 || pct > 100)) {
      setError("Enter a valid ownership percentage between 0 and 100.");
      return;
    }
    const key = `${userId}-${propertyId}`;
    try {
      setSavingOwnershipKey(key);
      const res = await fetch("/api/admin/user-properties", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, propertyId, ownershipPercentage: pct }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update ownership");
      setSuccess("Ownership updated.");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to update ownership");
    } finally {
      setSavingOwnershipKey(null);
    }
  };

  const handleRemoveAccess = async (userId: string, propertyId: string) => {
    setError(null);
    setSuccess(null);
    try {
      setSavingAccessUserId(userId);
      const res = await fetch(`/api/admin/user-properties?userId=${userId}&propertyId=${propertyId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove access");
      setSuccess("Access removed.");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to remove access");
    } finally {
      setSavingAccessUserId(null);
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

  const visibleInvites = invites.filter((inv) => (inv.status || "").toLowerCase() !== "accepted");

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">User Invites</h1>
      <p className="text-gray-600 mb-6">
        Invite tenants, owners, admins, or viewers to create accounts and associate them with properties.
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
              <p className="mt-1 text-xs text-slate-500">
                Required for all invites (schema enforced). For admins/viewers, pick any property to attach.
              </p>
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
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Admin sees everything; Viewer is a demo role with masked data.
              </p>
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
                {visibleInvites.map((invite) => (
                  <tr key={invite.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {invite.email}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {invite.properties?.address || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          invite.role === "owner"
                            ? "bg-purple-100 text-purple-800"
                            : invite.role === "admin"
                              ? "bg-amber-100 text-amber-800"
                              : invite.role === "viewer"
                                ? "bg-slate-200 text-slate-800"
                                : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {invite.role.charAt(0).toUpperCase() + invite.role.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {invite.role === "owner" && invite.ownership_percentage
                        ? `${invite.ownership_percentage}%`
                        : "-"}
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
                            {copiedToken === invite.token ? "Copied!" : "Copy Link"}
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

      {/* Existing Users (edit roles and property access) */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden mt-8">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Existing Users</h2>
            <p className="text-sm text-slate-600">View and update user roles and property access.</p>
          </div>
        </div>

        {usersLoading ? (
          <div className="p-6 text-center text-gray-500">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Properties & Ownership
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Last Sign-in
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-900">{user.email || "-"}</td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        defaultValue={user.role || ""}
                        onChange={(e) => handleUserRoleUpdate(user.id, e.target.value)}
                        className="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white"
                        disabled={savingUserId === user.id}
                      >
                        <option value="">Select role</option>
                        <option value="tenant">Tenant</option>
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      <div className="flex flex-col gap-2">
                        {(userPropertyMap[user.id] || []).length === 0 && (
                          <span className="text-xs text-slate-500">No properties</span>
                        )}
                        {(userPropertyMap[user.id] || []).map((up) => {
                          const key = `${up.user_id}-${up.property_id}`;
                          const ownershipValue =
                            ownershipEdits[key] ??
                            (up.ownership_percentage !== null && up.ownership_percentage !== undefined
                              ? String(up.ownership_percentage)
                              : "");
                          return (
                            <div
                              key={key}
                              className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1"
                            >
                              <span className="text-xs text-slate-800">
                                {up.properties?.address || up.properties?.name || up.property_id}
                              </span>
                              {up.role === "owner" && (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-20"
                                    value={ownershipValue}
                                    onChange={(e) =>
                                      setOwnershipEdits((prev) => ({
                                        ...prev,
                                        [key]: e.target.value,
                                      }))
                                    }
                                    placeholder="%"
                                  />
                                  <button
                                    onClick={() =>
                                      handleOwnershipUpdate(
                                        up.user_id,
                                        up.property_id,
                                        ownershipValue
                                      )
                                    }
                                    disabled={savingOwnershipKey === key}
                                    className="text-[11px] px-2 py-1 rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                                    type="button"
                                  >
                                    {savingOwnershipKey === key ? "Saving..." : "Save"}
                                  </button>
                                </div>
                              )}
                              <button
                                onClick={() => handleRemoveAccess(user.id, up.property_id)}
                                disabled={savingAccessUserId === user.id}
                                className="ml-auto text-slate-400 hover:text-red-600 text-xs"
                                title="Remove access"
                                type="button"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-col gap-2">
                        <div className="text-xs text-slate-500">
                          ID: {user.id.slice(0, 6)}...
                          {savingUserId === user.id && " Saving..."}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white"
                            value={accessForm[user.id]?.propertyId || ""}
                            onChange={(e) =>
                              handleAccessFormChange(user.id, "propertyId", e.target.value)
                            }
                          >
                            <option value="">Add property...</option>
                            {properties.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.address}
                              </option>
                            ))}
                          </select>
                          <select
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white"
                            value={accessForm[user.id]?.role || "owner"}
                            onChange={(e) =>
                              handleAccessFormChange(user.id, "role", e.target.value)
                            }
                          >
                            <option value="owner">Owner</option>
                            <option value="tenant">Tenant</option>
                            <option value="admin">Admin</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          {accessForm[user.id]?.role === "owner" && (
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-24"
                              placeholder="% owned"
                              value={accessForm[user.id]?.ownershipPercentage || ""}
                              onChange={(e) =>
                                handleAccessFormChange(user.id, "ownershipPercentage", e.target.value)
                              }
                            />
                          )}
                          <button
                            onClick={() => handleAddAccess(user.id)}
                            className="text-xs px-3 py-1 rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                            disabled={savingAccessUserId === user.id}
                          >
                            {savingAccessUserId === user.id ? "Saving..." : "Add access"}
                          </button>
                        </div>
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
